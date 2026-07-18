import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class QueueService {
  private queue: Queue;

  constructor() {
    const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.queue = new Queue('cloudops-queue', { connection });
  }

  async addJob(name: string, data: any) {
    return this.queue.add(name, data);
  }
}
