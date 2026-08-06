# Kiến trúc hệ thống CloudOps

## Tổng quan

CloudOps là nền tảng giám sát và vận hành hạ tầng cloud, xây dựng theo mô hình **modular monolith** cho backend, kết hợp **background worker** xử lý tác vụ bất đồng bộ. Toàn bộ dự án là một **pnpm monorepo**.

## Mô hình kiến trúc

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Browser                              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     @cloudops/web (UmiJS :8000)                     │
│                        Single Page Application                     │
│                     Ant Design + Ant Design Charts                 │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ REST API (JSON + JWT)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      @cloudops/api (NestJS :3000)                   │
│                                                                     │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐ ┌──────────────────┐  │
│  │  Auth   │ │  Users   │ │ Cloud Accounts │ │   Alert Rules   │  │
│  └─────────┘ └──────────┘ └───────────────┘ └──────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐ ┌──────────────────┐  │
│  │  Alerts │ │Incidents │ │ Notifications │ │    Dashboard     │  │
│  └─────────┘ └──────────┘ └───────────────┘ └──────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐ ┌──────────────────┐  │
│  │   Jobs  │ │  Queues  │ │   Schedules   │ │    Workers       │  │
│  └─────────┘ └──────────┘ └───────────────┘ └──────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐                      │
│  │Resources│ │ Metrics  │ │  Audit Logs   │                      │
│  └─────────┘ └──────────┘ └───────────────┘                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     libs (Shared Modules)                     │  │
│  │  database │ queue │ cloud-provider │ observability │ common  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────┬─────────────────────────────┬───────────────────────────────┘
        │                             │
        ▼                             ▼
┌───────────────┐          ┌──────────────────────────────────────┐
│ PostgreSQL 15 │          │           Redis 7                     │
│   (Prisma)    │          │  ┌────────────┐  ┌────────────────┐  │
│               │          │  │cloudops-jobs│  │cloudops-notify │  │
│               │          │  └──────┬─────┘  └───────┬────────┘  │
└───────────────┘          │         │                  │         │
                           └─────────┼──────────────────┼─────────┘
                                     │ BullMQ           │
                                     ▼                  ▼
                           ┌──────────────────────────────────────┐
                           │      @cloudops/worker (NestJS)       │
                           │                                      │
                           │  ResourceSyncHandler                 │
                           │  HealthCheckHandler                  │
                           │  MetricCollectionHandler             │
                           │  NotificationDispatcher              │
                           │                                      │
                           │  WorkerHeartbeatService              │
                           │  MetricSchedulerService              │
                           │  ResourceHealthEvaluator             │
                           │  AutoIncidentService                 │
                           └──────────────┬───────────────────────┘
                                          │ AWS SDK v3
                                          ▼
                               ┌─────────────────┐
                               │   AWS Cloud     │
                               │ EC2 │ CloudWatch │
                               │ ELBv2 │ STS     │
                               └─────────────────┘
```

## Luồng dữ liệu chính

### 1. Đồng bộ tài nguyên (Resource Sync)

1. Người dùng gọi API `POST /cloud-accounts/:id/resources/sync`
2. API tạo Job trong database và enqueue vào `cloudops-jobs` queue
3. Worker nhận job, gọi `ResourceSyncHandler`
4. Handler dùng AWS SDK (`libs/cloud-provider`) gọi EC2 API để khám phá instances, volumes
5. Kết quả được lưu vào bảng `CloudResource` và `ResourceTag`
6. Job status được cập nhật: PENDING → QUEUED → RUNNING → SUCCEEDED

### 2. Thu thập metrics

1. `JobSchedule` định kỳ kích hoạt job `METRIC_COLLECTION`
2. Worker nhận job, gọi `MetricCollectionHandler`
3. Handler gọi CloudWatch API lấy metrics (CPU, Memory, Disk, Network) cho từng resource
4. Dữ liệu lưu vào `MetricPoint` (timeseries, partition theo resource + metric + timestamp)

### 3. Cảnh báo (Alerting)

1. `HealthCheckHandler` định kỳ đánh giá health của resource
2. `AlertRule` kiểm tra ngưỡng (threshold) trên metrics
3. Khi vượt ngưỡng, tạo `Alert` với fingerprint-based deduplication
4. Alert lifecycle: OPEN → ACKNOWLEDGED → RESOLVED

### 4. Quản lý sự cố (Incident Management)

1. Alert nghiêm trọng có thể được chuyển thành `Incident`
2. Incident có severity (SEV1-SEV4), assignee, timeline, evidence
3. `AutoIncidentService` trong worker tự động tạo incident từ alert patterns
4. Deduplication key ngăn trùng lặp incident cho cùng một vấn đề

### 5. Thông báo (Notifications)

1. Sự kiện hệ thống (alert mới, incident update) tạo `Notification` record
2. Worker `NotificationDispatcher` gửi email qua SMTP (Nodemailer)
3. In-app notifications hiển thị trên frontend dashboard
4. `NotificationPreference` cho phép người dùng cấu hình kênh nhận thông báo

## Cấu trúc thư mục chi tiết

### `apps/api/` — Backend API

```
apps/api/src/
├── main.ts                  # Bootstrap: global pipes, swagger, CORS, helmet
├── app.module.ts            # Root module, imports all feature modules
├── config/                  # Security, env validation config
├── auth/                    # JWT auth, register, login, password reset
├── users/                   # User CRUD, role management
├── cloud-accounts/          # AWS account connection, resource sync
├── resources/               # Discovered resources, health, metrics
├── jobs/                    # Job tracking, cancel, retry
├── queues/                  # Queue monitoring, metrics
├── schedules/               # Recurring job schedules
├── metrics/                 # Metric points, Prometheus endpoint
├── alert-rules/             # Alert rule CRUD
├── alerts/                  # Alert lifecycle management
├── incidents/               # Incident CRUD, timeline, evidence
├── notifications/           # In-app notifications, preferences
├── notification-deliveries/ # Email delivery tracking
├── dashboard/               # Aggregated overview data
├── workers/                 # Worker heartbeat monitoring
├── audit-logs/              # Audit trail
└── settings/                # System settings
```

### `apps/worker/` — Background Worker

```
apps/worker/src/
├── main.ts                  # Bootstrap: no HTTP, only application context
├── worker.module.ts         # Imports queue module, registers handlers
├── handlers/                # BullMQ job handlers
│   ├── resource-sync.handler.ts
│   ├── health-check.handler.ts
│   └── metric-collection.handler.ts
└── services/                # Background services
    ├── worker-heartbeat.service.ts
    ├── metric-scheduler.service.ts
    ├── resource-health-evaluator.ts
    ├── auto-incident.service.ts
    └── notification-dispatcher.ts
```

### `apps/web/` — Frontend Dashboard

```
apps/web/src/
├── pages/                   # 18 page sections
│   ├── Dashboard/           # Tổng quan
│   ├── CloudAccounts/       # Quản lý tài khoản cloud
│   ├── Jobs/                # Quản lý jobs
│   ├── Alerts/              # Cảnh báo
│   ├── Incidents/           # Sự cố
│   └── ...
├── components/              # Shared UI components
├── services/                # API client calls
└── app.tsx                  # Root with auth, layout, dark theme
```

### `libs/` — Thư viện dùng chung

| Thư viện | Chức năng |
|---|---|
| `database` | PrismaService — wrapper PrismaClient với connection pooling (pg) |
| `queue` | QueueService — enqueue job, upsert scheduler, quản lý Redis/BullMQ |
| `cloud-provider` | AWS adapters — STS, EC2, ELBv2, CloudWatch với normalizers |
| `observability` | Pino structured logging |
| `common` | Email service, error handling, exception filter, response interceptor, middleware |

## Authentication & Authorization

- **JWT** — Access token trong `Authorization: Bearer` header
- **Refresh token** — Cookie `refresh_token`, httpOnly
- **Argon2** — Password hashing
- **Roles** — ADMIN, OPERATOR, VIEWER
- **Guards** — `JwtAuthGuard` + `RolesGuard` trên hầu hết các controller

## Database

PostgreSQL 15 với 26 bảng và 17 enum type. ORM: Prisma 7.8 với `@prisma/adapter-pg` cho connection pooling trực tiếp.

Chi tiết: [Database Schema](../database-schema.md)

## Observability

- **Logging**: Pino (structured JSON logs)
- **Metrics**: `prom-client` tạo custom metrics, expose tại `/api/v1/metrics`
- **Grafana**: Pre-built dashboard JSON trong `grafana/cloudops-dashboard.json`
- **Worker heartbeat**: Worker định kỳ ghi heartbeat vào database
