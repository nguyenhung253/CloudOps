import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateAwsControlPlaneDto } from './dto/update-aws-control-plane.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /api/v1/settings/aws/control-plane
   */
  @Get('aws/control-plane')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getAwsControlPlane() {
    return this.settingsService.getAwsControlPlane();
  }

  /**
   * PUT /api/v1/settings/aws/control-plane
   */
  @Put('aws/control-plane')
  @Roles(UserRole.ADMIN)
  async updateAwsControlPlane(@Body() dto: UpdateAwsControlPlaneDto) {
    return this.settingsService.updateAwsControlPlane(dto);
  }

  /**
   * POST /api/v1/settings/aws/control-plane/test
   */
  @Post('aws/control-plane/test')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async testAwsControlPlane() {
    return this.settingsService.testAwsControlPlane();
  }

  /**
   * DELETE /api/v1/settings/aws/control-plane
   */
  @Delete('aws/control-plane')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteAwsControlPlane() {
    return this.settingsService.deleteAwsControlPlane();
  }
}
