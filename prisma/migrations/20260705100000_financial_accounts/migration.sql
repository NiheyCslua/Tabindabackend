-- Phase 5: Financial Accounts (Chart of Accounts foundation)
--
-- 1. Creates the FinancialAccount master table.
-- 2. Seeds the default Cash / Bank / Mobile Wallet accounts with fixed IDs
--    so this migration is idempotent and other seed/backfill statements can
--    rely on stable ids.
-- 3. Adds `financialAccountId` to Invoice, VendorPayment, VendorReceipt and
--    SalaryPayment (new columns — legacy `bankAccount` / name-only columns
--    are left in place for backward compatibility).
-- 4. Backfills `financialAccountId` on existing rows by matching the legacy
--    bank-name text (`bankAccount`, or MiscLedgerEntry.financialAccountId
--    which historically stored the bank *name* rather than an id) against
--    the newly seeded FinancialAccount records.
--
-- No FOREIGN KEY constraint is added on purpose — every other soft-reference
-- in this schema (e.g. MiscLedgerEntry.financialAccountId prior to this
-- migration) follows the same pattern, and it keeps this migration safe to
-- run even if some legacy rows reference a bank name that no longer exists.

-- 1. Enum + table --------------------------------------------------------------
CREATE TYPE "FinancialAccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_WALLET');

CREATE TABLE "FinancialAccount" (
    "id"                 TEXT NOT NULL,
    "name"               TEXT NOT NULL,
    "type"               "FinancialAccountType" NOT NULL,
    "openingBalance"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalanceDate" TIMESTAMP(3),
    "description"        TEXT,
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialAccount_name_key" ON "FinancialAccount"("name");

-- 2. Seed default accounts (fixed ids — do not change) ------------------------
INSERT INTO "FinancialAccount" ("id", "name", "type", "isActive")
VALUES
    ('00000000-0000-4000-8000-000000000001', 'Cash in Hand', 'CASH',          true),
    ('00000000-0000-4000-8000-000000000002', 'HBL',          'BANK',          true),
    ('00000000-0000-4000-8000-000000000003', 'Meezan',       'BANK',          true),
    ('00000000-0000-4000-8000-000000000004', 'Alfalah',      'BANK',          true),
    ('00000000-0000-4000-8000-000000000005', 'MCB',          'BANK',          true),
    ('00000000-0000-4000-8000-000000000006', 'Easypaisa',    'MOBILE_WALLET', true),
    ('00000000-0000-4000-8000-000000000007', 'JazzCash',     'MOBILE_WALLET', true)
ON CONFLICT ("name") DO NOTHING;

-- 3. New financialAccountId columns --------------------------------------------
ALTER TABLE "Invoice"       ADD COLUMN IF NOT EXISTS "financialAccountId" TEXT;
ALTER TABLE "VendorPayment" ADD COLUMN IF NOT EXISTS "financialAccountId" TEXT;
ALTER TABLE "VendorReceipt" ADD COLUMN IF NOT EXISTS "financialAccountId" TEXT;
ALTER TABLE "SalaryPayment" ADD COLUMN IF NOT EXISTS "financialAccountId" TEXT;

-- 4. Backfill from legacy bank-name text ---------------------------------------
-- Invoice / VendorPayment / VendorReceipt stored the bank name in
-- `bankAccount` (e.g. "HBL", "Easypaisa"). Resolve it to the matching
-- FinancialAccount id.
UPDATE "Invoice" i
SET "financialAccountId" = fa."id"
FROM "FinancialAccount" fa
WHERE fa."name" = i."bankAccount"
  AND i."financialAccountId" IS NULL;

UPDATE "VendorPayment" p
SET "financialAccountId" = fa."id"
FROM "FinancialAccount" fa
WHERE fa."name" = p."bankAccount"
  AND p."financialAccountId" IS NULL;

UPDATE "VendorReceipt" r
SET "financialAccountId" = fa."id"
FROM "FinancialAccount" fa
WHERE fa."name" = r."bankAccount"
  AND r."financialAccountId" IS NULL;

-- MiscLedgerEntry.financialAccountId previously stored the bank *name*
-- (there was no FinancialAccount table yet). Resolve those existing values
-- to real FinancialAccount ids so Misc Ledger entries participate in the
-- Chart of Accounts without any further migration.
UPDATE "MiscLedgerEntry" m
SET "financialAccountId" = fa."id"
FROM "FinancialAccount" fa
WHERE fa."name" = m."financialAccountId";
