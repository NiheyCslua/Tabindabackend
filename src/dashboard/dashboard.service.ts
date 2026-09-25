import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}
  async getStats() {
    const invoices = await this.prisma.invoice.findMany({ include: { customer: true } });
    const bills = await this.prisma.bill.findMany();
    const products = await this.prisma.product.findMany();
    const customers = await this.prisma.customer.findMany();
    const totalRevenue = invoices.filter(inv => inv.status === 'PAID').reduce((sum, inv) => sum + inv.total, 0);
    const totalExpenses = bills.reduce((sum, bill) => sum + bill.amount, 0);
    return { totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses, totalInvoices: invoices.length, totalBills: bills.length, totalCustomers: customers.length, totalProducts: products.length, lowStockItems: products.filter(product => product.quantity <= product.reorderLevel).length, recentInvoices: invoices.slice(-5).reverse().map(inv => ({ id: inv.id, invoiceNumber: inv.invoiceNumber || inv.id, amount: inv.total, status: inv.status.toLowerCase(), date: inv.invoiceDate || inv.createdAt, customerName: inv.customerName || inv.customer?.name || 'Unknown Customer' })) };
  }
}
