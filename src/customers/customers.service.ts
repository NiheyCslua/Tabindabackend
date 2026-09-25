import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { mapCustomerToFrontend } from './customers.mapper';

type CustomerPayload = { name?: string; email?: string; phone?: string; company?: string; address?: string; city?: string; state?: string; zipCode?: string; country?: string; creditLimit?: number; status?: string; notes?: string; };
const includeCustomer = { invoices: { where: { status: 'PAID' as const }, select: { total: true, status: true } } };

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}
  private customerData(data: CustomerPayload) { const out: any = {}; for (const key of ['name','email','phone','company','address','city','state','zipCode','country','status','notes'] as const) if (data[key] !== undefined) out[key] = data[key]; if (data.creditLimit !== undefined) out.creditLimit = Number(data.creditLimit); return out; }
  async createCustomer(data: CustomerPayload) { return mapCustomerToFrontend(await this.prisma.customer.create({ data: this.customerData(data), include: includeCustomer })); }
  async getAllCustomers() { return (await this.prisma.customer.findMany({ include: includeCustomer, orderBy: { createdAt: 'desc' } })).map(mapCustomerToFrontend); }
  async getCustomerById(id: string) { const customer = await this.prisma.customer.findUnique({ where: { id }, include: includeCustomer }); if (!customer) throw new NotFoundException('Customer not found'); return mapCustomerToFrontend(customer); }
  async updateCustomer(id: string, data: CustomerPayload) { await this.getCustomerById(id); return mapCustomerToFrontend(await this.prisma.customer.update({ where: { id }, data: this.customerData(data), include: includeCustomer })); }
  async deleteCustomer(id: string) { await this.getCustomerById(id); return mapCustomerToFrontend(await this.prisma.customer.delete({ where: { id }, include: includeCustomer })); }
}
