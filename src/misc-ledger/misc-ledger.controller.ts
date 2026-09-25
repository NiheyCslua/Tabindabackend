import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { MiscLedgerService } from './misc-ledger.service';

@Controller('misc-ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class MiscLedgerController {
  constructor(private readonly miscLedgerService: MiscLedgerService) {}

  @Get()
  findAll(
    @Query('label') label?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.miscLedgerService.findAll({ label, from, to, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.miscLedgerService.findOne(id);
  }

  @Post()
  create(@Body() body: any, @Req() request: any) {
    return this.miscLedgerService.create(body, request?.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.miscLedgerService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.miscLedgerService.remove(id);
  }
}
