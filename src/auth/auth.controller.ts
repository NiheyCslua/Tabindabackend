import { Body, Controller, Post, UseGuards, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { RolesGuard } from './roles/roles.guard';
import { Roles } from './roles.decorator';

@Controller('auth')
export class AuthController {
constructor(private authService: AuthService) {}

@Post('register')
register(
@Body()
body: {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'INVENTORY_MANAGER';

  phone?: string;
  position?: string;
  status?: string;
  salary?: number;
},
) {
return this.authService.register(body);
}

@Post('login')
login(
@Body()
body: { email: string; password: string },
) {
return this.authService.login(body);
}


@UseGuards(JwtAuthGuard)
@Get('me')
getProfile(@Req() req) {
return req.user;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Get('admin-only')
adminOnly(@Req() req) {
  return {
    message: 'You are an admin',
    user: req.user,
  };
}
}
