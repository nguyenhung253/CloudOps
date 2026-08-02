import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationSource, NotificationChannel } from '@prisma/client';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async list(
    @Query('source') source?: NotificationSource,
    @Query('severity') severity?: string,
    @Query('readStatus') readStatus?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.notificationService.list({
      source,
      severity: severity as any,
      readStatus: readStatus as any,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  @Get('unread-count')
  async unreadCount() {
    return this.notificationService.unreadCount();
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string) {
    await this.notificationService.markRead(id);
    return { success: true };
  }

  @Post('read-all')
  async markAllRead() {
    await this.notificationService.markAllRead();
    return { success: true };
  }

  @Get(':id/deliveries')
  async deliveries(@Param('id') id: string) {
    return this.notificationService.getDeliveries(id);
  }

  @Get('preferences')
  async getPreferences() {
    // TODO: replace 'system' with @CurrentUser() after auth integration
    return this.notificationService.getPreferences('system');
  }

  @Post('preferences')
  async setPreference(
    @Body() body: { source: NotificationSource; channel: NotificationChannel; enabled: boolean },
  ) {
    return this.notificationService.setPreference(
      'system', // TODO: replace with @CurrentUser()
      body.source,
      body.channel,
      body.enabled,
    );
  }
}
