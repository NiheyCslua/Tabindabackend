/*
  Warnings:

  - You are about to drop the column `barcode` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `vendorId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `vendorName` on the `Product` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[upc]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "barcode",
DROP COLUMN "vendorId",
DROP COLUMN "vendorName",
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "upc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_upc_key" ON "Product"("upc");
