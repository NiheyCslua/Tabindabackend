import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorsController {
  constructor(private vendorsService: VendorsService) {}
  @Post() @Roles('ADMIN') create(@Body() body) { return this.vendorsService.createVendor(body); }
  @Patch(':id') @Roles('ADMIN') update(@Param('id') id: string, @Body() body) { return this.vendorsService.updateVendor(id, body); }
  @Get() findAll() { return this.vendorsService.getAllVendors(); }
  @Delete(':id') @Roles('ADMIN') remove(@Param('id') id: string) { return this.vendorsService.deleteVendor(id); }
}
