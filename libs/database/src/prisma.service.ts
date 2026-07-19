import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
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
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
