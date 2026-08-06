# API Endpoints

## Tổng quan

- **Base URL**: `http://localhost:3000/api/v1`
- **Global prefix**: `/api/v1` (trừ `/health`, `/api/docs`, `/api/docs-json`)
- **Content-Type**: `application/json`
- **Authentication**: JWT Bearer token (`Authorization: Bearer <access_token>`)
- **Swagger UI**: `http://localhost:3000/api/docs`
- **Rate Limiting**: Áp dụng trên một số endpoint auth (register: 10/hr, login: 5/min, forgot-password: 3/15min)

## Authentication

Hầu hết các endpoint yêu cầu JWT token. Một số endpoint auth và health check không yêu cầu.

### Vai trò người dùng (Roles)

| Role | Quyền |
|---|---|
| `ADMIN` | Toàn quyền: CRUD users, settings, schedules, delete resources |
| `OPERATOR` | Quản lý vận hành: cloud accounts, jobs, alerts, incidents |
| `VIEWER` | Chỉ xem: dashboard, resources, metrics, alerts |

---

## Endpoints

### Health

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/health` | Không | Health check |
| `GET` | `/ready` | Không | Readiness check (kiểm tra DB + Redis) |
| `GET` | `/version` | Không | App version |

### Auth

| Method | Path | Auth | Rate Limit | Mô tả |
|---|---|---|---|---|
| `POST` | `/auth/register` | Không | 10/hr | Đăng ký tài khoản mới |
| `POST` | `/auth/login` | Không | 5/min | Đăng nhập, trả về access_token + refresh_token cookie |
| `POST` | `/auth/refresh` | Cookie | — | Refresh access token bằng refresh_token cookie |
| `POST` | `/auth/logout` | Cookie | — | Đăng xuất, xóa cookie |
| `POST` | `/auth/logout-all` | JWT | — | Đăng xuất tất cả phiên |
| `POST` | `/auth/forgot-password` | Không | 3/15min | Gửi email reset password |
| `POST` | `/auth/reset-password` | Không | — | Đặt lại password với token từ email |

**Login Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Login Response:**
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "ADMIN"
    }
  }
}
```

### Users

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/users/me` | Mọi authenticated | Lấy thông tin người dùng hiện tại |
| `GET` | `/users` | ADMIN | Danh sách users (page, limit, role, status, search) |
| `GET` | `/users/:id` | ADMIN | Chi tiết user |
| `PATCH` | `/users/:id/status` | ADMIN | Cập nhật trạng thái user (ACTIVE/LOCKED/DISABLED) |
| `PATCH` | `/users/:id/role` | ADMIN | Cập nhật role user (ADMIN/OPERATOR/VIEWER) |

### Cloud Accounts

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `POST` | `/cloud-accounts` | ADMIN, OPERATOR | Kết nối tài khoản cloud mới |
| `GET` | `/cloud-accounts` | ADMIN, OPERATOR, VIEWER | Danh sách tài khoản cloud |
| `GET` | `/cloud-accounts/backend-info` | ADMIN, OPERATOR, VIEWER | Thông tin backend cloud provider |
| `GET` | `/cloud-accounts/:id` | ADMIN, OPERATOR, VIEWER | Chi tiết tài khoản |
| `GET` | `/cloud-accounts/:id/resource-summary` | ADMIN, OPERATOR, VIEWER | Tổng quan tài nguyên của tài khoản |
| `PATCH` | `/cloud-accounts/:id` | ADMIN, OPERATOR | Cập nhật thông tin tài khoản |
| `DELETE` | `/cloud-accounts/:id` | ADMIN, OPERATOR | Xóa tài khoản |
| `POST` | `/cloud-accounts/:id/test-connection` | ADMIN, OPERATOR | Kiểm tra kết nối đến cloud provider |
| `GET` | `/cloud-accounts/:id/connection-history` | ADMIN, OPERATOR, VIEWER | Lịch sử kiểm tra kết nối |

### Resource Sync

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `POST` | `/cloud-accounts/:id/resources/sync` | ADMIN, OPERATOR | Đồng bộ tài nguyên từ cloud |

### Resources

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/resources` | ADMIN, OPERATOR, VIEWER | Danh sách tài nguyên đã phát hiện |
| `GET` | `/resources/summary` | ADMIN, OPERATOR, VIEWER | Tổng quan tài nguyên |
| `GET` | `/resources/:id` | ADMIN, OPERATOR, VIEWER | Chi tiết tài nguyên |
| `POST` | `/resources/:id/metrics/collect` | ADMIN, OPERATOR | Thu thập metrics cho tài nguyên |
| `GET` | `/resources/:id/health` | ADMIN, OPERATOR, VIEWER | Trạng thái health của tài nguyên |

### Metrics

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/resources/:id/metrics` | ADMIN, OPERATOR, VIEWER | Metrics timeseries của tài nguyên (CPU, Memory, Disk, Network) |
| `GET` | `/metrics` | Không | Prometheus exposition format (`text/plain`) |

### Dashboard

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/dashboard/summary` | ADMIN, OPERATOR, VIEWER | Tổng quan dashboard |
| `GET` | `/dashboard/resource-health` | ADMIN, OPERATOR, VIEWER | Health tổng quan các tài nguyên |
| `GET` | `/dashboard/job-statistics` | ADMIN, OPERATOR, VIEWER | Thống kê jobs |
| `GET` | `/dashboard/telemetry` | ADMIN, OPERATOR, VIEWER | Telemetry data |

### Jobs

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `POST` | `/jobs` | ADMIN, OPERATOR | Tạo job mới |
| `GET` | `/jobs` | ADMIN, OPERATOR, VIEWER | Danh sách jobs |
| `GET` | `/jobs/:id` | ADMIN, OPERATOR, VIEWER | Chi tiết job |
| `GET` | `/jobs/:id/executions` | ADMIN, OPERATOR, VIEWER | Lịch sử thực thi |
| `GET` | `/jobs/:id/events` | ADMIN, OPERATOR, VIEWER | Events của job |
| `POST` | `/jobs/:id/cancel` | ADMIN, OPERATOR | Hủy job |
| `POST` | `/jobs/:id/requeue` | ADMIN, OPERATOR | Đưa lại vào queue |
| `POST` | `/jobs/:id/retry` | ADMIN, OPERATOR | Thử lại job thất bại |

### Queues

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/queues` | ADMIN, OPERATOR, VIEWER | Danh sách queues |
| `GET` | `/queues/summary` | ADMIN, OPERATOR, VIEWER | Tổng quan queues (active, waiting, failed count) |

### Schedules

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/schedules` | ADMIN, OPERATOR, VIEWER | Danh sách lịch định kỳ |
| `POST` | `/schedules` | ADMIN, OPERATOR | Tạo lịch mới |
| `PATCH` | `/schedules/:id` | ADMIN, OPERATOR | Cập nhật lịch |
| `DELETE` | `/schedules/:id` | ADMIN | Xóa lịch |
| `POST` | `/schedules/:id/run` | ADMIN, OPERATOR | Chạy thủ công lịch |

### Alert Rules

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `POST` | `/alert-rules` | ADMIN, OPERATOR | Tạo alert rule |
| `GET` | `/alert-rules` | ADMIN, OPERATOR, VIEWER | Danh sách alert rules (filter: cloudAccountId, resourceId, resourceType, severity, search) |
| `GET` | `/alert-rules/:id` | ADMIN, OPERATOR, VIEWER | Chi tiết rule |
| `PATCH` | `/alert-rules/:id` | ADMIN, OPERATOR | Cập nhật rule |
| `POST` | `/alert-rules/:id/enable` | ADMIN, OPERATOR | Bật rule |
| `POST` | `/alert-rules/:id/disable` | ADMIN, OPERATOR | Tắt rule |
| `DELETE` | `/alert-rules/:id` | ADMIN | Xóa rule |

### Alerts

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/alerts` | ADMIN, OPERATOR, VIEWER | Danh sách alerts (filter: alertRuleId, resourceId, status, severity, search) |
| `GET` | `/alerts/:id` | ADMIN, OPERATOR, VIEWER | Chi tiết alert |
| `POST` | `/alerts/:id/acknowledge` | ADMIN, OPERATOR | Xác nhận alert |
| `POST` | `/alerts/:id/resolve` | ADMIN, OPERATOR | Giải quyết alert |
| `POST` | `/alerts/:id/incidents` | ADMIN, OPERATOR | Tạo incident từ alert |

### Incidents

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `POST` | `/incidents` | ADMIN, OPERATOR | Tạo incident |
| `GET` | `/incidents` | ADMIN, OPERATOR, VIEWER | Danh sách incidents (filter: primaryResourceId, assigneeId, status, severity, search) |
| `GET` | `/incidents/:id` | ADMIN, OPERATOR, VIEWER | Chi tiết incident |
| `PATCH` | `/incidents/:id/status` | ADMIN, OPERATOR | Cập nhật trạng thái incident |
| `POST` | `/incidents/:id/timeline` | ADMIN, OPERATOR | Thêm timeline entry |
| `POST` | `/incidents/:id/evidence` | ADMIN, OPERATOR | Thêm evidence |
| `POST` | `/incidents/:id/root-cause` | ADMIN, OPERATOR | Ghi nhận root cause |
| `POST` | `/incidents/:id/resolution` | ADMIN, OPERATOR | Ghi nhận resolution |

### Notifications

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/notifications` | Không | Danh sách notifications (filter: source, severity, readStatus) |
| `GET` | `/notifications/unread-count` | Không | Số lượng notification chưa đọc |
| `POST` | `/notifications/:id/read` | Không | Đánh dấu đã đọc |
| `POST` | `/notifications/read-all` | Không | Đánh dấu tất cả đã đọc |
| `GET` | `/notifications/:id/deliveries` | Không | Lịch sử gửi của notification |
| `GET` | `/notifications/preferences` | Không | Cấu hình kênh nhận thông báo |
| `POST` | `/notifications/preferences` | Không | Cập nhật cấu hình thông báo |

### Notification Deliveries

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/notification-deliveries` | Không | Danh sách delivery records |
| `GET` | `/notification-deliveries/stats` | Không | Thống kê gửi thông báo |
| `POST` | `/notification-deliveries/:id/retry` | Không | Thử lại gửi thất bại |

### Workers

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/workers` | ADMIN, OPERATOR, VIEWER | Danh sách worker đang hoạt động |

### Audit Logs

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/audit-logs` | Không | Danh sách audit logs (filter: action, targetType) |

### Settings

| Method | Path | Roles | Mô tả |
|---|---|---|---|
| `GET` | `/settings/aws/control-plane` | ADMIN, OPERATOR, VIEWER | Cấu hình AWS control plane |
| `PUT` | `/settings/aws/control-plane` | ADMIN | Cập nhật cấu hình AWS control plane |
| `POST` | `/settings/aws/control-plane/test` | ADMIN, OPERATOR | Kiểm tra cấu hình |
| `DELETE` | `/settings/aws/control-plane` | ADMIN | Xóa cấu hình |

---

## Chuẩn Response Format

Tất cả response tuân theo format thống nhất:

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  },
  "timestamp": "2026-01-01T00:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Pagination**: Các endpoint danh sách hỗ trợ query params `page` và `limit`.

## Error Response

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "email must be a valid email address"
    }
  ],
  "timestamp": "2026-01-01T00:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```
