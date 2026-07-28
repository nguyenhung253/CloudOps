import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { MetricsService } from './metrics.service';
import { GetMetricsQueryDto } from './dto/get-metrics-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('resources')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * GET /api/v1/resources/:id/metrics
   */
  @Get(':id/metrics')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getResourceMetrics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetMetricsQueryDto,
  ) {
    return this.metricsService.getResourceMetrics(id, query);
  }
}
