-- Store scanned serial numbers on invoice line items for internal invoice views.
-- The printable invoice keeps using product/quantity/pricing only.
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "serialNumber" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "serialNumbers" JSONB;
