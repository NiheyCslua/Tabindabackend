import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

// Chart of Accounts Corrections — Change 2: Standardize Cash Handling.
// There is exactly one Financial Account responsible for every physical cash
// transaction across the whole app. Every module posts Cash payments here
// automatically — the user is never asked to pick a Financial Account when
// the payment method is Cash.
export const CASH_ACCOUNT_NAME = 'Cash on Hand';
export const ACCOUNT_TYPES = ['CASH', 'BANK', 'MOBILE_WALLET'] as const;

// The four payment methods every money-moving module should offer. Cash maps
// automatically to CASH_ACCOUNT_NAME; the other three use the shared
// Financial Account selector (see ACCOUNT_LINKED_METHODS below).
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'credit_card'] as const;

// Credit Card payments only settle to these supported card-settlement
// accounts — enforced wherever a module accepts 'credit_card'.
export const CREDIT_CARD_ACCOUNTS = ['Alfalah', 'Meezan', 'HBL'];

type Direction = 'in' | 'out';

// A single normalized money-movement row, gathered from every module that
// moves money. This is the one place that knows how to read Invoice /
// VendorPayment / VendorReceipt / SalaryPayment / MiscLedgerEntry — every
// other method in this service (balances, Chart of Accounts, the per-account
// ledger) is built on top of this list instead of querying each table again.
type FlowRow = {
  date: Date;
  source: 'Customer Invoice' | 'Vendor Payment' | 'Vendor Receipt' | 'Employee Payment' | 'Misc Expense';
  reference: string;
  amount: number;
  direction: Direction;
  financialAccountId: string | null;
  paymentMethod: string | null;
};

// Cash Mapping Rules (Chart of Accounts Corrections — Change 2):
//   Cash          → CASH_ACCOUNT_NAME, automatically
//   Bank Transfer → user-selected Financial Account
//   Cheque        → user-selected Financial Account
//   Credit Card   → user-selected (card-settlement) Financial Account
// All three non-cash methods post to their selected Financial Account and
// are included in Chart of Accounts balances.
const ACCOUNT_LINKED_METHODS = new Set(['bank_transfer', 'credit_card', 'cheque']);
const isCashLike = (paymentMethod?: string | null) => !paymentMethod || paymentMethod === 'cash';

const mapAccount = (a: any) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  openingBalance: Number(a.openingBalance || 0),
  openingBalanceDate: a.openingBalanceDate || null,
  description: a.description || null,
  isActive: a.isActive,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

@Injectable()
export class FinancialAccountsService {
  constructor(private prisma: PrismaService) {}

  // ── Accounts CRUD ────────────────────────────────────────────────────────

  async listAccounts(activeOnly = false) {
    const accounts = await this.prisma.financialAccount.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return accounts.map(mapAccount);
  }

  async getAccountByIdOrThrow(id: string) {
    const account = await this.prisma.financialAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Financial account not found');
    return mapAccount(account);
  }

  /** Resolves either a real FinancialAccount.id or a legacy bank-name string. */
  async resolveAccount(idOrName?: string | null) {
    if (!idOrName) return null;
    const byId = await this.prisma.financialAccount.findUnique({ where: { id: idOrName } });
    if (byId) return mapAccount(byId);
    const byName = await this.prisma.financialAccount.findUnique({ where: { name: idOrName } });
    return byName ? mapAccount(byName) : null;
  }

  async getCashAccountId(): Promise<string | null> {
    const cash = await this.prisma.financialAccount.findUnique({ where: { name: CASH_ACCOUNT_NAME } });
    return cash?.id || null;
  }

  async createAccount(data: any) {
    const name = String(data?.name || '').trim();
    if (!name) throw new BadRequestException('Account name is required');
    if (!ACCOUNT_TYPES.includes(data?.type)) {
      throw new BadRequestException(`Type must be one of: ${ACCOUNT_TYPES.join(', ')}`);
    }
    const account = await this.prisma.financialAccount.create({
      data: {
        name,
        type: data.type,
        description: data.description ? String(data.description).trim() : null,
        openingBalance: data.openingBalance !== undefined ? Number(data.openingBalance) || 0 : 0,
        openingBalanceDate: data.openingBalanceDate ? new Date(data.openingBalanceDate) : null,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      },
    });
    return mapAccount(account);
  }

  /** Name / type / description / active-status only. Opening balance has its own endpoint (Change 10). */
  async updateAccount(id: string, data: any) {
    await this.getAccountByIdOrThrow(id);
    const update: any = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new BadRequestException('Account name is required');
      update.name = name;
    }
    if (data.type !== undefined) {
      if (!ACCOUNT_TYPES.includes(data.type)) {
        throw new BadRequestException(`Type must be one of: ${ACCOUNT_TYPES.join(', ')}`);
      }
      update.type = data.type;
    }
    if (data.description !== undefined) update.description = data.description ? String(data.description).trim() : null;
    if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);

    const account = await this.prisma.financialAccount.update({ where: { id }, data: update });
    return mapAccount(account);
  }

  /**
   * Change 10 — Opening Balance Management.
   * Updates ONLY openingBalance / openingBalanceDate. Never touches
   * transaction history and never creates ledger rows — this exists purely
   * to let a business migrating from another system enter its starting
   * balances.
   */
  async setOpeningBalance(id: string, data: any) {
    await this.getAccountByIdOrThrow(id);
    if (data.openingBalance === undefined || data.openingBalance === null) {
      throw new BadRequestException('openingBalance is required');
    }
    const openingBalance = Number(data.openingBalance);
    if (!Number.isFinite(openingBalance)) throw new BadRequestException('openingBalance must be a number');

    const account = await this.prisma.financialAccount.update({
      where: { id },
      data: {
        openingBalance,
        openingBalanceDate: data.openingBalanceDate ? new Date(data.openingBalanceDate) : new Date(),
      },
    });
    return mapAccount(account);
  }

  // ── Money flow (the one place that reads every money-moving table) ─────

  private async getMoneyFlowRows(): Promise<FlowRow[]> {
    const [invoices, payments, receipts, salaries, miscEntries] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { status: 'PAID' },
        select: { invoiceNumber: true, total: true, paidAt: true, invoiceDate: true, paymentMethod: true, financialAccountId: true },
      }),
      this.prisma.vendorPayment.findMany({
        select: { paymentNumber: true, amount: true, paymentDate: true, paymentMethod: true, financialAccountId: true },
      }),
      this.prisma.vendorReceipt.findMany({
        select: { receiptNumber: true, amount: true, paymentDate: true, paymentMethod: true, financialAccountId: true },
      }),
      this.prisma.salaryPayment.findMany({
        where: { status: 'paid' },
        select: { paymentNumber: true, amountPaid: true, paymentDate: true, updatedAt: true, paymentMethod: true, financialAccountId: true },
      }),
      this.prisma.miscLedgerEntry.findMany({
        select: { label: true, referenceNumber: true, reference: true, amount: true, paymentDate: true, date: true, paymentMethod: true, financialAccountId: true },
      }),
    ]);

    const rows: FlowRow[] = [];

    for (const inv of invoices) {
      rows.push({
        date: inv.paidAt || inv.invoiceDate,
        source: 'Customer Invoice',
        reference: inv.invoiceNumber,
        amount: Number(inv.total || 0),
        direction: 'in',
        financialAccountId: inv.financialAccountId || null,
        paymentMethod: inv.paymentMethod || null,
      });
    }
    for (const p of payments) {
      rows.push({
        date: p.paymentDate,
        source: 'Vendor Payment',
        reference: p.paymentNumber,
        amount: Number(p.amount || 0),
        direction: 'out',
        financialAccountId: p.financialAccountId || null,
        paymentMethod: p.paymentMethod || null,
      });
    }
    for (const r of receipts) {
      rows.push({
        date: r.paymentDate,
        source: 'Vendor Receipt',
        reference: r.receiptNumber,
        amount: Number(r.amount || 0),
        direction: 'in',
        financialAccountId: r.financialAccountId || null,
        paymentMethod: r.paymentMethod || null,
      });
    }
    for (const s of salaries) {
      rows.push({
        date: s.paymentDate || s.updatedAt,
        source: 'Employee Payment',
        reference: s.paymentNumber,
        amount: Number(s.amountPaid || 0),
        direction: 'out',
        financialAccountId: s.financialAccountId || null,
        paymentMethod: s.paymentMethod || null,
      });
    }
    for (const m of miscEntries) {
      rows.push({
        date: m.paymentDate || m.date,
        source: 'Misc Expense',
        reference: m.referenceNumber || m.reference || m.label,
        amount: Number(m.amount || 0),
        direction: 'out',
        financialAccountId: m.financialAccountId || null,
        paymentMethod: m.paymentMethod || null,
      });
    }

    return rows;
  }

  private effectiveAccountId(row: FlowRow, cashAccountId: string | null): string | null {
    if (row.financialAccountId && ACCOUNT_LINKED_METHODS.has(row.paymentMethod || '')) return row.financialAccountId;
    if (cashAccountId && isCashLike(row.paymentMethod)) return cashAccountId;
    return null;
  }

  // ── Change 5: Chart of Accounts ─────────────────────────────────────────

  async getChartOfAccounts() {
    const [accounts, rows] = await Promise.all([this.listAccounts(), this.getMoneyFlowRows()]);
    const cashAccountId = accounts.find((a) => a.name === CASH_ACCOUNT_NAME)?.id || null;

    const sums = new Map<string, { in: number; out: number }>();
    for (const row of rows) {
      const accountId = this.effectiveAccountId(row, cashAccountId);
      if (!accountId) continue;
      const s = sums.get(accountId) || { in: 0, out: 0 };
      if (row.direction === 'in') s.in += row.amount;
      else s.out += row.amount;
      sums.set(accountId, s);
    }

    return accounts.map((account) => {
      const s = sums.get(account.id) || { in: 0, out: 0 };
      const currentBalance = Number(account.openingBalance || 0) + s.in - s.out;
      return { ...account, moneyIn: s.in, moneyOut: s.out, currentBalance };
    });
  }

  async getAccountBalance(id: string) {
    const account = await this.getAccountByIdOrThrow(id);
    const chart = await this.getChartOfAccounts();
    const entry = chart.find((a) => a.id === id);
    return entry || { ...account, moneyIn: 0, moneyOut: 0, currentBalance: account.openingBalance };
  }

  // ── Change 7: Financial Account Ledger ──────────────────────────────────

  async getAccountLedger(id: string, page = 1, pageSize = 25) {
    const account = await this.getAccountByIdOrThrow(id);
    const rows = await this.getMoneyFlowRows();
    const cashAccountId = await this.getCashAccountId();

    const matched = rows.filter((row) => this.effectiveAccountId(row, cashAccountId) === id);

    // Compute running balance chronologically (oldest first), then reverse
    // for display so the "Running Balance" of each row still reflects its
    // true position in time regardless of display order.
    matched.sort((a, b) => a.date.getTime() - b.date.getTime());
    let balance = Number(account.openingBalance || 0);
    const withBalance = matched.map((row) => {
      balance += row.direction === 'in' ? row.amount : -row.amount;
      return {
        date: row.date,
        source: row.source,
        reference: row.reference,
        moneyIn: row.direction === 'in' ? row.amount : 0,
        moneyOut: row.direction === 'out' ? row.amount : 0,
        runningBalance: balance,
      };
    });

    const newestFirst = withBalance.slice().reverse();
    const total = newestFirst.length;
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 25));
    const start = (safePage - 1) * safePageSize;
    const entries = newestFirst.slice(start, start + safePageSize);

    return {
      account,
      openingBalance: account.openingBalance,
      currentBalance: balance,
      total,
      page: safePage,
      pageSize: safePageSize,
      entries,
    };
  }
}
