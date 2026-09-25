import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
imports: [PrismaModule],
controllers: [VendorsController],
providers: [VendorsService],
})
export class VendorsModule {}
