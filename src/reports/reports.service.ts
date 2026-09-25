import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

type MonthlyEarningsQuery = {
  month?: string;
  from?: string;
  to?: string;
};

const money = (value: number | null | undefined) => Number(value || 0);

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private getDateRange(query: MonthlyEarningsQuery) {
    if (query.from || query.to) {
      if (!query.from || !query.to) {
        throw new BadRequestException('Both from and to are required for a custom date range');
      }

      const from = new Date(`${query.from}T00:00:00.000Z`);
      const toInclusive = new Date(`${query.to}T00:00:00.000Z`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime())) {
        throw new BadRequestException('Invalid date range');
      }
      if (from > toInclusive) {
        throw new BadRequestException('From date must be before to date');
      }

      const end = new Date(toInclusive);
      end.setUTCDate(end.getUTCDate() + 1);

      return {
        month: query.month || query.from.slice(0, 7),
        from,
        end,
        fromDate: query.from,
        toDate: query.to,
      };
    }

    const month = query.month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('Month must use YYYY-MM format');
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    const to = new Date(end);
    to.setUTCDate(to.getUTCDate() - 1);

    return {
      month,
      from,
      end,
      fromDate: from.toISOString().slice(0, 10),
      toDate: to.toISOString().slice(0, 10),
    };
  }

  async getMonthlyEarnings(query: MonthlyEarningsQuery) {
    const range = this.getDateRange(query);
    const dateFilter = { gte: range.from, lt: range.end };

    const [paidInvoices, vendorPayments, vendorReceipts, miscExpenses, paidSalaryPayments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          status: InvoiceStatus.PAID,
          paidAt: dateFilter,
        },
        include: { customer: true, items: true },
        orderBy: { paidAt: 'desc' },
      }),
      // Chart of Accounts Corrections — Change 1: never calculate balances
      // from bill totals. A bill paid across several partial payments must
      // show each payment on the date/period it actually happened, not the
      // whole bill amount dumped into whichever month it finally settled.
      this.prisma.vendorPayment.findMany({
        where: { paymentDate: dateFilter },
        include: { vendor: true, vendorBill: { include: { items: true } } },
        orderBy: { paymentDate: 'desc' },
      }),
      this.prisma.vendorReceipt.findMany({
        where: { paymentDate: dateFilter },
        include: { vendor: true, vendorBill: { include: { items: true } } },
        orderBy: { paymentDate: 'desc' },
      }),
      this.prisma.miscLedgerEntry.findMany({
        where: {
          date: dateFilter,
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.salaryPayment.findMany({
        where: {
          status: 'paid',
          paymentDate: dateFilter,
        },
        orderBy: { paymentDate: 'desc' },
      }),
    ]);

    const incomeEntries = paidInvoices.map((invoice: any) => ({
      id: invoice.id,
      type: 'income',
      sourceType: 'customer_invoice',
      // Phase – Sales Improvements (Change 8): Service Invoices participate
      // in this report exactly like Product Invoices — no separate query,
      // no separate totals — just identifiable via this field.
      invoiceType: String(invoice.invoiceType || 'PRODUCT').toLowerCase(),
      referenceId: invoice.id,
      referenceNumber: invoice.invoiceNumber || invoice.id,
      partyName: invoice.customerName || invoice.customer?.name || 'Unknown Customer',
      partyEmail: invoice.customerEmail || invoice.customer?.email || '',
      date: invoice.paidAt || invoice.invoiceDate || invoice.createdAt,
      documentDate: invoice.invoiceDate,
      status: String(invoice.status || 'PAID').toLowerCase(),
      description: `Paid customer invoice ${invoice.invoiceNumber || invoice.id}`,
      amount: money(invoice.total),
      paymentMethod: invoice.paymentMethod || '',
      itemCount: invoice.items?.length || 0,
    }));

    // Vendor Payments are always against CREDIT bills (we owe the vendor) →
    // outgoing expense. Each payment transaction is its own entry — a bill
    // settled across several partial payments produces one entry per
    // payment, each dated and amounted from that specific transaction, so
    // it lands in whichever month it actually happened. `referenceId` still
    // points at the parent Bill so existing bill drill-down UI keeps working.
    const vendorOutgoingEntries = vendorPayments.map((payment: any) => ({
      id: payment.id,
      type: 'outgoing',
      sourceType: 'vendor_bill',
      referenceId: payment.vendorBillId,
      referenceNumber: payment.vendorBill?.billNumber || payment.paymentNumber,
      partyName: payment.vendor?.company || payment.vendor?.name || 'Unknown Vendor',
      partyEmail: payment.vendor?.email || '',
      date: payment.paymentDate,
      documentDate: payment.vendorBill?.date,
      dueDate: payment.vendorBill?.dueDate,
      status: 'paid',
      description: `Vendor payment ${payment.paymentNumber} — bill ${payment.vendorBill?.billNumber || payment.vendorBillId}`,
      amount: money(payment.amount),
      paymentMethod: payment.paymentMethod || '',
      itemCount: payment.vendorBill?.items?.length || 0,
    }));

    // Vendor Receipts are always against DEBIT bills (vendor owes us) →
    // income. Same transaction-level treatment as Vendor Payments above.
    const debitBillIncomeEntries = vendorReceipts.map((receipt: any) => ({
      id: receipt.id,
      type: 'income',
      sourceType: 'debit_bill',
      referenceId: receipt.vendorBillId,
      referenceNumber: receipt.vendorBill?.billNumber || receipt.receiptNumber,
      partyName: receipt.vendor?.company || receipt.vendor?.name || 'Unknown Vendor',
      partyEmail: receipt.vendor?.email || '',
      date: receipt.paymentDate,
      documentDate: receipt.vendorBill?.date,
      dueDate: receipt.vendorBill?.dueDate,
      status: 'paid',
      description: `Vendor receipt ${receipt.receiptNumber} — bill ${receipt.vendorBill?.billNumber || receipt.vendorBillId}`,
      amount: money(receipt.amount),
      paymentMethod: receipt.paymentMethod || '',
      itemCount: receipt.vendorBill?.items?.length || 0,
    }));

    const miscExpenseEntries = miscExpenses.map((entry: any) => ({
      id: entry.id,
      type: 'outgoing',
      sourceType: 'misc_expense',
      referenceId: entry.id,
      referenceNumber: entry.reference || entry.id,
      partyName: entry.label,
      partyEmail: '',
      date: entry.date,
      status: 'paid',
      description: entry.description || entry.notes || `Miscellaneous expense: ${entry.label}`,
      amount: money(entry.amount),
      label: entry.label,
      paymentMethod: entry.paymentMethod || '',
      notes: entry.notes || '',
      createdByName: entry.createdByName || '',
    }));

    const salaryOutgoingEntries = paidSalaryPayments.map((payment: any) => ({
      id: payment.id,
      type: 'outgoing',
      sourceType: 'employee_salary',
      referenceId: payment.id,
      referenceNumber: payment.paymentNumber || payment.id,
      partyName: payment.employeeName || 'Unknown Employee',
      partyEmail: '',
      date: payment.paymentDate || payment.updatedAt || payment.createdAt,
      documentDate: payment.periodEnd || payment.periodStart || payment.createdAt,
      status: payment.status || 'paid',
      description: `Salary paid — ${payment.salaryPeriod || payment.paymentNumber || payment.id}`,
      amount: money(payment.amountPaid || payment.netPayable),
      paymentMethod: payment.paymentMethod || '',
      notes: payment.notes || '',
    }));

    const allIncomeEntries = [...incomeEntries, ...debitBillIncomeEntries];

    const income = allIncomeEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const vendorOutgoing = vendorOutgoingEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const miscOutgoing = miscExpenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const salaryOutgoing = salaryOutgoingEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const totalOutgoing = vendorOutgoing + miscOutgoing + salaryOutgoing;

    return {
      month: range.month,
      from: range.fromDate,
      to: range.toDate,
      totals: {
        income,
        vendorOutgoing,
        miscOutgoing,
        salaryOutgoing,
        totalOutgoing,
        netEarnings: income - totalOutgoing,
        incomeCount: allIncomeEntries.length,
        vendorPaymentCount: vendorOutgoingEntries.length,
        miscExpenseCount: miscExpenseEntries.length,
        salaryPaymentCount: salaryOutgoingEntries.length,
        totalEntryCount: allIncomeEntries.length + vendorOutgoingEntries.length + miscExpenseEntries.length + salaryOutgoingEntries.length,
      },
      incomeEntries: allIncomeEntries,
      vendorOutgoingEntries,
      miscExpenseEntries,
      salaryOutgoingEntries,
    };
  }
}
