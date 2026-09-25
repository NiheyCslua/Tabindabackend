import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('dashboard')
export class DashboardController {
constructor(private dashboardService: DashboardService) {}

@UseGuards(JwtAuthGuard)
@Get('stats')
getStats() {
return this.dashboardService.getStats();
}
}
