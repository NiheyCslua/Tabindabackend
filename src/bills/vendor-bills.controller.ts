import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { BillsService } from './bills.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

/** Frontend compatibility: the UI calls /vendors/bills, while the original backend exposed /bills. */
@Controller('vendors/bills')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorBillsController {
  constructor(private billsService: BillsService) {}
  @Post() @Roles('ADMIN') create(@Body() body) { return this.billsService.createBill(body); }
  @Get() findAll() { return this.billsService.getAllBills(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.billsService.getBillById(id); }
  @Patch(':id') @Roles('ADMIN') update(@Param('id') id: string, @Body() body) { return this.billsService.updateBill(id, body); }
  @Patch(':id/status') @Roles('ADMIN') updateStatus(@Param('id') id: string, @Body() body) { return this.billsService.updateBillStatus(id, body.status); }
  @Delete(':id') @Roles('ADMIN') remove(@Param('id') id: string) { return this.billsService.deleteBill(id); }
}
