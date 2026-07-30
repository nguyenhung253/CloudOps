import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { QueueModule } from '@app/queue';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
