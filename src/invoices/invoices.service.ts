import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { mapInvoiceToFrontend } from './invoices.mapper';
import { InvoiceStatus, InvoiceType } from '@prisma/client';
import { FinancialAccountsService, CREDIT_CARD_ACCOUNTS } from 'src/financial-accounts/financial-accounts.service';

type InvoiceItemPayload = {
  productId?: string;
  productName: string;
  productSku?: string;
  // Invoice Product Description (Editable Per Line Item). The frontend
  // copies this from the Product's description when the line is added and
  // lets the user edit it freely — the backend just stores whatever it's
  // sent, exactly like termsAndConditions. Never re-derived from the
  // Product Master here.
  productDescription?: string;
  serialNumber?: string;
  serialNumbers?: string[];
  quantity: number;
  unitPrice?: number;
  taxRate?: number;
  discount?: number;
};

type InvoicePayload = {
  customerId?: string;
  customerName: string;
  // "Customer Number" in the UI. Optional, always taken as-sent — never
  // re-derived from the Customer relation, so a manual per-invoice edit
  // or a manually-entered customer both work the same way.
  customerPhone?: string;
  // Phase – Sales Improvements: PRODUCT (default) or SERVICE. Set once at
  // creation — an invoice's fundamental type never changes via edit, same
  // as how a Product Invoice can't retroactively become a Service Invoice.
  invoiceType?: InvoiceType | string;
  items: InvoiceItemPayload[];
  paymentMethod?: string;
  bankAccount?: string;
  // Preferred: the real FinancialAccount.id from the shared selector.
  // `bankAccount` (a name) is still accepted for backward compatibility.
  financialAccountId?: string;
  template?: string;
  // Invoice Terms & Conditions (Editable Per Invoice). Set once at creation
  // from the selected template's default text (see the frontend), then
  // owned entirely by the invoice — never re-derived from the template
  // afterwards, even on update.
  termsAndConditions?: string;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
  // Purchase Order number — purely optional, printed as a "PO" heading
  // only when present.
  poNumber?: string;
  createdBy?: string;
  shippingCost?: number | string;
  status?: InvoiceStatus | string;
  paidAt?: string;
};

type BuiltInvoiceItem = {
  productId: string | null;
  productName: string;
  productSku: string | null;
  productDescription: string | null;
  serialNumber: string | null;
  serialNumbers: string[];
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  total: number;
};

const includeInvoice = { items: true, customer: true };

const normalizeSerial = (serial: unknown) => String(serial ?? '').trim();

const collectSerialNumbers = (item: InvoiceItemPayload): string[] => {
  const raw = [
    item.serialNumber,
    ...(Array.isArray(item.serialNumbers) ? item.serialNumbers : []),
  ];
  const serials: string[] = [];
  for (const serial of raw) {
    const value = normalizeSerial(serial);
    if (!value) continue;
    if (!serials.includes(value)) serials.push(value);
  }
  return serials;
};

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private financialAccounts: FinancialAccountsService,
  ) {}

  // Bank Transfer, Cheque and Credit Card all route through a Financial
  // Account (Chart of Accounts Corrections — Change 2). Cash maps
  // automatically elsewhere and never needs a selector. Credit Card is
  // limited to the shared CREDIT_CARD_ACCOUNTS list — enforced here as well
  // as in the UI so the API can't be used to bypass it.
  private async resolveInvoiceAccount(data: InvoicePayload): Promise<{ financialAccountId: string | null; bankAccountName: string | null }> {
    const needsAccount = data.paymentMethod === 'bank_transfer' || data.paymentMethod === 'credit_card' || data.paymentMethod === 'cheque';
    if (!needsAccount) return { financialAccountId: null, bankAccountName: null };

    const idOrName = data.financialAccountId || data.bankAccount;
    if (!idOrName) {
      if (data.paymentMethod === 'credit_card') {
        throw new BadRequestException(`Credit Card payments require a financial account (${CREDIT_CARD_ACCOUNTS.join(', ')})`);
      }
      return { financialAccountId: null, bankAccountName: null };
    }

    const account = await this.financialAccounts.resolveAccount(idOrName);
    if (!account) throw new BadRequestException('Invalid financial account');

    if (data.paymentMethod === 'credit_card' && !CREDIT_CARD_ACCOUNTS.includes(account.name)) {
      throw new BadRequestException(`Credit Card payments can only use: ${CREDIT_CARD_ACCOUNTS.join(', ')}`);
    }

    return { financialAccountId: account.id, bankAccountName: account.name };
  }

  private normalizeStatus(status?: InvoiceStatus | string): InvoiceStatus {
    const value = String(status || InvoiceStatus.PENDING).toUpperCase();
    if (!Object.values(InvoiceStatus).includes(value as InvoiceStatus)) {
      throw new BadRequestException('Invalid invoice status');
    }
    return value as InvoiceStatus;
  }

  private normalizeInvoiceType(invoiceType?: InvoiceType | string): InvoiceType {
    const value = String(invoiceType || InvoiceType.PRODUCT).toUpperCase();
    if (!Object.values(InvoiceType).includes(value as InvoiceType)) {
      throw new BadRequestException('Invalid invoice type');
    }
    return value as InvoiceType;
  }

  private paidAtForStatus(status: InvoiceStatus, currentPaidAt?: Date | null, requestedPaidAt?: string) {
    if (status === InvoiceStatus.PAID) {
      return requestedPaidAt ? new Date(requestedPaidAt) : currentPaidAt || new Date();
    }
    return null;
  }

  private async buildItems(items: InvoiceItemPayload[] = [], isEdit = false, invoiceType: InvoiceType = InvoiceType.PRODUCT) {
    if (!items.length) throw new BadRequestException('Invoice must have at least one item');
    const isService = invoiceType === InvoiceType.SERVICE;

    let subtotal = 0, taxAmount = 0, discountAmount = 0, total = 0;
    const itemsData: BuiltInvoiceItem[] = [];
    const seenSerials = new Set<string>();

    for (const item of items) {
      // Change 5 (No Inventory Impact): Service Invoice lines never touch
      // Product/inventory, regardless of what the client sends — enforced
      // here, not just left to the frontend not sending a productId.
      let product: any = null;
      if (item.productId && !isService) {
        product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      }
      if (!isService && !product && !item.productName) throw new NotFoundException('Product not found');
      if (isService && !item.productName?.trim()) throw new BadRequestException('Service description is required');

      // Allow Negative Inventory During Invoice Creation: products remain
      // sellable regardless of current stock. Inventory is still deducted
      // normally below (buildItems only computes totals; the actual
      // decrement happens in decrementInventory/incrementInventory) and is
      // allowed to go negative — it is never clamped to zero and never
      // blocks the sale. Serial number availability validation is
      // unaffected by this and still runs in validateScannedSerials.

      const quantity = Number(item.quantity || 1);
      if (quantity <= 0) throw new BadRequestException('Quantity must be greater than 0');

      const serialNumbers = collectSerialNumbers(item);
      if (serialNumbers.length > 0 && serialNumbers.length !== quantity) {
        throw new BadRequestException(
          `Scanned serial count (${serialNumbers.length}) must match quantity (${quantity}) for ${item.productName || product?.name || 'this item'}`,
        );
      }

      for (const serial of serialNumbers) {
        if (seenSerials.has(serial)) throw new BadRequestException(`Serial number ${serial} is duplicated on this invoice`);
        seenSerials.add(serial);
      }

      const unitPrice = Number(item.unitPrice ?? product?.sellingPrice ?? 0);
      const itemSubtotal = unitPrice * quantity;
      const taxRate = Number(item.taxRate || 0);
      const discount = Number(item.discount || 0);
      const itemTax = itemSubtotal * (taxRate / 100);
      const itemDiscount = itemSubtotal * (discount / 100);
      const itemTotal = itemSubtotal + itemTax - itemDiscount;

      subtotal += itemSubtotal;
      taxAmount += itemTax;
      discountAmount += itemDiscount;
      total += itemTotal;

      itemsData.push({
        productId: isService ? null : (item.productId || null),
        productName: item.productName || product?.name || '',
        productSku: isService ? null : (item.productSku || product?.sku || item.productId || ''),
        // Never derived from product?.description here — the frontend
        // already copied it in when the line was added (or the user
        // edited/cleared it). Storing exactly what was sent, same as
        // Invoice.termsAndConditions. Always null for Service lines.
        productDescription: isService ? null : (item.productDescription !== undefined ? (item.productDescription || null) : null),
        serialNumber: serialNumbers.length === 1 ? serialNumbers[0] : null,
        serialNumbers,
        quantity,
        unitPrice,
        taxRate,
        discount,
        total: itemTotal,
      });
    }

    return { itemsData, subtotal, taxAmount, discountAmount, total };
  }

  private async validateScannedSerials(prisma: any, items: BuiltInvoiceItem[], _invoiceId?: string) {
    const serials = items.flatMap(i => i.serialNumbers);
    if (!serials.length) return;

    const units = await prisma.serialUnit.findMany({ where: { serialNumber: { in: serials } } });
    const bySerial = new Map(units.map((u: any) => [u.serialNumber, u]));

    for (const item of items) {
      for (const serialNumber of item.serialNumbers) {
        const unit = bySerial.get(serialNumber) as any;
        if (!unit) {
          // Serial not found — either never existed or already sold (deleted)
          throw new BadRequestException(`Serial number ${serialNumber} is not available in inventory`);
        }
        if (item.productId && unit.productId !== item.productId) {
          throw new BadRequestException(
            `Serial number ${serialNumber} belongs to ${unit.productName || 'another product'}, not ${item.productName}`,
          );
        }
        if (unit.status !== 'in_stock') {
          throw new BadRequestException(`Serial number ${serialNumber} is not available in stock`);
        }
      }
    }
  }

  /**
   * Mark serials as SOLD by deleting them from the database.
   * Syncs product quantity = count of remaining in_stock serials.
   */
  private async markSerialsSoldAndSyncQty(prisma: any, _invoice: any, items: BuiltInvoiceItem[]) {
    const affectedProductIds = new Set<string>();

    for (const item of items) {
      for (const serialNumber of item.serialNumbers) {
        // Delete the serial — no need to keep sold records
        await prisma.serialUnit.deleteMany({ where: { serialNumber } });
        if (item.productId) affectedProductIds.add(item.productId);
      }
    }

    // Sync quantity for serialized products
    for (const productId of affectedProductIds) {
      const availableCount = await prisma.serialUnit.count({
        where: { productId, status: 'in_stock' },
      });
      await prisma.product.update({
        where: { id: productId },
        data: { quantity: availableCount },
      });
    }
  }

  /**
   * Restore serials on invoice edit/delete.
   * Since sold serials are now deleted, there is nothing to restore for serialized products —
   * the quantity will be re-synced from remaining in_stock units.
   * We still need to restore quantity for non-serialized products.
   */
  private async restoreSerialsAndSyncQty(prisma: any, invoiceId: string) {
    // Sold serials are deleted so there's nothing to un-delete.
    // Return an empty Set — the caller will handle non-serialized qty restoration.
    // Clear any stale saleInvoiceId references that may exist from old data
    await prisma.serialUnit.updateMany({
      where: { saleInvoiceId: invoiceId },
      data: {
        status: 'in_stock',
        saleInvoiceId: null,
        saleInvoiceNumber: null,
        soldAt: null,
        customerId: null,
        customerName: null,
        saleUnitPrice: null,
      },
    });
    return new Set<string>();
  }

  async createInvoice(data: InvoicePayload) {
    const invoiceType = this.normalizeInvoiceType(data.invoiceType);
    const totals = await this.buildItems(data.items, false, invoiceType);
    const shippingCost = Math.max(0, Number(data.shippingCost) || 0);
    const status = this.normalizeStatus(data.status);
    const paidAt = this.paidAtForStatus(status, null, data.paidAt);
    const account = await this.resolveInvoiceAccount(data);

    const invoice = await this.prisma.$transaction(async (prisma) => {
      await this.validateScannedSerials(prisma, totals.itemsData);

      const created = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}`,
          customerId: data.customerId || null,
          customerName: data.customerName,
          customerPhone: data.customerPhone?.trim() || null,
          invoiceType,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          shippingCost,
          total: totals.total + shippingCost,
          status,
          paidAt,
          paymentMethod: data.paymentMethod || 'cash',
          bankAccount: account.bankAccountName,
          financialAccountId: account.financialAccountId,
          template: data.template,
          // Change 7: Service Invoices never have Terms & Conditions,
          // regardless of what's sent — same "enforce server-side, don't
          // just trust the frontend to omit it" approach as productId above.
          termsAndConditions: invoiceType === InvoiceType.SERVICE ? null : (data.termsAndConditions ?? null),
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes,
          poNumber: data.poNumber?.trim() || null,
          createdBy: data.createdBy,
          items: { create: totals.itemsData },
        },
        include: includeInvoice,
      });

      // Non-serialized products: decrement quantity manually
      for (const item of totals.itemsData) {
        if (item.productId && item.serialNumbers.length === 0) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }

      // Serialized products: mark serials SOLD and sync quantity
      await this.markSerialsSoldAndSyncQty(prisma, created, totals.itemsData);

      return created;
    });

    return mapInvoiceToFrontend(invoice);
  }

  async updateInvoice(id: string, data: InvoicePayload) {
    const existing = await this.prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw new NotFoundException('Invoice not found');

    // invoiceType is immutable after creation — always use the existing
    // invoice's type here, never data.invoiceType, so a Service Invoice
    // can't accidentally become a Product Invoice (or vice versa) via edit.
    const totals = await this.buildItems(data.items, true, existing.invoiceType);
    const shippingCost = Math.max(0, Number(data.shippingCost) || 0);
    const status = data.status ? this.normalizeStatus(data.status) : existing.status;
    const paidAt = data.status || data.paidAt !== undefined
      ? this.paidAtForStatus(status, existing.paidAt, data.paidAt)
      : existing.paidAt;
    const account = await this.resolveInvoiceAccount(data);

    const invoice = await this.prisma.$transaction(async (prisma) => {
      // Step 1: Sold serials are deleted — nothing to un-delete for serialized products.
      // Clear any stale saleInvoiceId references (legacy data).
      await this.restoreSerialsAndSyncQty(prisma, id);

      // Step 2: Restore quantity for non-serialized products that were on the old invoice
      for (const item of existing.items) {
        if (!item.productId) continue;
        const serialCount = await prisma.serialUnit.count({ where: { productId: item.productId } });
        const isNonSerialized = serialCount === 0;
        if (isNonSerialized) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      await this.validateScannedSerials(prisma, totals.itemsData, id);
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          customerId: data.customerId || null,
          customerName: data.customerName,
          ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone?.trim() || null } : {}),
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          shippingCost,
          total: totals.total + shippingCost,
          status,
          paidAt,
          paymentMethod: data.paymentMethod,
          bankAccount: account.bankAccountName,
          financialAccountId: account.financialAccountId,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes,
          ...(data.poNumber !== undefined ? { poNumber: data.poNumber?.trim() || null } : {}),
          // Change 4: editing an invoice keeps Terms & Conditions editable,
          // affecting only this invoice. Only touch the column if the
          // caller actually sent a value, so partial updates elsewhere
          // (e.g. status-only changes) never blank it out. Change 7:
          // Service Invoices never have Terms & Conditions, full stop —
          // existing.invoiceType is used since invoiceType is immutable.
          ...(existing.invoiceType === InvoiceType.SERVICE
            ? { termsAndConditions: null }
            : data.termsAndConditions !== undefined ? { termsAndConditions: data.termsAndConditions } : {}),
          items: { create: totals.itemsData },
        },
        include: includeInvoice,
      });

      // Non-serialized: decrement
      for (const item of totals.itemsData) {
        if (item.productId && item.serialNumbers.length === 0) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }

      // Serialized: mark sold + sync
      await this.markSerialsSoldAndSyncQty(prisma, updated, totals.itemsData);

      return updated;
    });

    return mapInvoiceToFrontend(invoice);
  }

  async updateInvoiceStatus(id: string, status: InvoiceStatus | string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const normalizedStatus = this.normalizeStatus(status);
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: normalizedStatus,
        paidAt: this.paidAtForStatus(normalizedStatus, invoice.paidAt),
      },
      include: includeInvoice,
    });

    return mapInvoiceToFrontend(updated);
  }

  async getAllInvoices() {
    const invoices = await this.prisma.invoice.findMany({
      include: includeInvoice,
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map(mapInvoiceToFrontend);
  }

  async getInvoiceById(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: includeInvoice });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return mapInvoiceToFrontend(invoice);
  }

  async markAsPaid(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.status === InvoiceStatus.PAID && invoice.paidAt) {
      return mapInvoiceToFrontend(
        await this.prisma.invoice.findUnique({ where: { id }, include: includeInvoice })
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: invoice.paidAt || new Date() },
      include: includeInvoice,
    });
    return mapInvoiceToFrontend(updated);
  }

  async deleteInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.prisma.$transaction(async (prisma) => {
      // Sold serials are permanently deleted — nothing to restore for serialized products.
      // Only restore quantity for non-serialized products.
      for (const item of invoice.items) {
        if (!item.productId) continue;
        const serialCount = await prisma.serialUnit.count({ where: { productId: item.productId } });
        const isNonSerialized = serialCount === 0;
        if (isNonSerialized) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
      return prisma.invoice.delete({ where: { id } });
    });
  }
}
