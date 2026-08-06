# CloudOps Platform

CloudOps là nền tảng giám sát và vận hành hạ tầng cloud. Hỗ trợ kết nối tài khoản AWS, khám phá tài nguyên, thu thập metrics, đánh giá cảnh báo, quản lý sự cố và gửi thông báo — tất cả trong một dashboard thống nhất.

## Kiến trúc

Monorepo pnpm workspace với 3 ứng dụng và 5 thư viện dùng chung.

```
cloudops/
├── apps/
│   ├── api/              # NestJS REST API (port 3000) — modular monolith 17 module
│   ├── web/              # UmiJS + Ant Design — frontend dashboard (port 8000)
│   └── worker/           # NestJS + BullMQ — xử lý background jobs
├── libs/
│   ├── database/         # Prisma client wrapper (PrismaService)
│   ├── queue/            # BullMQ queue abstraction layer
│   ├── cloud-provider/   # AWS SDK adapters (EC2, CloudWatch, ELBv2, STS)
│   ├── observability/    # Structured logging (Pino)
│   └── common/           # Shared utilities (email, error handling, filters, interceptors)
├── packages/
│   └── shared-contracts/ # Shared TypeScript interfaces
├── prisma/               # Database schema + migrations
├── grafana/              # Pre-built Grafana dashboard JSON
└── scripts/              # Demo seed script
```

**Tech Stack:** TypeScript 5.7 | NestJS 11 | UmiJS 4 + React 18 + Ant Design 5 | Prisma 7.8 + PostgreSQL 15 | BullMQ + Redis 7 | AWS SDK v3 | JWT + Argon2 | Pino | Swagger | Prometheus

## Bắt đầu nhanh

### Yêu cầu

- **Node.js** ≥ 18 & **pnpm**
- **Docker** (cho PostgreSQL & Redis)

### Cài đặt

```bash
# 1. Cài dependencies
pnpm install

# 2. Khởi động PostgreSQL và Redis
docker-compose up -d

# 3. Copy file biến môi trường
cp .env.example .env

# 4. Push database schema
pnpm db:push

# 5. Chạy dev servers (API + Web + Worker)
pnpm dev
```

API chạy tại `http://localhost:3000` | Swagger UI tại `http://localhost:3000/api/docs` | Web tại `http://localhost:8000`

### Seed dữ liệu demo

```bash
pnpm seed:demo
```

Tạo dữ liệu mẫu: 30 ngày metrics, 150 jobs, 40 alerts, 20 incidents, 200 notifications, 500 audit logs.

## Scripts chính

| Script | Mô tả |
|---|---|
| `pnpm dev` | Chạy đồng thời API, Web, Worker ở chế độ dev |
| `pnpm dev:api` / `dev:web` / `dev:worker` | Chạy từng app riêng lẻ |
| `pnpm build` | Build tất cả packages |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema lên database |
| `pnpm seed:demo` | Seed dữ liệu demo |
| `pnpm lint` | Lint toàn bộ workspace |
| `pnpm test` | Chạy test toàn bộ workspace |

## Biến môi trường

| Biến | Mặc định | Mục đích |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/cloudops?schema=public` | Kết nối PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Kết nối Redis |
| `JWT_SECRET` | `admin` | Khóa ký JWT |
| `JWT_EXPIRES_IN` | `1d` | Thời hạn token |
| `PORT` | `3000` | Port API server |
| `APP_URL` | `http://localhost:8000` | URL frontend cho email reset password |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | Gmail SMTP | Cấu hình gửi email |

## Tài liệu chi tiết

- [Kiến trúc hệ thống](./docs/architecture/overview.md)
- [API Endpoints](./docs/api/overview.md)
- [Database Schema](./docs/database-schema.md)
- [Hướng dẫn cài đặt](./docs/getting-started.md)
- [Sơ đồ kiến trúc](./docs/diagrams/architecture.mermaid.md)
