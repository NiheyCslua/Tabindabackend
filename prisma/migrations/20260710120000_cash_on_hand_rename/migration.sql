-- Chart of Accounts Corrections — Change 2: Standardize Cash Handling
--
-- The application previously had two competing names for the same concept:
-- the seeded FinancialAccount was called "Cash in Hand" while the product
-- spec (and some UI copy) refers to the single cash account as
-- "Cash on Hand". Rename the existing seeded row in place — using the fixed
-- id from the 20260705100000_financial_accounts migration — so any Invoice /
-- VendorPayment / VendorReceipt / SalaryPayment / MiscLedgerEntry rows that
-- already reference this account by id are unaffected.
--
-- Idempotent: if a fresh environment seeds "Cash on Hand" directly (see the
-- updated seed statement below) this UPDATE simply matches zero rows.

UPDATE "FinancialAccount"
SET "name" = 'Cash on Hand'
WHERE "id" = '00000000-0000-4000-8000-000000000001'
  AND "name" = 'Cash in Hand';

-- Safety net for any environment where the row exists under a different id
-- but was still seeded with the old name.
UPDATE "FinancialAccount"
SET "name" = 'Cash on Hand'
WHERE "name" = 'Cash in Hand';

-- Re-seed for fresh databases that haven't run the original seed yet.
-- NOTE: no arbiter column specified — this row can conflict on either the
-- primary key (id, already reused above) or the name unique index, and
-- Postgres only suppresses the constraint(s) explicitly named in ON
-- CONFLICT (col). Leaving it unqualified catches either.
-- "updatedAt" has no DB-level default (dropped by 20260706061135_chart_of_
-- accounts — Prisma sets it via @updatedAt at the ORM layer instead), so it
-- must be supplied explicitly or this INSERT fails NOT NULL before ON
-- CONFLICT is even evaluated.
INSERT INTO "FinancialAccount" ("id", "name", "type", "isActive", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Cash on Hand', 'CASH', true, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
