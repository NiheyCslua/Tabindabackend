-- DropForeignKey
ALTER TABLE "VendorPayment" DROP CONSTRAINT "VendorPayment_vendorBillId_fkey";

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
