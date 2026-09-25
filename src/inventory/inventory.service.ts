import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { mapProductToFrontend } from './inventory.mapper';

type ProductPayload = {
  sku?: string;
  name?: string;
  description?: string;
  upc?: string;
  barcode?: string;
  serialNumber?: string;
  serialNumbers?: string[];
  vendorId?: string;
  vendorName?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  costPrice?: number;
  sellingPrice?: number;
  taxRate?: number;
  quantity?: number;
  reorderLevel?: number;
  maxStock?: number;
  status?: string;
  image?: string;
  images?: unknown;
  variants?: unknown;
};

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private buildProductData(data: ProductPayload, requireName = false) {
    const out: any = {};

    for (const key of [
      'sku', 'name', 'description', 'upc', 'barcode', 'serialNumber',
      'vendorId', 'vendorName', 'category', 'subcategory', 'brand', 'status', 'image',
    ] as const) {
      if (data[key] !== undefined) out[key] = data[key];
    }

    for (const key of [
      'costPrice', 'sellingPrice', 'taxRate', 'quantity',
      'reorderLevel', 'maxStock',
    ] as const) {
      if (data[key] !== undefined) out[key] = Number(data[key]);
    }

    if (!out.barcode && data.upc) out.barcode = data.upc;
    if (!out.upc && data.barcode) out.upc = data.barcode;

    if (Array.isArray(data.serialNumbers)) {
      const serialNumbers = data.serialNumbers
        .map((s) => String(s).trim())
        .filter(Boolean);
      out.serialNumbers = serialNumbers as any;
      if (!out.serialNumber && serialNumbers.length > 0) {
        out.serialNumber = serialNumbers[0];
      }
    }

    if (data.images !== undefined) out.images = data.images as any;
    if (data.variants !== undefined) out.variants = data.variants as any;

    if (!out.sku && data.name) {
      out.sku = `${data.name}-${Date.now()}`.replace(/\s+/g, '-').toUpperCase();
    }

    if (requireName && !out.name) {
      throw new BadRequestException('Product name is required');
    }

    return out;
  }

  private async ensureProductCategory(name?: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const productCategory = (this.prisma as any).productCategory;
    const existing = await productCategory.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) return existing;
    return productCategory.create({ data: { name: trimmed } });
  }

  /**
   * Upsert SerialUnit records for the given serial numbers and product, then
   * sync the product's quantity to the number of AVAILABLE (in_stock) units.
   * Called after product create or update when serialNumbers are provided.
   */
  private async syncSerialUnits(
    prisma: any,
    product: any,
    incomingSerials: string[],
  ) {
    if (incomingSerials.length === 0) return;

    for (const serialNumber of incomingSerials) {
      await prisma.serialUnit.upsert({
        where: { serialNumber },
        create: {
          serialNumber,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          barcode: product.barcode || '',
          costPrice: Number(product.costPrice || 0),
          status: 'in_stock',
        },
        update: {
          // Only update if it currently belongs to this product; never override a sold unit
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
        },
      });
    }

    // Sync quantity = number of AVAILABLE serials for this product
    const availableCount = await prisma.serialUnit.count({
      where: { productId: product.id, status: 'in_stock' },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { quantity: availableCount },
    });

    return availableCount;
  }

  async getProductCategories() {
    const savedCategories = await (this.prisma as any).productCategory.findMany({
      orderBy: { name: 'asc' },
    });

    const products = await this.prisma.product.findMany({
      select: { category: true },
      where: { category: { not: '' } },
    });

    const byName = new Map<string, any>();
    for (const cat of savedCategories) {
      const name = String(cat.name || '').trim();
      if (!name) continue;
      byName.set(name.toLowerCase(), cat);
    }
    for (const product of products) {
      const name = String(product.category || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byName.has(key)) byName.set(key, { id: key, name, createdAt: null, updatedAt: null });
    }

    return Array.from(byName.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async createProductCategory(data: { name?: string }) {
    const name = String(data?.name || '').trim();
    if (!name) throw new BadRequestException('Category name is required');
    return this.ensureProductCategory(name);
  }

  private static readonly UNCATEGORIZED = 'Uncategorized';

  /**
   * Deletes a category and reassigns any products currently using it to
   * "Uncategorized" (never leaves a product's category pointing at
   * something that no longer exists in the picker). `name` is matched
   * case-insensitively since the category list the frontend shows can
   * include "phantom" categories that only ever existed as a product's
   * free-text value and were never saved as their own ProductCategory row
   * (see getProductCategories) — deleting one of those has nothing to
   * remove from ProductCategory, but still needs to reassign products.
   */
  async deleteProductCategory(name: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new BadRequestException('Category name is required');
    if (trimmed.toLowerCase() === InventoryService.UNCATEGORIZED.toLowerCase()) {
      throw new BadRequestException('"Uncategorized" cannot be deleted — products reassigned here would have nowhere to go');
    }

    await this.ensureProductCategory(InventoryService.UNCATEGORIZED);

    const { count } = await this.prisma.product.updateMany({
      where: { category: { equals: trimmed, mode: 'insensitive' } },
      data: { category: InventoryService.UNCATEGORIZED },
    });

    const existing = await (this.prisma as any).productCategory.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) {
      await (this.prisma as any).productCategory.delete({ where: { id: existing.id } });
    }

    return { success: true, reassignedProductCount: count };
  }

  /**
   * Duplicate SKUs are allowed (Product Variant system isn't complete yet —
   * multiple product records currently represent different colour/
   * configuration variants of the same item, sharing one SKU). Never
   * blocks the save; only surfaces a warning in the response, exactly like
   * BillsService's duplicate bill-number check.
   */
  private async checkDuplicateSku(sku: string, excludeId?: string) {
    const trimmed = String(sku || '').trim();
    if (!trimmed) return null;
    const others = await this.prisma.product.findMany({
      where: {
        sku: { equals: trimmed, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { name: true },
      take: 5,
    });
    if (others.length === 0) return null;
    const names = others.map((p) => p.name).join(', ');
    return `Warning: This SKU is already assigned to ${others.length === 1 ? 'another product' : `${others.length} other products`} (${names}). Duplicate SKUs are currently allowed.`;
  }

  async createProduct(data: ProductPayload) {
    const productData = this.buildProductData(data, true);
    const incomingSerials: string[] = Array.isArray(data.serialNumbers)
      ? data.serialNumbers.map((s) => String(s).trim()).filter(Boolean)
      : [];

    // If serials are provided, quantity will be derived — don't trust the client value
    if (incomingSerials.length > 0) {
      productData.quantity = incomingSerials.length;
    }

    const duplicateWarning = await this.checkDuplicateSku(productData.sku);

    const product = await this.prisma.$transaction(async (prisma) => {
      const created = await prisma.product.create({ data: productData });
      if (incomingSerials.length > 0) {
        await this.syncSerialUnits(prisma, created, incomingSerials);
        // Re-fetch so quantity reflects the sync
        return prisma.product.findUnique({ where: { id: created.id } });
      }
      return created;
    });

    await this.ensureProductCategory(product!.category);
    const mapped = mapProductToFrontend(product!);
    return duplicateWarning ? { ...mapped, duplicateWarning } : mapped;
  }

  async getAllProducts() {
    const products = await this.prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
    return products.map(mapProductToFrontend);
  }

  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return mapProductToFrontend(product);
  }

  async updateProduct(id: string, data: ProductPayload) {
    await this.getProductById(id);
    const productData = this.buildProductData(data);
    const incomingSerials: string[] = Array.isArray(data.serialNumbers)
      ? data.serialNumbers.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const duplicateWarning = productData.sku
      ? await this.checkDuplicateSku(productData.sku, id)
      : null;

    const product = await this.prisma.$transaction(async (prisma) => {
      const updated = await prisma.product.update({ where: { id }, data: productData });

      if (incomingSerials.length > 0) {
        // Remove in_stock serials no longer in the list (user deleted them from the form)
        const existingAvailable = await prisma.serialUnit.findMany({
          where: { productId: id, status: 'in_stock' },
          select: { serialNumber: true },
        });
        const toRemove = existingAvailable
          .map((u: any) => u.serialNumber)
          .filter((sn: string) => !incomingSerials.includes(sn));

        if (toRemove.length > 0) {
          await prisma.serialUnit.deleteMany({
            where: { serialNumber: { in: toRemove }, productId: id, status: 'in_stock' },
          });
        }

        await this.syncSerialUnits(prisma, updated, incomingSerials);
        return prisma.product.findUnique({ where: { id } });
      }

      // No serials provided — check if product already has serials; if so, re-sync quantity
      const availableCount = await prisma.serialUnit.count({
        where: { productId: id, status: 'in_stock' },
      });
      if (availableCount > 0) {
        // Serialized product: ignore the manual quantity from the payload, keep it synced
        await prisma.product.update({ where: { id }, data: { quantity: availableCount } });
        return prisma.product.findUnique({ where: { id } });
      }

      return updated;
    });

    await this.ensureProductCategory(product!.category);
    const mapped = mapProductToFrontend(product!);
    return duplicateWarning ? { ...mapped, duplicateWarning } : mapped;
  }

  async deleteProduct(id: string) {
    await this.getProductById(id);
    const product = await this.prisma.product.delete({ where: { id } });
    return mapProductToFrontend(product);
  }

  /**
   * Return a previously sold serial number.
   * Marks the serial as in_stock (AVAILABLE) and syncs the product quantity up.
   * Preserves full sales history on the SerialUnit record.
   */
  async returnSerial(serialNumber: string) {
    const unit = await this.prisma.serialUnit.findUnique({ where: { serialNumber } });
    if (!unit) throw new NotFoundException(`Serial number ${serialNumber} not found`);
    if (unit.status === 'in_stock') {
      throw new BadRequestException(`Serial number ${serialNumber} is already in stock`);
    }

    return this.prisma.$transaction(async (prisma) => {
      // Restore to available — keep all sale history for audit trail
      await prisma.serialUnit.update({
        where: { serialNumber },
        data: { status: 'in_stock' },
      });

      // Sync product quantity
      const availableCount = await prisma.serialUnit.count({
        where: { productId: unit.productId, status: 'in_stock' },
      });
      await prisma.product.update({
        where: { id: unit.productId },
        data: { quantity: availableCount },
      });

      return prisma.serialUnit.findUnique({ where: { serialNumber } });
    });
  }
}
