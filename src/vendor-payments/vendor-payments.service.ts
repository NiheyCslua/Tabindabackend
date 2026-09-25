import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialAccountsService, PAYMENT_METHODS, CREDIT_CARD_ACCOUNTS } from 'src/financial-accounts/financial-accounts.service';

// ── Shared financial transaction constants ────────────────────────────────────
// NOTE: bank *names* are no longer hardcoded validation — they come from the
// FinancialAccount table (see FinancialAccountsService). This list remains
// only as the set of allowed payment methods. Vendor Payments and Vendor
// Receipts reuse the same four standard methods as every other module
// (Chart of Accounts Corrections — Change 2).
export const ALLOWED_METHODS: string[] = [...PAYMENT_METHODS];
export const BILL_STATUSES    = ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const;

type CreateTransactionDTO = {
  vendorBillId: string;
  amount: number;
  paymentMethod: string;
  // Preferred: the real FinancialAccount.id from the shared selector.
  financialAccountId?: string;
  // Legacy: a bank/wallet name. Still accepted for backward compatibility —
  // resolved to a FinancialAccount id server-side.
  bankAccount?: string;
  referenceNumber?: string;
  paymentDate: string;
  notes?: string;
  createdBy?: string;
};

// ── Shared mappers ────────────────────────────────────────────────────────────

const mapPayment = (p: any) => ({
  id: p.id,
  paymentNumber: p.paymentNumber,
  vendorId: p.vendorId,
  vendorName: p.vendor?.company || p.vendor?.name || '',
  vendorBillId: p.vendorBillId,
  billNumber: p.vendorBill?.billNumber || '',
  billAmount: Number(p.vendorBill?.amount || 0),
  amount: Number(p.amount),
  paymentMethod: p.paymentMethod,
  bankAccount: p.bankAccount || null,
  financialAccountId: p.financialAccountId || null,
  referenceNumber: p.referenceNumber || null,
  paymentDate: p.paymentDate,
  balanceAfterPayment: Number(p.balanceAfterPayment ?? 0),
  notes: p.notes || null,
  createdBy: p.createdBy || '',
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const mapReceipt = (r: any) => ({
  id: r.id,
  receiptNumber: r.receiptNumber,
  vendorId: r.vendorId,
  vendorName: r.vendor?.company || r.vendor?.name || '',
  vendorBillId: r.vendorBillId,
  billNumber: r.vendorBill?.billNumber || '',
  billAmount: Number(r.vendorBill?.amount || 0),
  amount: Number(r.amount),
  paymentMethod: r.paymentMethod,
  bankAccount: r.bankAccount || null,
  financialAccountId: r.financialAccountId || null,
  referenceNumber: r.referenceNumber || null,
  paymentDate: r.paymentDate,
  balanceAfterPayment: Number(r.balanceAfterPayment ?? 0),
  notes: r.notes || null,
  createdBy: r.createdBy || '',
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const mapBillForPayment = (b: any, transactionMapper: (t: any) => any) => ({
  id: b.id,
  billNumber: b.billNumber,
  billType: b.billType || 'CREDIT',
  vendorId: b.vendorId,
  vendorName: b.vendor?.company || b.vendor?.name || '',
  amount: Number(b.amount),
  paidAmount: Number(b.paidAmount || 0),
  balanceAmount: Number(b.balanceAmount || b.amount || 0),
  date: b.date,
  dueDate: b.dueDate,
  status: b.status,
  payments: ((b.payments || b.receipts || []).map(transactionMapper)),
});

const includePayment  = { vendor: true, vendorBill: true };
const includeReceipt  = { vendor: true, vendorBill: true };

@Injectable()
export class VendorPaymentsService {
  constructor(
    private prisma: PrismaService,
    private financialAccounts: FinancialAccountsService,
  ) {}

  // ── Number generation ───────────────────────────────────────────────────────

  private async generatePaymentNumber(): Promise<string> {
    const last = await this.prisma.vendorPayment.findFirst({
      orderBy: { paymentNumber: 'desc' }, select: { paymentNumber: true },
    });
    const n = last ? parseInt(last.paymentNumber.replace('VP-', ''), 10) : 0;
    return `VP-${String(n + 1).padStart(5, '0')}`;
  }

  private async generateReceiptNumber(): Promise<string> {
    const last = await this.prisma.vendorReceipt.findFirst({
      orderBy: { receiptNumber: 'desc' }, select: { receiptNumber: true },
    });
    const n = last ? parseInt(last.receiptNumber.replace('VR-', ''), 10) : 0;
    return `VR-${String(n + 1).padStart(5, '0')}`;
  }

  // ── Shared validation ───────────────────────────────────────────────────────

  private async validateTransactionMeta(data: CreateTransactionDTO) {
    if (!ALLOWED_METHODS.includes(data.paymentMethod))
      throw new BadRequestException('Invalid payment method');

    // Cash maps automatically to the Cash on Hand account elsewhere — no
    // selector needed here. Bank Transfer, Cheque and Credit Card all use
    // the shared Financial Account selector (Change 2).
    if (data.paymentMethod === 'cash') {
      return { financialAccountId: null as string | null, bankAccountName: null as string | null };
    }

    const idOrName = data.financialAccountId || data.bankAccount;
    if (!idOrName) {
      // Bank Transfer / Cheque historically allowed a null bank on some
      // legacy flows — keep that lenient behaviour, just don't attach an
      // account. Credit Card always requires one of the supported
      // settlement accounts.
      if (data.paymentMethod === 'credit_card') {
        throw new BadRequestException(`Credit Card payments require a financial account (${CREDIT_CARD_ACCOUNTS.join(', ')})`);
      }
      return { financialAccountId: null as string | null, bankAccountName: null as string | null };
    }

    const account = await this.financialAccounts.resolveAccount(idOrName);
    if (!account) {
      throw new BadRequestException('Invalid financial account');
    }
    if (data.paymentMethod === 'credit_card' && !CREDIT_CARD_ACCOUNTS.includes(account.name)) {
      throw new BadRequestException(`Credit Card payments can only use: ${CREDIT_CARD_ACCOUNTS.join(', ')}`);
    }
    return { financialAccountId: account.id, bankAccountName: account.name };
  }

  private async getBillOrThrow(id: string, expectedType?: 'CREDIT' | 'DEBIT') {
    const bill = await this.prisma.bill.findUnique({ where: { id }, include: { vendor: true } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (expectedType && bill.billType !== expectedType)
      throw new BadRequestException(`Expected a ${expectedType} bill`);
    if (bill.status === 'paid') throw new BadRequestException('This bill is already fully settled');
    return bill;
  }

  private calcNewStatus(newBalance: number): string {
    return newBalance <= 0.01 ? 'paid' : 'partially_paid';
  }

  // ── Vendor Payments (CREDIT bills — we owe vendor) ─────────────────────────

  async createPayment(data: CreateTransactionDTO) {
    if (!data.vendorBillId) throw new BadRequestException('Vendor bill is required');
    const resolved = await this.validateTransactionMeta(data);

    const bill = await this.getBillOrThrow(data.vendorBillId, 'CREDIT');
    const balance = Number(bill.balanceAmount) || Number(bill.amount);
    const payAmount = Number(data.amount);
    if (!payAmount || payAmount <= 0) throw new BadRequestException('Amount must be greater than 0');
    if (payAmount > balance + 0.01) throw new BadRequestException(`Amount exceeds outstanding balance (${balance})`);

    const paymentNumber = await this.generatePaymentNumber();
    const newPaidAmount = Number(bill.paidAmount || 0) + payAmount;
    const newBalance    = Math.max(0, Number(bill.amount) - newPaidAmount);
    const newStatus     = this.calcNewStatus(newBalance);

    return this.prisma.$transaction(async (prisma) => {
      const payment = await prisma.vendorPayment.create({
        data: {
          paymentNumber, vendorId: bill.vendorId, vendorBillId: bill.id,
          amount: payAmount, paymentMethod: data.paymentMethod,
          bankAccount: resolved.bankAccountName, financialAccountId: resolved.financialAccountId,
          referenceNumber: data.referenceNumber || null,
          paymentDate: new Date(data.paymentDate), balanceAfterPayment: newBalance,
          notes: data.notes || null, createdBy: data.createdBy || null,
        },
        include: includePayment,
      });
      await prisma.bill.update({
        where: { id: bill.id },
        data: { paidAmount: newPaidAmount, balanceAmount: newBalance, status: newStatus,
          paidAt: newStatus === 'paid' ? new Date(data.paymentDate) : bill.paidAt },
      });
      return mapPayment(payment);
    });
  }

  async getAllPayments() {
    return (await this.prisma.vendorPayment.findMany({ include: includePayment, orderBy: { createdAt: 'desc' } }))
      .map(mapPayment);
  }

  async getPaymentById(id: string) {
    const p = await this.prisma.vendorPayment.findUnique({ where: { id }, include: includePayment });
    if (!p) throw new NotFoundException('Payment not found');
    return mapPayment(p);
  }

  async getPaymentsByBill(billId: string) {
    return (await this.prisma.vendorPayment.findMany({
      where: { vendorBillId: billId }, include: includePayment, orderBy: { paymentDate: 'desc' },
    })).map(mapPayment);
  }

  async getUnpaidBills() {
    const bills = await this.prisma.bill.findMany({
      where: { status: { in: ['unpaid', 'partially_paid', 'overdue'] }, billType: 'CREDIT' },
      include: { vendor: true, payments: { include: includePayment } },
      orderBy: { date: 'desc' },
    });
    return bills.map(b => mapBillForPayment(b, mapPayment));
  }

  // ── Vendor Receipts (DEBIT bills — vendor owes us) ─────────────────────────

  async createReceipt(data: CreateTransactionDTO) {
    if (!data.vendorBillId) throw new BadRequestException('Vendor bill is required');
    const resolved = await this.validateTransactionMeta(data);

    const bill = await this.getBillOrThrow(data.vendorBillId, 'DEBIT');
    const balance = Number(bill.balanceAmount) || Number(bill.amount);
    const recAmount = Number(data.amount);
    if (!recAmount || recAmount <= 0) throw new BadRequestException('Amount must be greater than 0');
    if (recAmount > balance + 0.01) throw new BadRequestException(`Amount exceeds outstanding balance (${balance})`);

    const receiptNumber  = await this.generateReceiptNumber();
    const newPaidAmount  = Number(bill.paidAmount || 0) + recAmount;
    const newBalance     = Math.max(0, Number(bill.amount) - newPaidAmount);
    const newStatus      = this.calcNewStatus(newBalance);

    return this.prisma.$transaction(async (prisma) => {
      const receipt = await prisma.vendorReceipt.create({
        data: {
          receiptNumber, vendorId: bill.vendorId, vendorBillId: bill.id,
          amount: recAmount, paymentMethod: data.paymentMethod,
          bankAccount: resolved.bankAccountName, financialAccountId: resolved.financialAccountId,
          referenceNumber: data.referenceNumber || null,
          paymentDate: new Date(data.paymentDate), balanceAfterPayment: newBalance,
          notes: data.notes || null, createdBy: data.createdBy || null,
        },
        include: includeReceipt,
      });
      await prisma.bill.update({
        where: { id: bill.id },
        data: { paidAmount: newPaidAmount, balanceAmount: newBalance, status: newStatus,
          paidAt: newStatus === 'paid' ? new Date(data.paymentDate) : bill.paidAt },
      });
      return mapReceipt(receipt);
    });
  }

  async getAllReceipts() {
    return (await this.prisma.vendorReceipt.findMany({ include: includeReceipt, orderBy: { createdAt: 'desc' } }))
      .map(mapReceipt);
  }

  async getReceiptById(id: string) {
    const r = await this.prisma.vendorReceipt.findUnique({ where: { id }, include: includeReceipt });
    if (!r) throw new NotFoundException('Receipt not found');
    return mapReceipt(r);
  }

  async getReceiptsByBill(billId: string) {
    return (await this.prisma.vendorReceipt.findMany({
      where: { vendorBillId: billId }, include: includeReceipt, orderBy: { paymentDate: 'desc' },
    })).map(mapReceipt);
  }

  async getUnpaidDebitBills() {
    const bills = await this.prisma.bill.findMany({
      where: { status: { in: ['unpaid', 'partially_paid', 'overdue'] }, billType: 'DEBIT' },
      include: { vendor: true, receipts: { include: includeReceipt } },
      orderBy: { date: 'desc' },
    });
    return bills.map(b => mapBillForPayment(b, mapReceipt));
  }

  // ── Vendor Ledger ───────────────────────────────────────────────────────────

  async getVendorLedger(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const [bills, payments, receipts] = await Promise.all([
      this.prisma.bill.findMany({ where: { vendorId }, orderBy: { date: 'asc' } }),
      this.prisma.vendorPayment.findMany({ where: { vendorId }, orderBy: { paymentDate: 'asc' } }),
      this.prisma.vendorReceipt.findMany({ where: { vendorId }, orderBy: { paymentDate: 'asc' } }),
    ]);

    const entries: any[] = [
      // CREDIT bills → credit column (we owe vendor); DEBIT bills → debit column (vendor owes us)
      ...bills.map((b: any) => ({
        date: new Date(b.date),
        type: (b.billType || 'CREDIT') === 'CREDIT' ? 'bill' : 'debit_bill',
        reference: b.billNumber,
        debit:  (b.billType || 'CREDIT') === 'CREDIT' ? 0 : Number(b.amount),
        credit: (b.billType || 'CREDIT') === 'CREDIT' ? Number(b.amount) : 0,
        paymentMethod: null, bankAccount: null, referenceNumber: null,
      })),
      // Vendor payments (we paid vendor) → debit column
      ...payments.map((p: any) => ({
        date: new Date(p.paymentDate), type: 'payment',
        reference: p.paymentNumber, debit: Number(p.amount), credit: 0,
        paymentMethod: p.paymentMethod, bankAccount: p.bankAccount, referenceNumber: p.referenceNumber,
      })),
      // Vendor receipts (vendor paid us) → credit column
      ...receipts.map((r: any) => ({
        date: new Date(r.paymentDate), type: 'receipt',
        reference: r.receiptNumber, debit: 0, credit: Number(r.amount),
        paymentMethod: r.paymentMethod, bankAccount: r.bankAccount, referenceNumber: r.referenceNumber,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = 0;
    const ledger = entries.map((e) => {
      // balance = credit - debit; positive = we owe vendor; negative = vendor owes us
      balance += e.credit - e.debit;
      return { ...e, balance };
    });

    const creditBills    = bills.filter((b: any) => (b.billType || 'CREDIT') === 'CREDIT');
    const debitBills     = bills.filter((b: any) => b.billType === 'DEBIT');
    const totalPurchases = creditBills.reduce((s: number, b: any) => s + Number(b.amount), 0);
    const totalDebitBills = debitBills.reduce((s: number, b: any) => s + Number(b.amount), 0);
    const totalPaid      = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    const totalReceived  = receipts.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const outstanding    = totalPurchases - totalPaid - totalDebitBills + totalReceived;

    return {
      vendor: { id: vendor.id, name: vendor.name, company: vendor.company },
      totalPurchases, totalDebitBills, totalPaid, totalReceived, outstanding,
      entries: ledger,
    };
  }

  // ── Vendor Summaries ────────────────────────────────────────────────────────

  async getAllVendorSummaries() {
    const vendors = await this.prisma.vendor.findMany({ orderBy: { company: 'asc' } });
    return Promise.all(vendors.map(async (v: any) => {
      const [creditAgg, debitAgg, payAgg, recAgg] = await Promise.all([
        this.prisma.bill.aggregate({ where: { vendorId: v.id, billType: 'CREDIT' }, _sum: { amount: true } }),
        this.prisma.bill.aggregate({ where: { vendorId: v.id, billType: 'DEBIT'  }, _sum: { amount: true } }),
        this.prisma.vendorPayment.aggregate({ where: { vendorId: v.id }, _sum: { amount: true } }),
        this.prisma.vendorReceipt.aggregate({ where: { vendorId: v.id }, _sum: { amount: true } }),
      ]);
      const totalPurchases  = Number(creditAgg._sum.amount || 0);
      const totalDebitBills = Number(debitAgg._sum.amount  || 0);
      const totalPaid       = Number(payAgg._sum.amount    || 0);
      const totalReceived   = Number(recAgg._sum.amount    || 0);
      const outstanding     = totalPurchases - totalPaid - totalDebitBills + totalReceived;
      return { id: v.id, name: v.name, company: v.company,
        totalPurchases, totalDebitBills, totalPaid, totalReceived, outstanding };
    }));
  }
}
