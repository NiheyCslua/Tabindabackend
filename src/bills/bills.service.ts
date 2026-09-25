import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { mapBillToFrontend } from './bills.mapper';

type BillItemPayload = {
  productId?: string;
  productName?: string;
  productSku?: string;
  serialNumber?: string;
  serialNumbers?: string[];
  quantity: number;
  unitPrice?: number;
  taxRate?: number;
  discount?: number;
};

type BillPayload = {
  billNumber?: string;
  billType?: 'CREDIT' | 'DEBIT';
  vendorId?: string;
  items?: BillItemPayload[];
  status?: string;
  date?: string;
  dueDate?: string;
  paidAt?: string;
  notes?: string;
  createdBy?: string;
};

const includeBill = { vendor: true, items: { include: { product: true } } };

// Collect all unique serial numbers from a bill item payload
const collectSerialNumbers = (item: BillItemPayload): string[] => {
  const raw = [
    item.serialNumber,
    ...(Array.isArray(item.serialNumbers) ? item.serialNumbers : []),
  ];
  const result: string[] = [];
  for (const s of raw) {
    const v = String(s ?? '').trim();
    if (v && !result.includes(v)) result.push(v);
  }
  return result;
};

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

  private validateBillType(billType?: string): 'CREDIT' | 'DEBIT' {
    if (billType === 'DEBIT') return 'DEBIT';
    return 'CREDIT';
  }

  private validateStatus(status?: string) {
    const s = String(status || 'unpaid').toLowerCase();
    if (!['paid', 'unpaid', 'partially_paid', 'overdue', 'cancelled'].includes(s)) {
      throw new BadRequestException('Invalid bill status');
    }
    return s;
  }

  private paidAtForStatus(status: string, currentPaidAt?: Date | null, requestedPaidAt?: string) {
    if (status === 'paid') {
      return requestedPaidAt ? new Date(requestedPaidAt) : currentPaidAt || new Date();
    }
    return null;
  }

  private async loadProducts(items: BillItemPayload[] = []) {
    const ids = [...new Set(items.map(i => i.productId).filter(Boolean))] as string[];
    if (!ids.length) return new Map<string, any>();
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    const map = new Map<string, any>(products.map(p => [p.id, p]));
    for (const id of ids) if (!map.has(id)) throw new NotFoundException(`Product not found: ${id}`);
    return map;
  }

  private calculateItems(items: BillItemPayload[], productsById: Map<string, any>) {
    let subtotal = 0;
    let taxAmount = 0;
    let discountAmount = 0;

    const itemsData = items.map(item => {
      if (!item.quantity || Number(item.quantity) <= 0) throw new BadRequestException('Quantity must be greater than 0');
      const product = item.productId ? productsById.get(item.productId) : undefined;
      const serials = collectSerialNumbers(item);
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice ?? product?.costPrice ?? product?.sellingPrice ?? 0);
      const itemSubtotal = quantity * unitPrice;
      const taxRate = Number(item.taxRate || 0);
      const discount = Number(item.discount || 0);
      const itemTax = itemSubtotal * (taxRate / 100);
      const itemDiscount = itemSubtotal * (discount / 100);
      const total = itemSubtotal + itemTax - itemDiscount;
      subtotal += itemSubtotal;
      taxAmount += itemTax;
      discountAmount += itemDiscount;
      return {
        productId: item.productId || null,
        productName: item.productName || product?.name || '',
        productSku: item.productSku || product?.sku || item.productId || '',
        serials,
        quantity,
        unitPrice,
        taxRate,
        discount,
        total,
      };
    });

    return { itemsData, subtotal, taxAmount, discountAmount, amount: subtotal + taxAmount - discountAmount };
  }

  // Determine if a product is serialized by checking if it has any SerialUnit records
  private async isSerializedProduct(prisma: any, productId: string): Promise<boolean> {
    if (!productId) return false;
    const count = await prisma.serialUnit.count({ where: { productId } });
    return count > 0;
  }

  /**
   * Apply inventory increases after a bill is created/updated.
   * - Serialized products: upsert each serial as AVAILABLE, then sync quantity = count(AVAILABLE)
   * - Non-serialized products: increment quantity by bill item quantity
   */
  private async applyInventoryIncrease(
    prisma: any,
    bill: any,
    itemsData: Array<{
      productId: string | null;
      productName: string;
      productSku: string;
      serials: string[];
      quantity: number;
      unitPrice: number;
    }>,
  ) {
    for (const item of itemsData) {
      if (!item.productId) continue;

      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) continue;

      if (item.serials.length > 0) {
        // Serialized product: upsert each serial as AVAILABLE
        for (const serialNumber of item.serials) {
          await prisma.serialUnit.upsert({
            where: { serialNumber },
            create: {
              serialNumber,
              productId: item.productId,
              productName: item.productName || product.name,
              productSku: item.productSku || product.sku,
              barcode: product.barcode || '',
              vendorId: bill.vendorId || null,
              vendorName: bill.vendor?.name || null,
              purchaseDate: bill.date || new Date(),
              costPrice: item.unitPrice,
              status: 'in_stock',
              purchaseBillId: bill.id,
              purchaseBillNumber: bill.billNumber,
              purchaseUnitPrice: item.unitPrice,
            },
            update: {
              // If it already exists (e.g. returned), mark it available again
              status: 'in_stock',
              purchaseBillId: bill.id,
              purchaseBillNumber: bill.billNumber,
              purchaseUnitPrice: item.unitPrice,
            },
          });
        }
        // Sync quantity = count of AVAILABLE serials for this product
        const availableCount = await prisma.serialUnit.count({
          where: { productId: item.productId, status: 'in_stock' },
        });
        await prisma.product.update({
          where: { id: item.productId },
          data: { quantity: availableCount },
        });
      } else {
        // Non-serialized product: simply increment quantity
        await prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
      }
    }
  }

  /**
   * Reverse inventory increases that were applied by a previous bill save.
   * Used when editing a bill (we reverse the old bill's impact then re-apply the new one).
   */
  private async reverseInventoryIncrease(
    prisma: any,
    billId: string,
    existingItems: any[],
  ) {
    for (const item of existingItems) {
      if (!item.productId) continue;

      // Find serials that were added by this bill
      const billSerials = await prisma.serialUnit.findMany({
        where: { productId: item.productId, purchaseBillId: billId, status: 'in_stock' },
      });

      if (billSerials.length > 0) {
        // Serialized: remove the in_stock serials that came from this bill
        await prisma.serialUnit.deleteMany({
          where: {
            productId: item.productId,
            purchaseBillId: billId,
            status: 'in_stock',
          },
        });
        // Re-sync quantity
        const availableCount = await prisma.serialUnit.count({
          where: { productId: item.productId, status: 'in_stock' },
        });
        await prisma.product.update({
          where: { id: item.productId },
          data: { quantity: availableCount },
        });
      } else {
        // Non-serialized: decrement
        await prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }
  }

  async createBill(data: BillPayload) {
    if (!data.vendorId) throw new BadRequestException('Vendor is required');
    if (!data.billNumber?.trim()) throw new BadRequestException('Bill number is required');
    const vendor = await this.prisma.vendor.findUnique({ where: { id: data.vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!data.items || !data.items.length) throw new BadRequestException('Bill must have at least one item');

    // Check per-vendor duplicate — not blocked, just surfaced as a warning in the response
    const duplicate = await this.prisma.bill.findFirst({
      where: { vendorId: data.vendorId, billNumber: data.billNumber.trim() },
    });
    const duplicateWarning = duplicate
      ? `A bill with number "${data.billNumber.trim()}" already exists for this vendor.`
      : null;

    const products = await this.loadProducts(data.items);
    const { itemsData, subtotal, taxAmount, discountAmount, amount } = this.calculateItems(data.items, products);
    const status = this.validateStatus(data.status);

    const billItemsCreate = itemsData.map(({ serials, ...rest }) => ({
      ...rest,
      serialNumbers: serials.length > 0 ? serials : undefined,
      serialNumber: serials.length === 1 ? serials[0] : undefined,
    }));

    const bill = await this.prisma.$transaction(async (prisma) => {
      const created = await prisma.bill.create({
        data: {
          billNumber: data.billNumber!.trim(),
          billType: this.validateBillType(data.billType),
          vendorId: data.vendorId!,
          subtotal,
          taxAmount,
          discountAmount,
          amount,
          paidAmount: 0,
          balanceAmount: amount,
          status,
          paidAt: this.paidAtForStatus(status, null, data.paidAt),
          date: data.date ? new Date(data.date) : new Date(),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes || '',
          createdBy: data.createdBy || '',
          items: { create: billItemsCreate },
        },
        include: { ...includeBill, vendor: true },
      });

      await this.applyInventoryIncrease(prisma, created, itemsData);

      // Reload with full include for mapping
      return prisma.bill.findUnique({ where: { id: created.id }, include: includeBill });
    });

    const mapped = mapBillToFrontend(bill);
    return duplicateWarning ? { ...mapped, duplicateWarning } : mapped;
  }

  async getBillById(id: string) {
    const bill = await this.prisma.bill.findUnique({ where: { id }, include: includeBill });
    if (!bill) throw new NotFoundException('Bill not found');
    return mapBillToFrontend(bill);
  }

  async updateBill(id: string, data: BillPayload) {
    const existing = await this.prisma.bill.findUnique({ where: { id }, include: includeBill });
    if (!existing) throw new NotFoundException('Bill not found');

    const vendorId = data.vendorId ?? existing.vendorId;
    if (!await this.prisma.vendor.findUnique({ where: { id: vendorId } })) throw new NotFoundException('Vendor not found');

    // If bill number is changing, check for duplicate — warn only, never block
    const newBillNumber = data.billNumber?.trim() ?? existing.billNumber;
    let duplicateWarning: string | null = null;
    if (newBillNumber !== existing.billNumber) {
      const duplicate = await this.prisma.bill.findFirst({
        where: { vendorId, billNumber: newBillNumber, NOT: { id } },
      });
      if (duplicate) {
        duplicateWarning = `A bill with number "${newBillNumber}" already exists for this vendor.`;
      }
    }

    const items = data.items || existing.items.map((i: any) => ({
      productId: i.productId || undefined,
      productName: i.productName,
      productSku: i.productSku || undefined,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate,
      discount: i.discount,
      serialNumbers: [],
    }));

    const products = await this.loadProducts(items);
    const { itemsData, subtotal, taxAmount, discountAmount, amount } = this.calculateItems(items, products);
    const status = data.status ? this.validateStatus(data.status) : existing.status;
    const paidAt = data.status || data.paidAt !== undefined
      ? this.paidAtForStatus(status, existing.paidAt, data.paidAt)
      : existing.paidAt;

    const billItemsCreate = itemsData.map(({ serials, ...rest }) => ({
      ...rest,
      serialNumbers: serials.length > 0 ? serials : undefined,
      serialNumber: serials.length === 1 ? serials[0] : undefined,
    }));

    const bill = await this.prisma.$transaction(async (prisma) => {
      // Reverse the inventory effect of the old bill
      await this.reverseInventoryIncrease(prisma, id, existing.items);

      await prisma.billItem.deleteMany({ where: { billId: id } });

      const updated = await prisma.bill.update({
        where: { id },
        data: {
          billNumber: newBillNumber,
          billType: data.billType ? this.validateBillType(data.billType) : existing.billType,
          vendorId,
          subtotal,
          taxAmount,
          discountAmount,
          amount,
          status,
          paidAt,
          date: data.date ? new Date(data.date) : existing.date,
          dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
          notes: data.notes ?? existing.notes,
          createdBy: data.createdBy ?? existing.createdBy,
          items: { create: billItemsCreate },
        },
        include: { ...includeBill, vendor: true },
      });

      // Apply the new bill's inventory increase
      await this.applyInventoryIncrease(prisma, updated, itemsData);

      return prisma.bill.findUnique({ where: { id: updated.id }, include: includeBill });
    });

    const mapped = mapBillToFrontend(bill);
    return duplicateWarning ? { ...mapped, duplicateWarning } : mapped;
  }

  async updateBillStatus(id: string, status: string) {
    const existing = await this.prisma.bill.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bill not found');

    const normalizedStatus = this.validateStatus(status);
    const bill = await this.prisma.bill.update({
      where: { id },
      data: {
        status: normalizedStatus,
        paidAt: this.paidAtForStatus(normalizedStatus, existing.paidAt),
      },
      include: includeBill,
    });
    return mapBillToFrontend(bill);
  }

  async deleteBill(id: string, deletedBy?: string) {
    const existing = await this.prisma.bill.findUnique({ where: { id }, include: includeBill });
    if (!existing) throw new NotFoundException('Bill not found');

    return this.prisma.$transaction(async (prisma) => {
      // Reverse inventory: remove serials from this bill and adjust quantities
      await this.reverseInventoryIncrease(prisma, id, existing.items);
      return mapBillToFrontend(
        await prisma.bill.delete({ where: { id }, include: includeBill })
      );
    });
  }

  async getAllBills() {
    return (await this.prisma.bill.findMany({ include: includeBill, orderBy: { createdAt: 'desc' } })).map(mapBillToFrontend);
  }
}
