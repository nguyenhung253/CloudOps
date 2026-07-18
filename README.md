# CloudOps Platform

CloudOps is a platform for managing cloud operations.

## Architecture

- `apps/api`: Modular monolith backend built with NestJS.
- `apps/web`: Frontend dashboard built with UmiJS.
- `apps/worker`: Background job processor built with BullMQ.
- `packages/database`: Shared Prisma database client.
- `packages/shared-types`: Shared TypeScript interfaces.
- `packages/config`: Shared configuration.
- `packages/logger`: Shared logging utility.
- `packages/eslint-config`: Shared ESLint configurations.

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start local services (PostgreSQL, Redis):

   ```bash
   docker-compose up -d
   ```

3. Generate Prisma client:

   ```bash
   pnpm db:generate
   ```

4. Run development servers:
   ```bash
   pnpm dev
   ```
