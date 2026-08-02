import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController, NotificationController],
  providers: [NotificationsService, NotificationService],
  exports: [NotificationsService, NotificationService],
})
export class NotificationsModule {}
