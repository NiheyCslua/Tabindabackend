import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type VendorPayload = { name?: string; company?: string; email?: string; phone?: string; address?: string; city?: string; state?: string; country?: string; status?: string; notes?: string; };

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}
  private vendorData(data: VendorPayload) { const out: any = {}; for (const key of ['name','company','email','phone','address','city','state','country','status','notes'] as const) if (data[key] !== undefined) out[key] = data[key]; return out; }
  async createVendor(data: VendorPayload) { return this.prisma.vendor.create({ data: this.vendorData(data) }); }
  async getAllVendors() { return this.prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } }); }
  async deleteVendor(id: string) { await this.ensureVendor(id); return this.prisma.vendor.delete({ where: { id } }); }
  async updateVendor(id: string, data: VendorPayload) { await this.ensureVendor(id); return this.prisma.vendor.update({ where: { id }, data: this.vendorData(data) }); }
  private async ensureVendor(id: string) { const vendor = await this.prisma.vendor.findUnique({ where: { id } }); if (!vendor) throw new NotFoundException('Vendor not found'); return vendor; }
}
