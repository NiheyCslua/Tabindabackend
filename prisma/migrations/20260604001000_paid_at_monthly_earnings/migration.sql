-- Track the actual date invoices and vendor bills were paid so monthly earnings
-- are based on payment timing instead of creation or bill dates.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Backfill existing paid records with their document dates so current data
-- appears in monthly earnings immediately after the migration.
UPDATE "Invoice"
SET "paidAt" = COALESCE("invoiceDate", "createdAt")
WHERE "paidAt" IS NULL AND "status" = 'PAID';

UPDATE "Bill"
SET "paidAt" = COALESCE("date", "createdAt")
WHERE "paidAt" IS NULL AND lower("status") = 'paid';

CREATE INDEX IF NOT EXISTS "Invoice_paidAt_idx" ON "Invoice"("paidAt");
CREATE INDEX IF NOT EXISTS "Bill_paidAt_idx" ON "Bill"("paidAt");
