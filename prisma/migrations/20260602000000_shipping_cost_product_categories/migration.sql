-- Add shipping charges to customer invoices.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "shippingCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Persist reusable product categories instead of relying on hard-coded frontend values.
CREATE TABLE IF NOT EXISTS "ProductCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_name_key" ON "ProductCategory"("name");

-- Preserve categories already in use by existing products so they remain selectable.
INSERT INTO "ProductCategory" ("id", "name", "createdAt", "updatedAt")
SELECT DISTINCT md5(trim("category")), trim("category"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product"
WHERE "category" IS NOT NULL AND trim("category") <> ''
ON CONFLICT ("name") DO NOTHING;
