import { Module } from '@nestjs/common';
import { SerialUnitsService } from './serial-units.service';
import { SerialUnitsController } from './serial-units.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SerialUnitsController],
  providers: [SerialUnitsService],
  exports: [SerialUnitsService],
})
export class SerialUnitsModule {}
