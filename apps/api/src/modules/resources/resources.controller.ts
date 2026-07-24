import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ResourcesService } from './resources.service';
import { ListResourcesDto } from './dto/list-resources.dto';
import { ResourceSummaryQueryDto } from './dto/resource-summary-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('resources')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async list(@Query() query: ListResourcesDto) {
    return this.resourcesService.findAll(query);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async summary(@Query() query: ResourceSummaryQueryDto) {
    return this.resourcesService.getSummary(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.findById(id);
  }
}
