import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { QueueModule } from '@app/queue';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [QueuesController],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
