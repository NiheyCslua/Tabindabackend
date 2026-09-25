import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FinancialAccountsModule } from 'src/financial-accounts/financial-accounts.module';

@Module({
imports: [PrismaModule, FinancialAccountsModule],
controllers: [InvoicesController],
providers: [InvoicesService],
})
export class InvoicesModule {}
