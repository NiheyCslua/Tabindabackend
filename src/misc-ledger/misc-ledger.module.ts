import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MiscLedgerController } from './misc-ledger.controller';
import { MiscLedgerService } from './misc-ledger.service';
import { FinancialAccountsModule } from 'src/financial-accounts/financial-accounts.module';

@Module({
  imports: [PrismaModule, FinancialAccountsModule],
  controllers: [MiscLedgerController],
  providers: [MiscLedgerService],
})
export class MiscLedgerModule {}
