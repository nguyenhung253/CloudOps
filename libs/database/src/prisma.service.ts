import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  private static createOptions() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cloudops?schema=public';
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    return { adapter };
  }

  constructor() {
    super(PrismaService.createOptions());
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err: any) {
      this.logger.warn(`Database not available on startup: ${err.message}. App will start and retry on first query.`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
