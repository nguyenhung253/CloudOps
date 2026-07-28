import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard/summary
   */
  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getSummary() {
    return this.dashboardService.getSummary();
  }

  /**
   * GET /api/v1/dashboard/resource-health
   */
  @Get('resource-health')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getResourceHealth() {
    return this.dashboardService.getResourceHealthSummary();
  }

  /**
   * GET /api/v1/dashboard/job-statistics
   */
  @Get('job-statistics')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getJobStatistics() {
    return this.dashboardService.getJobStatistics();
  }

  /**
   * GET /api/v1/dashboard/telemetry
   */
  @Get('telemetry')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getTelemetry() {
    return this.dashboardService.getTelemetry();
  }
}
