import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notification-deliveries')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.notificationsService.listForUser(
      'system', // TODO: replace with @CurrentUser() after Phase 2
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('stats')
  async stats() {
    return this.notificationsService.getStats();
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    return this.notificationsService.retry(id);
  }
}
