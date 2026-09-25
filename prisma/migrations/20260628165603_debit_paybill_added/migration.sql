-- CreateTable
CREATE TABLE "VendorReceipt" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorBillId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "bankAccount" TEXT,
    "referenceNumber" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "balanceAfterPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorReceipt_receiptNumber_key" ON "VendorReceipt"("receiptNumber");

-- AddForeignKey
ALTER TABLE "VendorReceipt" ADD CONSTRAINT "VendorReceipt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReceipt" ADD CONSTRAINT "VendorReceipt_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
