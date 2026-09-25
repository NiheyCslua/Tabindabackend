import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialAccountsService, CREDIT_CARD_ACCOUNTS } from 'src/financial-accounts/financial-accounts.service';

// Bank Transfer, Cheque and Credit Card all use the shared Financial
// Account selector; Cash maps automatically elsewhere and never needs one
// (Chart of Accounts Corrections — Change 2).
const ACCOUNT_LINKED_METHODS = new Set(['bank_transfer', 'cheque', 'credit_card']);

type MiscLedgerFilters = {
  label?: string;
  from?: string;
  to?: string;
  search?: string;
};

const toDateOnly = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'string') return value.split('T')[0];
  return value;
};

const mapMiscLedgerEntry = (entry: any) => ({
  id: entry.id,
  label: entry.label,
  description: entry.description || null,
  amount: Number(entry.amount || 0),
  date: toDateOnly(entry.date),
  // Standard financial metadata — matches Vendor Payments / Invoice Payments
  paymentMethod: entry.paymentMethod || null,
  financialAccountId: entry.financialAccountId || null,
  referenceNumber: entry.referenceNumber || entry.reference || null,
  paymentDate: entry.paymentDate ? toDateOnly(entry.paymentDate) : null,
  // Legacy field kept for backward compat
  reference: entry.reference || null,
  notes: entry.notes || null,
  createdById: entry.createdById || null,
  createdByName: entry.createdByName || null,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const normalizeText = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const parseDate = (value: unknown, message: string) => {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
  return date;
};

@Injectable()
export class MiscLedgerService {
  constructor(
    private prisma: PrismaService,
    private financialAccounts: FinancialAccountsService,
  ) {}

  async findAll(filters: MiscLedgerFilters = {}) {
    const where: any = {};
    const and: any[] = [];

    const label = normalizeText(filters.label);
    if (label) {
      and.push({ label: { contains: label, mode: 'insensitive' } });
    }

    if (filters.from || filters.to) {
      const dateFilter: any = {};
      if (filters.from) dateFilter.gte = parseDate(filters.from, 'Invalid from date');
      if (filters.to) {
        const toDate = parseDate(filters.to, 'Invalid to date');
        toDate.setHours(23, 59, 59, 999);
        dateFilter.lte = toDate;
      }
      and.push({ date: dateFilter });
    }

    const search = normalizeText(filters.search);
    if (search) {
      and.push({
        OR: [
          { label: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { paymentMethod: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { createdByName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (and.length > 0) where.AND = and;

    const entries = await this.prisma.miscLedgerEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return entries.map(mapMiscLedgerEntry);
  }

  async findOne(id: string) {
    const entry = await this.prisma.miscLedgerEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Miscellaneous ledger entry not found');
    return mapMiscLedgerEntry(entry);
  }

  async create(data: any, user?: any) {
    const label = normalizeText(data.label);
    const amount = Number(data.amount);

    if (!label) throw new BadRequestException('Expense label is required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (!data.date) throw new BadRequestException('Expense date is required');

    let createdByName: string | null = null;
    if (user?.userId) {
      const creator = await this.prisma.user.findUnique({ where: { id: user.userId } });
      createdByName = creator?.name || user.email || null;
    }

    const paymentMethod = normalizeText(data.paymentMethod) || 'cash';
    let financialAccountId: string | null = null;
    if (ACCOUNT_LINKED_METHODS.has(paymentMethod)) {
      const idOrName = data.financialAccountId;
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

    // Cast to `any` because the Prisma client was generated before the
    // migration that added financialAccountId / referenceNumber / paymentDate.
    // Once `prisma migrate dev` (or `prisma generate`) is run these types will
    // be correct and the cast can be removed.
    const entry = await this.prisma.miscLedgerEntry.create({
      data: {
        label,
        description: normalizeText(data.description),
        amount,
        date: parseDate(data.date, 'Invalid expense date'),
        // Standard financial metadata
        paymentMethod,
        financialAccountId,
        referenceNumber: normalizeText(data.referenceNumber),
        paymentDate: data.paymentDate ? parseDate(data.paymentDate, 'Invalid payment date') : null,
        // Legacy field
        reference: normalizeText(data.referenceNumber ?? data.reference),
        notes: normalizeText(data.notes),
        createdById: user?.userId || null,
        createdByName,
      } as any,
    });

    return mapMiscLedgerEntry(entry);
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.miscLedgerEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Miscellaneous ledger entry not found');

    const updateData: any = {};

    if (data.label !== undefined) {
      const label = normalizeText(data.label);
      if (!label) throw new BadRequestException('Expense label is required');
      updateData.label = label;
    }

    if (data.amount !== undefined) {
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('Amount must be greater than zero');
      }
      updateData.amount = amount;
    }

    if (data.date !== undefined) {
      if (!data.date) throw new BadRequestException('Expense date is required');
      updateData.date = parseDate(data.date, 'Invalid expense date');
    }

    if (data.description !== undefined) updateData.description = normalizeText(data.description);
    if (data.paymentMethod !== undefined) updateData.paymentMethod = normalizeText(data.paymentMethod);
    if (data.financialAccountId !== undefined) {
      if (data.financialAccountId) {
        const account = await this.financialAccounts.resolveAccount(data.financialAccountId);
        if (!account) throw new BadRequestException('Invalid financial account');
        const effectiveMethod = data.paymentMethod !== undefined ? normalizeText(data.paymentMethod) : existing.paymentMethod;
        if (effectiveMethod === 'credit_card' && !CREDIT_CARD_ACCOUNTS.includes(account.name)) {
          throw new BadRequestException(`Credit Card payments can only use: ${CREDIT_CARD_ACCOUNTS.join(', ')}`);
        }
        updateData.financialAccountId = account.id;
      } else {
        updateData.financialAccountId = null;
      }
    }
    if (data.referenceNumber !== undefined) {
      updateData.referenceNumber = normalizeText(data.referenceNumber);
      updateData.reference = normalizeText(data.referenceNumber); // keep legacy field in sync
    }
    if (data.reference !== undefined && data.referenceNumber === undefined) {
      updateData.reference = normalizeText(data.reference);
    }
    if (data.paymentDate !== undefined) {
      updateData.paymentDate = data.paymentDate ? parseDate(data.paymentDate, 'Invalid payment date') : null;
    }
    if (data.notes !== undefined) updateData.notes = normalizeText(data.notes);

    const updated = await this.prisma.miscLedgerEntry.update({
      where: { id },
      data: updateData,
    });

    return mapMiscLedgerEntry(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.miscLedgerEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Miscellaneous ledger entry not found');

    const deleted = await this.prisma.miscLedgerEntry.delete({ where: { id } });
    return mapMiscLedgerEntry(deleted);
  }
}
