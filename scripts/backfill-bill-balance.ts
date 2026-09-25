/**
 * Backfill script — run once after Phase 3 deployment.
 * Fixes bills where balanceAmount = 0 but status = unpaid (no payments).
 *
 * Run with: npx ts-node scripts/backfill-bill-balance.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find unpaid bills with balanceAmount = 0 and no payments
  const broken = await prisma.bill.findMany({
    where: {
      status: 'unpaid',
      balanceAmount: 0,
    },
    include: { payments: true },
  });

  const toFix = broken.filter(b => b.payments.length === 0);
  console.log(`Found ${toFix.length} bills to backfill.`);

  let fixed = 0;
  for (const bill of toFix) {
    await prisma.bill.update({
      where: { id: bill.id },
      data: { balanceAmount: bill.amount, paidAmount: 0 },
    });
    fixed++;
    console.log(`  Fixed ${bill.billNumber}: balanceAmount → ${bill.amount}`);
  }

  console.log(`Done. Fixed ${fixed} bills.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
