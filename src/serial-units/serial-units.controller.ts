import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SerialUnitsService } from './serial-units.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('serial-units')
@UseGuards(JwtAuthGuard)
export class SerialUnitsController {
  constructor(private service: SerialUnitsService) {}

  @Get()
  findAll(@Query('productId') productId?: string) {
    return this.service.findAll(productId);
  }

  @Get('in-stock/by-product')
  findInStockByProductSearch(@Query('query') query = '') {
    return this.service.findInStockByProductSearch(query);
  }

  @Get(':serialNumber')
  findOne(@Param('serialNumber') serialNumber: string) {
    return this.service.findOne(serialNumber);
  }

  @Post()
  upsert(@Body() body: any) {
    return this.service.upsert(body);
  }

  @Patch(':serialNumber/sell')
  markSold(@Param('serialNumber') serialNumber: string, @Body() body: any) {
    return this.service.markSold(serialNumber, body);
  }

  @Patch(':serialNumber/restock')
  markInStock(@Param('serialNumber') serialNumber: string) {
    return this.service.markInStock(serialNumber);
  }

  @Patch(':serialNumber/return')
  returnSerial(@Param('serialNumber') serialNumber: string) {
    return this.service.returnSerial(serialNumber);
  }

  @Delete(':serialNumber')
  delete(@Param('serialNumber') serialNumber: string) {
    return this.service.delete(serialNumber);
  }
}
