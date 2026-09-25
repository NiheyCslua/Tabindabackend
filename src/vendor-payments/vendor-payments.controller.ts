import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { VendorPaymentsService } from './vendor-payments.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('vendor-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorPaymentsController {
  constructor(private service: VendorPaymentsService) {}

  // All specific string routes MUST come before any :param wildcards
  // so NestJS doesn't swallow them with the :id route.

  @Post()
  @Roles('ADMIN') create(@Body() b) { return this.service.createPayment(b); }

  @Get()
  @Roles('ADMIN') findAll() { return this.service.getAllPayments(); }

  @Get('unpaid-bills')
  @Roles('ADMIN') unpaidBills() { return this.service.getUnpaidBills(); }

  @Get('vendor-summaries')
  @Roles('ADMIN') vendorSummaries() { return this.service.getAllVendorSummaries(); }

  @Get('receipts')
  @Roles('ADMIN') findAllReceipts() { return this.service.getAllReceipts(); }

  @Post('receipts')
  @Roles('ADMIN') createReceipt(@Body() b) { return this.service.createReceipt(b); }

  @Get('receipts/unpaid-debit-bills')
  @Roles('ADMIN') unpaidDebitBills() { return this.service.getUnpaidDebitBills(); }

  // Param routes — ordered most-specific first
  @Get('vendor/:vendorId/ledger')
  @Roles('ADMIN') vendorLedger(@Param('vendorId') id: string) { return this.service.getVendorLedger(id); }

  @Get('bill/:billId')
  @Roles('ADMIN') byBill(@Param('billId') id: string) { return this.service.getPaymentsByBill(id); }

  @Get('receipts/bill/:billId')
  @Roles('ADMIN') receiptsByBill(@Param('billId') id: string) { return this.service.getReceiptsByBill(id); }

  @Get('receipts/:id')
  @Roles('ADMIN') findOneReceipt(@Param('id') id: string) { return this.service.getReceiptById(id); }

  // :id wildcard LAST — catches anything not matched above
  @Get(':id')
  @Roles('ADMIN') findOne(@Param('id') id: string) { return this.service.getPaymentById(id); }
}
