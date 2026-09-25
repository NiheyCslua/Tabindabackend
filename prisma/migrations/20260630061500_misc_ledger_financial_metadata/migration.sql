-- Add standardised financial metadata fields to MiscLedgerEntry.
-- These match the field names used by Vendor Payments and Invoice Payments so
-- that Misc Ledger transactions automatically participate in the Phase 5
-- Chart of Accounts without a further migration.
--
-- `notes` and `reference` are intentionally left intact for backward
-- compatibility with existing entries.

ALTER TABLE "MiscLedgerEntry" ADD COLUMN IF NOT EXISTS "financialAccountId" TEXT;
ALTER TABLE "MiscLedgerEntry" ADD COLUMN IF NOT EXISTS "referenceNumber"    TEXT;
ALTER TABLE "MiscLedgerEntry" ADD COLUMN IF NOT EXISTS "paymentDate"        TIMESTAMP(3);
