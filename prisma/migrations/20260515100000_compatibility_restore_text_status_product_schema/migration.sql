-- Keep the database schema aligned with the compatibility Prisma schema.
-- The frontend still receives these product fields as API placeholders, but the
-- backend no longer requires physical Product columns for them.
ALTER TABLE "Product" DROP COLUMN IF EXISTS "upc";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "barcode";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "serialNumber";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "serialNumbers";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "vendorId";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "vendorName";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "image";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "images";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "variants";

-- Convert invoice status from the older PostgreSQL enum to a plain text field.
-- This avoids enum-value drift between existing databases and frontend status
-- values such as pending/paid/cancelled/overdue.
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'pending';
DROP TYPE IF EXISTS "InvoiceStatus";
