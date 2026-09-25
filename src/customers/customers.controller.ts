import {
Body,
Controller,
Post,
Get,
Param,
Patch,
Delete,
UseGuards,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('customers')
export class CustomersController {
constructor(private customersService: CustomersService) {}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Post()
createCustomer(@Body() body) {
return this.customersService.createCustomer(body);
}

@UseGuards(JwtAuthGuard)
@Get()
getAllCustomers() {
return this.customersService.getAllCustomers();
}

@UseGuards(JwtAuthGuard)
@Get(':id')
getCustomer(@Param('id') id: string) {
return this.customersService.getCustomerById(id);
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Patch(':id')
updateCustomer(@Param('id') id: string, @Body() body) {
return this.customersService.updateCustomer(id, body);
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Delete(':id')
deleteCustomer(@Param('id') id: string) {
return this.customersService.deleteCustomer(id);
}
}
