import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EmployeesController } from './employees.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
imports: [PrismaModule],
providers: [UsersService],
controllers: [UsersController, EmployeesController],
})
export class UsersModule {}
