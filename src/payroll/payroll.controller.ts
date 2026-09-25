import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PayrollController {
  constructor(private service: PayrollService) {}

  // ── Salary Advances ──────────────────────────────────────────────────────

  @Get('salary-advances')
  getAdvances(@Query('employeeId') employeeId?: string) {
    return this.service.getAllAdvances(employeeId);
  }

  @Post('salary-advances')
  createAdvance(@Body() body: any) {
    return this.service.createAdvance(body);
  }

  @Patch('salary-advances/:id')
  updateAdvance(@Param('id') id: string, @Body() body: any) {
    return this.service.updateAdvance(id, body);
  }

  @Patch('salary-advances/:id/cancel')
  cancelAdvance(@Param('id') id: string) {
    return this.service.cancelAdvance(id);
  }

  // ── Salary Payments ──────────────────────────────────────────────────────

  @Get('salary-payments')
  getPayments(@Query('employeeId') employeeId?: string) {
    return this.service.getAllPayments(employeeId);
  }

  @Post('salary-payments')
  createPayment(@Body() body: any) {
    return this.service.createPayment(body);
  }

  @Patch('salary-payments/:id/pay')
  markAsPaid(@Param('id') id: string, @Body() body: any) {
    return this.service.markAsPaid(id, body || {});
  }

  @Patch('salary-payments/:id/cancel')
  cancelPayment(@Param('id') id: string) {
    return this.service.cancelPayment(id);
  }

  // ── Employee Ledger ──────────────────────────────────────────────────────

  @Get('employee-ledger')
  getLedger(@Query('employeeId') employeeId?: string) {
    return this.service.getLedger(employeeId);
  }

  @Post('employee-ledger')
  createLedgerEntry(@Body() body: any) {
    return this.service.createLedgerEntry(body);
  }
}
