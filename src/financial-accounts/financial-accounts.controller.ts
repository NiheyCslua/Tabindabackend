import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { FinancialAccountsService } from './financial-accounts.service';

@Controller('financial-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancialAccountsController {
  constructor(private readonly financialAccountsService: FinancialAccountsService) {}

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.financialAccountsService.listAccounts(activeOnly === 'true');
  }

  // NOTE: static routes must be declared before ':id' so Nest doesn't treat
  // "chart-of-accounts" as an account id.
  @Get('chart-of-accounts')
  getChartOfAccounts() {
    return this.financialAccountsService.getChartOfAccounts();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.financialAccountsService.getAccountByIdOrThrow(id);
  }

  @Get(':id/balance')
  getBalance(@Param('id') id: string) {
    return this.financialAccountsService.getAccountBalance(id);
  }

  @Get(':id/ledger')
  getLedger(@Param('id') id: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.financialAccountsService.getAccountLedger(id, Number(page) || 1, Number(pageSize) || 25);
  }

  @Post() @Roles('ADMIN')
  create(@Body() body: any) {
    return this.financialAccountsService.createAccount(body);
  }

  @Patch(':id') @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.financialAccountsService.updateAccount(id, body);
  }

  @Patch(':id/opening-balance') @Roles('ADMIN')
  setOpeningBalance(@Param('id') id: string, @Body() body: any) {
    return this.financialAccountsService.setOpeningBalance(id, body);
  }
}
