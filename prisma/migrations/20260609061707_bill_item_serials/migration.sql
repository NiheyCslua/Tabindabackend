/*
  Warnings:

  - Made the column `phone` on table `Customer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `Vendor` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Bill_paidAt_idx";

-- DropIndex
DROP INDEX "Invoice_paidAt_idx";

-- DropIndex
DROP INDEX "MiscLedgerEntry_date_idx";

-- DropIndex
DROP INDEX "MiscLedgerEntry_label_idx";

-- AlterTable
ALTER TABLE "BillItem" ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "serialNumbers" JSONB;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "phone" SET NOT NULL;

-- AlterTable
ALTER TABLE "ProductCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Vendor" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "phone" SET NOT NULL;
