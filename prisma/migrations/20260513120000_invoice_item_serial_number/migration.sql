-- Add optional serial number support for invoice line items.
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "serialNumber" TEXT;
