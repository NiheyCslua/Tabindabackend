import { Body, Controller, Delete, Get, Header, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { InvoiceTemplatesService } from './invoice-templates.service';

@Controller('invoice-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceTemplatesController {
  constructor(private readonly templatesService: InvoiceTemplatesService) {}

  // Read access for everyone who can create invoices (admin + employee) —
  // only mutations are restricted to ADMIN, matching the Settings page.
  @Get() @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findAll() {
    return this.templatesService.findAll();
  }

  // Static routes before ':id' so Nest doesn't treat "reset-all" as an id.
  @Post('reset-all') @Roles('ADMIN')
  resetAll() {
    return this.templatesService.resetAll();
  }

  @Get(':id') @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOneOrThrow(id);
  }

  @Post() @Roles('ADMIN')
  create(@Body() body: any) {
    return this.templatesService.create(body);
  }

  @Patch(':id') @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: any) {
    return this.templatesService.update(id, body);
  }

  @Delete(':id') @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  @Post(':id/reset') @Roles('ADMIN')
  resetOne(@Param('id') id: string) {
    return this.templatesService.resetOne(id);
  }
}
