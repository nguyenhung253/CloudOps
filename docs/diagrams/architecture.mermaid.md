# Sơ đồ kiến trúc CloudOps

Các sơ đồ dưới đây mô tả kiến trúc hệ thống CloudOps, có thể hiển thị trực tiếp trên GitHub hoặc bất kỳ trình xem Mermaid nào.

## 1. Tổng quan hệ thống

```mermaid
graph TB
    subgraph Browser["Trình duyệt"]
        UI["CloudOps Dashboard<br/>UmiJS + Ant Design<br/>Port 8000"]
    end

    subgraph API["API Server - NestJS :3000"]
        direction TB
        Auth["Auth Module<br/>JWT + Argon2"]
        Users["Users Module"]
        CloudAcc["Cloud Accounts"]
        Resources["Resources"]
        Jobs["Jobs"]
        Alerts["Alerts"]
        Incidents["Incidents"]
        Notif["Notifications"]
        Dashboard["Dashboard"]
        Settings["Settings + Audit"]
        
        Libs["libs/<br/>database | queue | cloud-provider<br/>observability | common"]
    end

    subgraph Worker["Background Worker - NestJS"]
        direction TB
        RSH["ResourceSyncHandler"]
        HCH["HealthCheckHandler"]
        MCH["MetricCollectionHandler"]
        ND["NotificationDispatcher"]
        WH["WorkerHeartbeatService"]
        AI["AutoIncidentService"]
    end

    subgraph Data["Data Layer"]
        PG[("PostgreSQL 15<br/>Prisma ORM")]
        Redis[("Redis 7<br/>BullMQ Queues")]
    end

    subgraph Cloud["AWS Cloud"]
        EC2["EC2 API"]
        CW["CloudWatch"]
        ELB["ELBv2"]
        STS["STS"]
    end

    UI -->|"REST API (JSON + JWT)"| API
    API -->|"Prisma"| PG
    API -->|"Enqueue Jobs"| Redis
    Redis -->|"Consume Jobs"| Worker
    Worker -->|"Prisma"| PG
    Worker -->|"AWS SDK v3"| Cloud

    style Browser fill:#1a1a2e,stroke:#e26f54,color:#fff
    style API fill:#16213e,stroke:#e26f54,color:#fff
    style Worker fill:#16213e,stroke:#e26f54,color:#fff
    style Data fill:#0f3460,stroke:#e26f54,color:#fff
    style Cloud fill:#533483,stroke:#e26f54,color:#fff
```

## 2. Luồng đồng bộ tài nguyên

```mermaid
sequenceDiagram
    actor User as Người dùng
    participant API as API Server
    participant DB as PostgreSQL
    participant Q as Redis/BullMQ
    participant W as Worker
    participant AWS as AWS EC2

    User->>API: POST /cloud-accounts/:id/resources/sync
    API->>DB: Tạo Job (PENDING)
    API->>Q: Enqueue job vào cloudops-jobs
    API->>DB: Cập nhật Job (QUEUED)
    API-->>User: Response (job_id)
    
    Q->>W: Deliver job
    W->>DB: Cập nhật Job (RUNNING)
    W->>AWS: DescribeInstances()
    AWS-->>W: Danh sách instances
    W->>AWS: DescribeVolumes()
    AWS-->>W: Danh sách volumes
    W->>DB: Upsert CloudResource records
    W->>DB: Upsert ResourceTag records
    W->>DB: Tạo ResourceSyncSnapshot
    W->>DB: Cập nhật Job (SUCCEEDED)
```

## 3. Luồng cảnh báo (Alerting)

```mermaid
sequenceDiagram
    participant S as JobSchedule
    participant Q as Redis/BullMQ
    participant W as Worker
    participant DB as PostgreSQL
    participant CW as AWS CloudWatch

    S->>Q: Kích hoạt METRIC_COLLECTION job định kỳ
    Q->>W: Deliver job
    
    W->>CW: GetMetricStatistics()
    CW-->>W: Metric data points
    W->>DB: Lưu MetricPoint records
    
    W->>DB: Lấy AlertRule cho resource
    W->>DB: So sánh giá trị với threshold
    
    alt Vượt ngưỡng
        W->>DB: Tạo Alert (OPEN)
        W->>DB: Tạo AlertEvent (triggered)
        W->>DB: Tạo Notification
        Note over W,DB: Fingerprint dedup<br/>chống alert trùng
    else Trong ngưỡng
        W->>DB: Cập nhật ResourceHealthSnapshot (HEALTHY)
    end
```

## 4. Luồng quản lý sự cố (Incident)

```mermaid
stateDiagram-v2
    [*] --> Alert_OPEN: Metric vượt ngưỡng
    Alert_OPEN --> Alert_ACKNOWLEDGED: Operator acknowledge
    Alert_ACKNOWLEDGED --> Alert_RESOLVED: Vấn đề được giải quyết
    
    Alert_OPEN --> Incident_OPEN: Tạo incident từ alert
    Alert_ACKNOWLEDGED --> Incident_OPEN: Tạo incident từ alert
    
    Incident_OPEN --> Incident_INVESTIGATING: Bắt đầu điều tra
    Incident_INVESTIGATING --> Incident_MITIGATED: Áp dụng biện pháp giảm nhẹ
    Incident_MITIGATED --> Incident_RESOLVED: Giải quyết hoàn toàn
    Incident_RESOLVED --> Incident_CLOSED: Đóng incident
    
    Incident_INVESTIGATING --> Incident_RESOLVED: Giải quyết trực tiếp
    
    state Incident_OPEN {
        [*] --> AutoCreated: AutoIncidentService
        [*] --> ManualCreated: Người dùng tạo
    }
```

## 5. Cấu trúc Monorepo

```mermaid
graph LR
    subgraph Apps["apps/"]
        API["@cloudops/api<br/>NestJS REST API<br/>17 modules"]
        Web["@cloudops/web<br/>UmiJS Dashboard<br/>18 pages"]
        Worker["@cloudops/worker<br/>BullMQ Processor<br/>3 handlers + 5 services"]
    end

    subgraph Libs["libs/"]
        DB["database<br/>PrismaService<br/>pg Pool"]
        Q["queue<br/>QueueService<br/>BullMQ + Redis"]
        CP["cloud-provider<br/>AWS SDK Adapters<br/>EC2 | CW | ELB | STS"]
        Obs["observability<br/>Pino Logger"]
        Common["common<br/>Email | Error | Filter<br/>Interceptor | Middleware"]
    end

    subgraph PKG["packages/"]
        SC["shared-contracts<br/>TypeScript Interfaces"]
    end

    subgraph Infra["Infrastructure"]
        Prisma["prisma/<br/>Schema + Migrations"]
        Grafana["grafana/<br/>Dashboards"]
        Docker["docker-compose<br/>PG + Redis"]
    end

    API --> DB
    API --> Q
    API --> CP
    API --> Obs
    API --> Common
    Worker --> DB
    Worker --> Q
    Worker --> CP
    Worker --> Obs
    Worker --> Common
    Web --> SC
    API --> SC

    style Apps fill:#1a1a2e,stroke:#e26f54,color:#fff
    style Libs fill:#16213e,stroke:#e26f54,color:#fff
    style PKG fill:#0f3460,stroke:#e26f54,color:#fff
    style Infra fill:#533483,stroke:#e26f54,color:#fff
```

## 6. Module chi tiết của API

```mermaid
graph TB
    subgraph API["NestJS API - 17 Modules"]
        direction TB
        M1["auth<br/>JWT + Register + Login"]
        M2["users<br/>CRUD + Roles"]
        M3["cloud-accounts<br/>AWS Connection"]
        M4["resources<br/>Resource Inventory"]
        M5["metrics<br/>Timeseries + Prometheus"]
        M6["jobs<br/>Job Tracking"]
        M7["queues<br/>Queue Monitoring"]
        M8["schedules<br/>Recurring Jobs"]
        M9["alert-rules<br/>Threshold Rules"]
        M10["alerts<br/>Alert Lifecycle"]
        M11["incidents<br/>Incident Management"]
        M12["notifications<br/>In-app + Delivery"]
        M13["dashboard<br/>Aggregated Views"]
        M14["workers<br/>Worker Heartbeat"]
        M15["audit-logs<br/>Audit Trail"]
        M16["settings<br/>System Config"]
        M17["notification-deliveries<br/>Delivery Tracking"]
    end

    subgraph Shared["Shared NestJS Modules"]
        Global["Global Pipes/Interceptors/Filters"]
        Guards["JwtAuthGuard + RolesGuard"]
        Swagger["Swagger/OpenAPI Docs"]
        Helmet["Helmet + CORS + Throttler"]
        Prometheus["prom-client Metrics"]
    end

    M1 --> Guards
    M2 --> Guards
    M3 --> Guards
    M4 --> Guards
    M9 --> M10
    M10 --> M11
    M11 --> M12

    style API fill:#16213e,stroke:#e26f54,color:#fff
    style Shared fill:#0f3460,stroke:#e26f54,color:#fff
```

## 7. Database - Các Domain chính

```mermaid
erDiagram
    users ||--o{ sessions : has
    users ||--o{ cloud_accounts : creates
    users ||--o{ jobs : requests
    users ||--o{ alert_rules : creates
    users ||--o{ alerts : acknowledges
    users ||--o{ incidents : assigned
    
    cloud_accounts ||--o{ cloud_resources : contains
    cloud_accounts ||--o{ resource_sync_snapshots : tracks
    cloud_accounts ||--o{ jobs : triggers
    cloud_accounts ||--o{ alert_rules : scoped_to
    
    cloud_resources ||--o{ metric_points : measures
    cloud_resources ||--o{ health_snapshots : evaluates
    cloud_resources ||--o{ alerts : triggers
    cloud_resources ||--o{ resource_tags : tagged_by
    
    jobs ||--o{ job_executions : executed_as
    jobs ||--o{ job_events : logs
    
    alert_rules ||--o{ alerts : fires
    alerts ||--o{ alert_events : tracks
    alerts ||--o{ incident_alerts : linked_to
    
    incidents ||--o{ incident_alerts : aggregates
    incidents ||--o{ incident_timeline : chronicles
    incidents ||--o{ incident_evidence : documents
    incidents ||--o{ notifications : generates
    
    notifications ||--o{ notification_deliveries : dispatched_via
```

> **Lưu ý**: Các sơ đồ trên sử dụng Mermaid syntax và có thể hiển thị trực tiếp trên GitHub, GitLab, hoặc bất kỳ Markdown viewer nào hỗ trợ Mermaid.
