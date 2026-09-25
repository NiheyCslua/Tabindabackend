-- Invoice Product Description – Editable Per Line Item
--
-- Each invoice line item stores its own independent copy of the product's
-- description, copied from the Product Master at the moment the line was
-- added. Same design as Invoice.termsAndConditions: editing it never
-- touches the Product Master, and editing the Product Master never
-- touches existing invoices. Nullable so existing invoice line items are
-- unaffected — printing falls back to omitting the description entirely
-- for any line that predates this feature (never re-derived from the
-- Product Master).

ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "productDescription" TEXT;
