-- Phase – Sales Improvements: Service Invoices
--
-- Service Invoices reuse the exact same Invoice engine as Product
-- Invoices — numbering, customers, payment methods, taxes, QR codes,
-- printing, reports, and Chart of Accounts integration are all shared.
-- The only structural difference is this type flag (which also drives
-- whether Terms & Conditions is shown/printed) and how line items are
-- entered on the frontend (manual description + price instead of product
-- selection — InvoiceItem.productId/productSku simply stay null for those
-- lines, which the existing inventory-decrement logic already skips).
--
-- Every existing invoice defaults to PRODUCT, so nothing changes for them.

CREATE TYPE "InvoiceType" AS ENUM ('PRODUCT', 'SERVICE');

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "invoiceType" "InvoiceType" NOT NULL DEFAULT 'PRODUCT';
