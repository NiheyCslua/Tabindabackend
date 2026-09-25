-- Add Purchase Order number to Invoice.
--
-- Purely optional, freeform text per invoice. The "PO" heading only prints
-- on the invoice when this has a value — left blank, nothing shows at all
-- (same pattern as Invoice.termsAndConditions and
-- InvoiceItem.productDescription: nullable, never a forced placeholder).

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "poNumber" TEXT;
