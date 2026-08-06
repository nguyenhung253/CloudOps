# Hướng dẫn cài đặt và chạy CloudOps

## Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu |
|---|---|
| Node.js | ≥ 18.x |
| pnpm | ≥ 8.x |
| Docker | ≥ 20.x (có docker-compose) |
| PostgreSQL | 15 (tự động qua Docker) |
| Redis | 7 (tự động qua Docker) |

## Cài đặt từ đầu

### 1. Clone repository

```bash
git clone <repo-url> cloudops
cd cloudops
```

### 2. Cài đặt dependencies

```bash
pnpm install
```

Script `postinstall` sẽ tự động chạy `prisma generate` để tạo Prisma client.

### 3. Cấu hình biến môi trường

```bash
cp .env.example .env
```

Mở file `.env` và điều chỉnh các biến nếu cần:

```env
# Database Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cloudops?schema=public"

# Redis Configuration
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET="your-secret-key"   # ĐỔI GIÁ TRỊ NÀY!
JWT_EXPIRES_IN="1d"

# Server Configuration
PORT=3000

# App URL (dùng cho link reset password trong email)
APP_URL=http://localhost:8000

# SMTP Configuration (dùng chung cho notification email + forgot password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@cloudops.dev
```

> **SMTP với Gmail**: Nếu dùng Gmail, cần tạo [App Password](https://myaccount.google.com/apppasswords) thay vì dùng password thông thường.

### 4. Khởi động PostgreSQL và Redis

```bash
docker-compose up -d
```

Kiểm tra trạng thái:

```bash
docker-compose ps
```

### 5. Khởi tạo database schema

```bash
pnpm db:push
```

Lệnh này đẩy schema từ `prisma/schema.prisma` lên PostgreSQL (không dùng migration).

### 6. Chạy development servers

```bash
pnpm dev
```

Ba server sẽ chạy song song:

| Server | Port | URL |
|---|---|---|
| API (NestJS) | 3000 | http://localhost:3000 |
| Web (UmiJS) | 8000 | http://localhost:8000 |
| Worker | — | Background process |

Swagger UI: http://localhost:3000/api/docs

### 7. Seed dữ liệu demo (tùy chọn)

```bash
pnpm seed:demo
```

Tạo dữ liệu mẫu: 30 ngày metrics, 150 jobs, 40 alerts, 20 incidents, 200 notifications, 500 audit logs.

## Chạy từng thành phần riêng lẻ

```bash
# Chỉ chạy API
pnpm dev:api

# Chỉ chạy frontend
pnpm dev:web

# Chỉ chạy worker
pnpm dev:worker
```

## Build production

```bash
pnpm build
```

Build tất cả packages trong workspace.

### Deploy API với Docker

File Dockerfile tại `apps/api/Dockerfile`:

```bash
docker build -f apps/api/Dockerfile -t cloudops-api .
docker run -p 3000:3000 --env-file .env cloudops-api
```

## Kiểm tra hệ thống

### Health check API

```bash
curl http://localhost:3000/api/v1/health
# → { "status": "ok", "timestamp": "..." }

curl http://localhost:3000/api/v1/ready
# → { "status": "ready", "dependencies": { "database": "connected", "redis": "connected" } }
```

### Đăng ký và đăng nhập

```bash
# Đăng ký tài khoản
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!","name":"Test User"}'

# Đăng nhập
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!"}'

# Response chứa access_token, dùng cho các request sau:
# curl http://localhost:3000/api/v1/users/me \
#   -H "Authorization: Bearer <access_token>"
```

## Các port mặc định

| Dịch vụ | Port | Ghi chú |
|---|---|---|
| API Server | 3000 | REST API + Swagger |
| Frontend Dev | 8000 | UmiJS dev server |
| PostgreSQL | 5432 | Docker container |
| Redis | 6379 | Docker container |

## Xử lý sự cố thường gặp

### `prisma generate` lỗi

```bash
# Chạy lại generate thủ công
pnpm db:generate
```

### PostgreSQL không kết nối được

```bash
# Kiểm tra container đang chạy
docker-compose ps

# Restart nếu cần
docker-compose restart postgres
```

### Port đã được sử dụng

```bash
# Windows - tìm process dùng port
netstat -ano | findstr :3000

# Dừng docker-compose để giải phóng port
docker-compose down
```

### Worker không nhận jobs

Đảm bảo Redis đang chạy:

```bash
docker-compose ps redis
# Hoặc kiểm tra kết nối
redis-cli -h localhost ping
```

## Cấu trúc thư mục liên quan

```
cloudops/
├── .env.example        # Mẫu biến môi trường
├── .env                # Biến môi trường của bạn (đã copy từ .env.example)
├── docker-compose.yml  # PostgreSQL + Redis containers
├── prisma/
│   └── schema.prisma   # Database schema
├── apps/api/Dockerfile # Docker build cho production API
└── scripts/
    └── seed-demo.ts    # Script seed dữ liệu demo
```
