/*
  Warnings:

  - You are about to drop the column `bankTitle` on the `VendorPayment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[vendorId,billNumber]` on the table `Bill` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Bill_billNumber_key";

-- AlterTable
ALTER TABLE "VendorPayment" DROP COLUMN "bankTitle",
ADD COLUMN     "balanceAfterPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "bankAccount" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Bill_vendorId_billNumber_key" ON "Bill"("vendorId", "billNumber");
