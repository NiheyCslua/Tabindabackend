import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const mapUnit = (u: any) => ({
  id: u.id,
  serialNumber: u.serialNumber,
  productId: u.productId,
  productName: u.productName,
  productSku: u.productSku,
  barcode: u.barcode || '',
  vendorId: u.vendorId || null,
  vendorName: u.vendorName || null,
  purchaseDate: u.purchaseDate || null,
  costPrice: Number(u.costPrice || 0),
  status: u.status || 'in_stock',
  purchaseBillId: u.purchaseBillId || null,
  purchaseBillNumber: u.purchaseBillNumber || null,
  purchaseUnitPrice: u.purchaseUnitPrice ? Number(u.purchaseUnitPrice) : null,
  saleInvoiceId: u.saleInvoiceId || null,
  saleInvoiceNumber: u.saleInvoiceNumber || null,
  soldAt: u.soldAt || null,
  customerId: u.customerId || null,
  customerName: u.customerName || null,
  saleUnitPrice: u.saleUnitPrice ? Number(u.saleUnitPrice) : null,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

@Injectable()
export class SerialUnitsService {
  constructor(private prisma: PrismaService) {}

  async findAll(productId?: string) {
    const units = await this.prisma.serialUnit.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return units.map(mapUnit);
  }


  async findInStockByProductSearch(query: string) {
    const search = String(query || '').trim();
    if (!search) return [];

    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 25,
    });

    const productIds = products.map((product) => product.id);
    if (productIds.length === 0) return [];

    const units = await this.prisma.serialUnit.findMany({
      where: {
        productId: { in: productIds },
        status: 'in_stock',
      },
      orderBy: { serialNumber: 'asc' },
    });

    const unitsByProduct = new Map<string, any[]>();
    for (const unit of units) {
      const productUnits = unitsByProduct.get(unit.productId) || [];
      productUnits.push(mapUnit(unit));
      unitsByProduct.set(unit.productId, productUnits);
    }

    return products
      .map((product) => ({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        category: product.category,
        brand: product.brand,
        barcode: product.barcode || '',
        quantity: product.quantity,
        sellingPrice: Number(product.sellingPrice || 0),
        inStockSerials: unitsByProduct.get(product.id) || [],
      }))
      .filter((product) => product.inStockSerials.length > 0);
  }

  async findOne(serialNumber: string) {
    const unit = await this.prisma.serialUnit.findUnique({ where: { serialNumber } });
    if (!unit) throw new NotFoundException('Serial unit not found');
    return mapUnit(unit);
  }

  async upsert(data: any) {
    const unit = await this.prisma.serialUnit.upsert({
      where: { serialNumber: data.serialNumber },
      create: {
        serialNumber: data.serialNumber,
        productId: data.productId,
        productName: data.productName || '',
        productSku: data.productSku || '',
        barcode: data.barcode || '',
        vendorId: data.vendorId || null,
        vendorName: data.vendorName || null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        costPrice: Number(data.costPrice || 0),
        status: data.status || 'in_stock',
        purchaseBillId: data.purchaseBillId || null,
        purchaseBillNumber: data.purchaseBillNumber || null,
        purchaseUnitPrice: data.purchaseUnitPrice ? Number(data.purchaseUnitPrice) : null,
      },
      update: {
        ...(data.productId && { productId: data.productId }),
        ...(data.productName && { productName: data.productName }),
        ...(data.productSku && { productSku: data.productSku }),
        ...(data.status && { status: data.status }),
        ...(data.purchaseBillId !== undefined && { purchaseBillId: data.purchaseBillId }),
        ...(data.purchaseBillNumber !== undefined && { purchaseBillNumber: data.purchaseBillNumber }),
        ...(data.purchaseUnitPrice !== undefined && { purchaseUnitPrice: Number(data.purchaseUnitPrice) }),
      },
    });
    return mapUnit(unit);
  }

  async markSold(serialNumber: string, data: any) {
    const unit = await this.prisma.serialUnit.findUnique({ where: { serialNumber } });
    if (!unit) throw new NotFoundException('Serial unit not found');
    const updated = await this.prisma.serialUnit.update({
      where: { serialNumber },
      data: {
        status: 'sold',
        saleInvoiceId: data.saleInvoiceId || null,
        saleInvoiceNumber: data.saleInvoiceNumber || null,
        soldAt: data.soldAt ? new Date(data.soldAt) : new Date(),
        customerId: data.customerId || null,
        customerName: data.customerName || null,
        saleUnitPrice: data.saleUnitPrice ? Number(data.saleUnitPrice) : null,
      },
    });
    return mapUnit(updated);
  }

  async markInStock(serialNumber: string) {
    const unit = await this.prisma.serialUnit.findUnique({ where: { serialNumber } });
    if (!unit) throw new NotFoundException('Serial unit not found');

    return this.prisma.$transaction(async (prisma) => {
      await prisma.serialUnit.update({
        where: { serialNumber },
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

      // Sync product quantity = count of available serials
      const availableCount = await prisma.serialUnit.count({
        where: { productId: unit.productId, status: 'in_stock' },
      });
      await prisma.product.update({
        where: { id: unit.productId },
        data: { quantity: availableCount },
      });

      return mapUnit(await prisma.serialUnit.findUnique({ where: { serialNumber } }));
    });
  }

  async returnSerial(serialNumber: string) {
    const unit = await this.prisma.serialUnit.findUnique({ where: { serialNumber } });
    if (!unit) throw new NotFoundException('Serial unit not found');
    if (unit.status === 'in_stock') {
      throw new NotFoundException(`Serial ${serialNumber} is already in stock`);
    }

    return this.prisma.$transaction(async (prisma) => {
      // Restore to available — intentionally preserve sale history fields for audit
      await prisma.serialUnit.update({
        where: { serialNumber },
        data: { status: 'in_stock' },
      });

      const availableCount = await prisma.serialUnit.count({
        where: { productId: unit.productId, status: 'in_stock' },
      });
      await prisma.product.update({
        where: { id: unit.productId },
        data: { quantity: availableCount },
      });

      return mapUnit(await prisma.serialUnit.findUnique({ where: { serialNumber } }));
    });
  }

  async delete(serialNumber: string) {
    const unit = await this.findOne(serialNumber);
    const deleted = await this.prisma.serialUnit.delete({ where: { serialNumber } });

    // Re-sync product quantity after removing a serial
    const availableCount = await this.prisma.serialUnit.count({
      where: { productId: unit.productId, status: 'in_stock' },
    });
    await this.prisma.product.update({
      where: { id: unit.productId },
      data: { quantity: availableCount },
    });

    return deleted;
  }
}
