import { Body, Controller, Delete, Get, Header, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}
  @Post() createInvoice(@Body() body) { return this.invoicesService.createInvoice(body); }
  // Invoice Terms & Conditions Persistence: GET responses must never be
  // served stale by a browser's HTTP cache, a corporate/mobile proxy, or a
  // CDN sitting in front of the API. Without an explicit directive here,
  // a device that viewed this invoice before a Terms & Conditions edit (on
  // a different device) could keep serving its own cached copy of the old
  // response indefinitely — which looks exactly like "edits don't show up
  // on another device" even though the database and every other device are
  // already correct.
  @Get() @Header('Cache-Control', 'no-store, no-cache, must-revalidate') getAllInvoices() { return this.invoicesService.getAllInvoices(); }
  @Get(':id') @Header('Cache-Control', 'no-store, no-cache, must-revalidate') getInvoice(@Param('id') id: string) { return this.invoicesService.getInvoiceById(id); }
  @Patch(':id') updateInvoice(@Param('id') id: string, @Body() body) { return this.invoicesService.updateInvoice(id, body); }
  @Patch(':id/status') updateStatus(@Param('id') id: string, @Body() body) { return this.invoicesService.updateInvoiceStatus(id, body.status); }
  @Patch(':id/pay') markAsPaid(@Param('id') id: string) { return this.invoicesService.markAsPaid(id); }
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deleteInvoice(@Param('id') id: string) { return this.invoicesService.deleteInvoice(id); }
}
