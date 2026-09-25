import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private usersService: UsersService) {}
  @Get() findAll() { return this.usersService.getAllUsers(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.usersService.getUserById(id); }
  @Post() create(@Body() body) { return this.usersService.createUser(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body) { return this.usersService.updateUser(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.usersService.deleteUser(id); }
}
