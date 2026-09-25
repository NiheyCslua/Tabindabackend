import { Module } from '@nestjs/common';
import { VendorPaymentsService } from './vendor-payments.service';
import { VendorPaymentsController } from './vendor-payments.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FinancialAccountsModule } from 'src/financial-accounts/financial-accounts.module';

@Module({
  imports: [PrismaModule, FinancialAccountsModule],
  controllers: [VendorPaymentsController],
  providers: [VendorPaymentsService],
  exports: [VendorPaymentsService],
})
export class VendorPaymentsModule {}
