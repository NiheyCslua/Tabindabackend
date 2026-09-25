/*
  Warnings:

  - You are about to drop the column `balanceAfterPayment` on the `VendorPayment` table. All the data in the column will be lost.
  - You are about to drop the column `bankAccount` on the `VendorPayment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "VendorPayment" DROP COLUMN "balanceAfterPayment",
DROP COLUMN "bankAccount",
ADD COLUMN     "bankTitle" TEXT;
