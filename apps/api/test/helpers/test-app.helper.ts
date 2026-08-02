import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import cookieParser from 'cookie-parser';

/**
 * Creates a full NestJS test application for E2E/integration testing.
 *
 * Sets JWT_SECRET and DATABASE_URL to test-safe values.
 * Use `closeTestApp()` to tear down after tests.
 */
export async function createTestApp(): Promise<INestApplication> {
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
  process.env.NODE_ENV = 'test';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.init();
  return app;
}

/** Cleanup helper: close the app after each test suite. */
export async function closeTestApp(app: INestApplication): Promise<void> {
  await app?.close();
}
