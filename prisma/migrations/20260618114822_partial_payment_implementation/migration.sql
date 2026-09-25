/*
  Warnings:

  - You are about to drop the column `bankTitle` on the `VendorPayment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "VendorPayment" DROP COLUMN "bankTitle",
ADD COLUMN     "balanceAfterPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "bankAccount" TEXT;
