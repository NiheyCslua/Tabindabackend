import { Module } from '@nestjs/common';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { VendorBillsController } from './vendor-bills.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BillsController, VendorBillsController],
  providers: [BillsService],
})
export class BillsModule {}
