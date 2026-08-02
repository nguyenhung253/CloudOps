import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { QueueModule } from '@app/queue';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, QueueModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
