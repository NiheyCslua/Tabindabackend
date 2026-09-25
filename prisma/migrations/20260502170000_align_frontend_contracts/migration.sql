ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT, ADD COLUMN IF NOT EXISTS "department" TEXT, ADD COLUMN IF NOT EXISTS "position" TEXT, ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active', ADD COLUMN IF NOT EXISTS "salary" DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS "hireDate" TIMESTAMP(3);

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sku" TEXT, ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'General', ADD COLUMN IF NOT EXISTS "brand" TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "reorderLevel" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "maxStock" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active', ADD COLUMN IF NOT EXISTS "image" TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS "images" JSONB, ADD COLUMN IF NOT EXISTS "variants" JSONB;
UPDATE "Product" SET "sku" = COALESCE("sku", "id"), "costPrice" = "price", "sellingPrice" = "price", "quantity" = "stock";
ALTER TABLE "Product" ALTER COLUMN "sku" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product"("sku");
ALTER TABLE "Product" DROP COLUMN IF EXISTS "price";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "stock";

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT, ADD COLUMN IF NOT EXISTS "customerName" TEXT, ADD COLUMN IF NOT EXISTS "customerEmail" TEXT, ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'cash', ADD COLUMN IF NOT EXISTS "template" TEXT, ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "notes" TEXT, ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
UPDATE "Invoice" i SET "invoiceNumber" = COALESCE(i."invoiceNumber", i."id"), "customerName" = COALESCE(i."customerName", c."name", ''), "customerEmail" = COALESCE(i."customerEmail", c."email"), "subtotal" = CASE WHEN i."subtotal" = 0 THEN i."total" ELSE i."subtotal" END FROM "Customer" c WHERE i."customerId" = c."id";
UPDATE "Invoice" SET "invoiceNumber" = COALESCE("invoiceNumber", "id"), "customerName" = COALESCE("customerName", ''), "subtotal" = CASE WHEN "subtotal" = 0 THEN "total" ELSE "subtotal" END;
ALTER TABLE "Invoice" ALTER COLUMN "invoiceNumber" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "customerName" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "customerId" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "productName" TEXT, ADD COLUMN IF NOT EXISTS "productSku" TEXT;
UPDATE "InvoiceItem" ii SET "unitPrice" = ii."price", "productName" = COALESCE(ii."productName", p."name", ''), "productSku" = COALESCE(ii."productSku", p."sku", ii."productId") FROM "Product" p WHERE ii."productId" = p."id";
UPDATE "InvoiceItem" SET "productName" = COALESCE("productName", ''), "productSku" = COALESCE("productSku", "productId"), "total" = CASE WHEN "total" = 0 THEN "quantity" * "unitPrice" ELSE "total" END;
ALTER TABLE "InvoiceItem" ALTER COLUMN "productName" SET NOT NULL;
ALTER TABLE "InvoiceItem" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "InvoiceItem" DROP COLUMN IF EXISTS "price";

ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "notes" TEXT, ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Bill_billNumber_key" ON "Bill"("billNumber");

ALTER TABLE "BillItem" ADD COLUMN IF NOT EXISTS "productName" TEXT, ADD COLUMN IF NOT EXISTS "productSku" TEXT;
UPDATE "BillItem" bi SET "productName" = COALESCE(bi."productName", p."name", ''), "productSku" = COALESCE(bi."productSku", p."sku", bi."productId") FROM "Product" p WHERE bi."productId" = p."id";
UPDATE "BillItem" SET "productName" = COALESCE("productName", ''), "productSku" = COALESCE("productSku", "productId");
ALTER TABLE "BillItem" ALTER COLUMN "productName" SET NOT NULL;
ALTER TABLE "BillItem" ALTER COLUMN "productId" DROP NOT NULL;

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_customerId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" DROP CONSTRAINT IF EXISTS "InvoiceItem_invoiceId_fkey";
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" DROP CONSTRAINT IF EXISTS "InvoiceItem_productId_fkey";
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillItem" DROP CONSTRAINT IF EXISTS "BillItem_billId_fkey";
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillItem" DROP CONSTRAINT IF EXISTS "BillItem_productId_fkey";
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
