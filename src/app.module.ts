import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomersModule } from './customers/customers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { VendorsModule } from './vendors/vendors.module';
import { BillsModule } from './bills/bills.module';
import { UsersModule } from './users/users.module';
import { PayrollModule } from './payroll/payroll.module';
import { MiscLedgerModule } from './misc-ledger/misc-ledger.module';
import { ReportsModule } from './reports/reports.module';
import { SerialUnitsModule } from './serial-units/serial-units.module';

import { VendorPaymentsModule } from './vendor-payments/vendor-payments.module';
import { FinancialAccountsModule } from './financial-accounts/financial-accounts.module';
import { InvoiceTemplatesModule } from './invoice-templates/invoice-templates.module';

@Module({
  imports: [AuthModule, PrismaModule, InventoryModule, CustomersModule, InvoicesModule, DashboardModule, VendorsModule, BillsModule, UsersModule, PayrollModule, MiscLedgerModule, ReportsModule, SerialUnitsModule, VendorPaymentsModule, FinancialAccountsModule, InvoiceTemplatesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
