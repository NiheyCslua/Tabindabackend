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
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @UseGuards(JwtAuthGuard)
  @Get('categories')
  getProductCategories() {
    return this.inventoryService.getProductCategories();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  // Same reasoning as createProduct below: a sales employee adding a new
  // product mid-invoice may need to assign a brand-new category. Category
  // deletion stays admin/inventory-manager only.
  @Roles('ADMIN', 'INVENTORY_MANAGER', 'EMPLOYEE')
  @Post('categories')
  createProductCategory(@Body() body) {
    return this.inventoryService.createProductCategory(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'INVENTORY_MANAGER')
  @Delete('categories/:name')
  deleteProductCategory(@Param('name') name: string) {
    // Category names can contain spaces/slashes, so the frontend must
    // encodeURIComponent() them — decode here to get the real name back.
    return this.inventoryService.deleteProductCategory(decodeURIComponent(name));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  // Sales employees can only reach this endpoint via the "Add to
  // Inventory" flow embedded in Invoice Creation — their Inventory page is
  // read-only (no product-creation UI there at all), so granting EMPLOYEE
  // here doesn't give them a general product-management screen.
  @Roles('ADMIN', 'INVENTORY_MANAGER', 'EMPLOYEE')
  @Post('products')
  createProduct(@Body() body) {
    return this.inventoryService.createProduct(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('products')
  getAllProducts() {
    return this.inventoryService.getAllProducts();
  }

  @UseGuards(JwtAuthGuard)
  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.inventoryService.getProductById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'INVENTORY_MANAGER')
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() body) {
    return this.inventoryService.updateProduct(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.inventoryService.deleteProduct(id);
  }

  /**
   * Return a sold serial number — marks it AVAILABLE and syncs product quantity.
   * POST /inventory/products/:id/return-serial
   * Body: { serialNumber: string }
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'INVENTORY_MANAGER')
  @Post('products/:id/return-serial')
  returnSerial(@Param('id') _id: string, @Body() body: { serialNumber: string }) {
    return this.inventoryService.returnSerial(body.serialNumber);
  }
}
