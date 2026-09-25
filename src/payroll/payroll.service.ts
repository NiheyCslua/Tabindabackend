import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialAccountsService, CREDIT_CARD_ACCOUNTS } from 'src/financial-accounts/financial-accounts.service';

// Bank Transfer, Cheque and Credit Card all use the shared Financial
// Account selector; Cash maps automatically elsewhere and never needs one
// (Chart of Accounts Corrections — Change 2).
const ACCOUNT_LINKED_METHODS = new Set(['bank_transfer', 'cheque', 'credit_card']);

const mapAdvance = (a: any) => ({
  id: a.id,
  employeeId: a.employeeId,
  employeeName: a.employeeName,
  date: a.date instanceof Date ? a.date.toISOString().split('T')[0] : a.date,
  amount: Number(a.amount),
  deductedAmount: Number(a.deductedAmount || 0),
  remainingAmount: Number(a.remainingAmount),
  reason: a.reason || null,
  notes: a.notes || null,
  status: a.status || 'outstanding',
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

const mapPayment = (p: any) => ({
  id: p.id,
  paymentNumber: p.paymentNumber,
  employeeId: p.employeeId,
  employeeName: p.employeeName,
  salaryPeriod: p.salaryPeriod,
  periodStart: p.periodStart || null,
  periodEnd: p.periodEnd || null,
  baseSalary: Number(p.baseSalary),
  bonus: Number(p.bonus || 0),
  otherDeductions: Number(p.otherDeductions || 0),
  advanceDeduction: Number(p.advanceDeduction || 0),
  grossSalary: Number(p.grossSalary),
  netPayable: Number(p.netPayable),
  amountPaid: Number(p.amountPaid || 0),
  status: p.status || 'pending',
  paymentDate: p.paymentDate || null,
  paymentMethod: p.paymentMethod || null,
  financialAccountId: p.financialAccountId || null,
  notes: p.notes || null,
  advanceDeductions: p.advanceDeductions || null,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const mapLedger = (e: any) => ({
  id: e.id,
  employeeId: e.employeeId,
  employeeName: e.employeeName,
  date: e.date instanceof Date ? e.date.toISOString().split('T')[0] : e.date,
  type: e.type,
  description: e.description,
  debit: Number(e.debit || 0),
  credit: Number(e.credit || 0),
  balance: Number(e.balance || 0),
  referenceId: e.referenceId || null,
  referenceType: e.referenceType || null,
  createdAt: e.createdAt,
});

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private financialAccounts: FinancialAccountsService,
  ) {}

  // ── Salary Advances ─────────────────────────────────────────────────────────

  async getAllAdvances(employeeId?: string) {
    const advances = await this.prisma.salaryAdvance.findMany({
      where: employeeId ? { employeeId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return advances.map(mapAdvance);
  }

  async createAdvance(data: any) {
    const advance = await this.prisma.salaryAdvance.create({
      data: {
        employeeId: data.employeeId,
        employeeName: data.employeeName || '',
        date: data.date ? new Date(data.date) : new Date(),
        amount: Number(data.amount),
        deductedAmount: 0,
        remainingAmount: Number(data.amount),
        reason: data.reason || null,
        notes: data.notes || null,
        status: 'outstanding',
      },
    });
    // Create ledger entry
    await this.prisma.employeeLedgerEntry.create({
      data: {
        employeeId: advance.employeeId,
        employeeName: advance.employeeName,
        date: advance.date,
        type: 'advance_taken',
        description: `Salary Advance${data.reason ? ' — ' + data.reason : ''}`,
        debit: Number(advance.amount),
        credit: 0,
        balance: 0,
        referenceId: advance.id,
        referenceType: 'salary_advance',
      },
    });
    return mapAdvance(advance);
  }

  async updateAdvance(id: string, data: any) {
    const existing = await this.prisma.salaryAdvance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Advance not found');
    const updated = await this.prisma.salaryAdvance.update({
      where: { id },
      data: {
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status && { status: data.status }),
        ...(data.deductedAmount !== undefined && { deductedAmount: Number(data.deductedAmount) }),
        ...(data.remainingAmount !== undefined && { remainingAmount: Number(data.remainingAmount) }),
      },
    });
    return mapAdvance(updated);
  }

  async cancelAdvance(id: string) {
    const existing = await this.prisma.salaryAdvance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Advance not found');
    const updated = await this.prisma.salaryAdvance.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.prisma.employeeLedgerEntry.create({
      data: {
        employeeId: updated.employeeId,
        employeeName: updated.employeeName,
        date: new Date(),
        type: 'advance_cancelled',
        description: `Advance cancelled`,
        debit: 0,
        credit: Number(updated.remainingAmount),
        balance: 0,
        referenceId: updated.id,
        referenceType: 'salary_advance',
      },
    });
    return mapAdvance(updated);
  }

  // ── Salary Payments ─────────────────────────────────────────────────────────

  async getAllPayments(employeeId?: string) {
    const payments = await this.prisma.salaryPayment.findMany({
      where: employeeId ? { employeeId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(mapPayment);
  }

  async createPayment(data: any) {
    // Generate payment number
    const count = await this.prisma.salaryPayment.count();
    const paymentNumber = `SAL-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const payment = await this.prisma.salaryPayment.create({
      data: {
        paymentNumber,
        employeeId: data.employeeId,
        employeeName: data.employeeName || '',
        salaryPeriod: data.salaryPeriod,
        periodStart: data.periodStart ? new Date(data.periodStart) : null,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
        baseSalary: Number(data.baseSalary),
        bonus: Number(data.bonus || 0),
        otherDeductions: Number(data.otherDeductions || 0),
        advanceDeduction: Number(data.advanceDeduction || 0),
        grossSalary: Number(data.grossSalary),
        netPayable: Number(data.netPayable),
        amountPaid: 0,
        status: 'pending',
        paymentMethod: data.paymentMethod || null,
        notes: data.notes || null,
        advanceDeductions: data.advanceDeductions || null,
      },
    });

    // Create ledger entry for generated salary
    await this.prisma.employeeLedgerEntry.create({
      data: {
        employeeId: payment.employeeId,
        employeeName: payment.employeeName,
        date: new Date(),
        type: 'salary_generated',
        description: `Salary generated — ${data.salaryPeriod}`,
        debit: 0,
        credit: Number(payment.netPayable),
        balance: 0,
        referenceId: payment.id,
        referenceType: 'salary_payment',
      },
    });

    // Apply advance deductions to advance records
    if (Array.isArray(data.advanceDeductions)) {
      for (const ded of data.advanceDeductions) {
        const advance = await this.prisma.salaryAdvance.findUnique({ where: { id: ded.advanceId } });
        if (!advance) continue;
        const newDeducted = Number(advance.deductedAmount) + Number(ded.amount);
        const newRemaining = Number(advance.amount) - newDeducted;
        const newStatus = newRemaining <= 0 ? 'deducted' : 'partially_deducted';
        await this.prisma.salaryAdvance.update({
          where: { id: ded.advanceId },
          data: { deductedAmount: newDeducted, remainingAmount: Math.max(0, newRemaining), status: newStatus },
        });
        await this.prisma.employeeLedgerEntry.create({
          data: {
            employeeId: payment.employeeId,
            employeeName: payment.employeeName,
            date: new Date(),
            type: 'advance_deducted',
            description: `Advance deduction from ${payment.salaryPeriod} salary`,
            debit: Number(ded.amount),
            credit: 0,
            balance: 0,
            referenceId: advance.id,
            referenceType: 'salary_advance',
          },
        });
      }
    }

    return mapPayment(payment);
  }

  async markAsPaid(id: string, options?: { paymentDate?: string; paymentMethod?: string; financialAccountId?: string; bankAccount?: string } | string) {
    // Backward compatible: markAsPaid(id, '2026-07-05') — a bare date string.
    const opts = typeof options === 'string' ? { paymentDate: options } : (options || {});

    const payment = await this.prisma.salaryPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');

    const paymentMethod = opts.paymentMethod || payment.paymentMethod || 'cash';
    let financialAccountId: string | null = null;
    if (ACCOUNT_LINKED_METHODS.has(paymentMethod)) {
      const idOrName = opts.financialAccountId || opts.bankAccount;
      if (idOrName) {
        const account = await this.financialAccounts.resolveAccount(idOrName);
        if (!account) throw new BadRequestException('Invalid financial account');
        if (paymentMethod === 'credit_card' && !CREDIT_CARD_ACCOUNTS.includes(account.name)) {
          throw new BadRequestException(`Credit Card payments can only use: ${CREDIT_CARD_ACCOUNTS.join(', ')}`);
        }
        financialAccountId = account.id;
      } else if (paymentMethod === 'credit_card') {
        throw new BadRequestException(`Credit Card payments require a financial account (${CREDIT_CARD_ACCOUNTS.join(', ')})`);
      }
    }

    const updated = await this.prisma.salaryPayment.update({
      where: { id },
      data: {
        status: 'paid',
        amountPaid: payment.netPayable,
        paymentDate: opts.paymentDate ? new Date(opts.paymentDate) : new Date(),
        paymentMethod,
        financialAccountId,
      },
    });
    await this.prisma.employeeLedgerEntry.create({
      data: {
        employeeId: updated.employeeId,
        employeeName: updated.employeeName,
        date: updated.paymentDate || new Date(),
        type: 'salary_paid',
        description: `Salary paid — ${updated.salaryPeriod}`,
        debit: 0,
        credit: Number(updated.amountPaid),
        balance: 0,
        referenceId: updated.id,
        referenceType: 'salary_payment',
      },
    });
    return mapPayment(updated);
  }

  async cancelPayment(id: string) {
    const payment = await this.prisma.salaryPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    const updated = await this.prisma.salaryPayment.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.prisma.employeeLedgerEntry.create({
      data: {
        employeeId: updated.employeeId,
        employeeName: updated.employeeName,
        date: new Date(),
        type: 'salary_cancelled',
        description: `Salary cancelled — ${updated.salaryPeriod}`,
        debit: Number(updated.netPayable),
        credit: 0,
        balance: 0,
        referenceId: updated.id,
        referenceType: 'salary_payment',
      },
    });
    return mapPayment(updated);
  }

  // ── Employee Ledger ─────────────────────────────────────────────────────────

  async getLedger(employeeId?: string) {
    const entries = await this.prisma.employeeLedgerEntry.findMany({
      where: employeeId ? { employeeId } : undefined,
      orderBy: { date: 'desc' },
    });
    return entries.map(mapLedger);
  }

  async createLedgerEntry(data: any) {
    const entry = await this.prisma.employeeLedgerEntry.create({
      data: {
        employeeId: data.employeeId,
        employeeName: data.employeeName || '',
        date: data.date ? new Date(data.date) : new Date(),
        type: data.type,
        description: data.description,
        debit: Number(data.debit || 0),
        credit: Number(data.credit || 0),
        balance: Number(data.balance || 0),
        referenceId: data.referenceId || null,
        referenceType: data.referenceType || null,
      },
    });
    return mapLedger(entry);
  }
}
