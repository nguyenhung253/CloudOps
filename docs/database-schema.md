# Database Schema

## Tổng quan

- **Database**: PostgreSQL 15
- **ORM**: Prisma 7.8 + `@prisma/adapter-pg` (connection pooling qua `pg.Pool`)
- **Tổng số bảng**: 26 models
- **Tổng số enum**: 17 PostgreSQL enum types

## Enum Types

### User & Auth

| Enum | Giá trị | Mô tả |
|---|---|---|
| `UserRole` | ADMIN, OPERATOR, VIEWER | Vai trò người dùng |
| `UserStatus` | ACTIVE, LOCKED, DISABLED | Trạng thái tài khoản |

### Cloud Provider

| Enum | Giá trị | Mô tả |
|---|---|---|
| `CloudProvider` | AWS, GCP, AZURE | Nhà cung cấp cloud |
| `CloudAccountStatus` | PENDING, CONNECTED, ERROR, DISABLED | Trạng thái kết nối tài khoản cloud |

### Job System

| Enum | Giá trị | Mô tả |
|---|---|---|
| `JobType` | RESOURCE_SYNC, METRIC_COLLECTION, LOG_QUERY, HEALTH_CHECK, RULE_EVALUATION, ALERT_NOTIFICATION | Loại job |
| `JobStatus` | PENDING, QUEUED, RUNNING, SUCCEEDED, FAILED, RETRYING, CANCELLED, TIMED_OUT | Trạng thái job |
| `ExecutionStatus` | RUNNING, SUCCEEDED, FAILED, TIMED_OUT, CANCELLED | Trạng thái thực thi |
| `ScheduleJobType` | RESOURCE_SYNC, METRIC_COLLECTION | Loại job định kỳ |

### Alerting

| Enum | Giá trị | Mô tả |
|---|---|---|
| `AlertOperator` | GT, GTE, LT, LTE, EQ, NEQ | Toán tử so sánh cho alert rule |
| `AlertSeverity` | INFO, WARNING, CRITICAL | Mức độ nghiêm trọng của alert |
| `AlertStatus` | OPEN, ACKNOWLEDGED, RESOLVED | Trạng thái alert |

### Incident Management

| Enum | Giá trị | Mô tả |
|---|---|---|
| `IncidentStatus` | OPEN, INVESTIGATING, MITIGATED, RESOLVED, CLOSED | Trạng thái incident |
| `IncidentSeverity` | SEV1, SEV2, SEV3, SEV4 | Mức độ nghiêm trọng (SEV1 = cao nhất) |

### Notifications

| Enum | Giá trị | Mô tả |
|---|---|---|
| `NotificationChannel` | IN_APP, EMAIL, SLACK, WEBHOOK | Kênh gửi thông báo |
| `NotificationStatus` | PENDING, SENDING, SENT, FAILED | Trạng thái gửi thông báo |
| `NotificationSource` | INCIDENT, MONITORING, JOB, CLOUD_ACCOUNT, SYSTEM | Nguồn thông báo |
| `NotificationReadStatus` | UNREAD, READ | Trạng thái đọc |

### Health & Resource

| Enum | Giá trị | Mô tả |
|---|---|---|
| `HealthStatus` | HEALTHY, DEGRADED, UNHEALTHY, UNKNOWN | Trạng thái sức khỏe resource |
| `ResourceSyncStatus` | RUNNING, SUCCEEDED, FAILED, PARTIAL | Trạng thái đồng bộ |
| `LogQueryStatus` | PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED | Trạng thái log query |

---

## Models (Bảng)

### Identity & Auth

#### `users`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `email` | VARCHAR(255) UNIQUE | Email đăng nhập |
| `password_hash` | TEXT | Mật khẩu mã hóa (Argon2) |
| `full_name` | VARCHAR(150) | Họ tên đầy đủ |
| `role` | UserRole | Vai trò (ADMIN/OPERATOR/VIEWER) |
| `status` | UserStatus | Trạng thái tài khoản |
| `last_login_at` | TIMESTAMPTZ | Lần đăng nhập cuối |
| `created_at` | TIMESTAMPTZ | Ngày tạo |
| `updated_at` | TIMESTAMPTZ | Ngày cập nhật |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Index**: `(status, role)`

#### `sessions`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `user_id` | UUID FK → users | Người dùng |
| `token_hash` | TEXT | Hash của refresh token |
| `token_family` | UUID | Token family (rotation tracking) |
| `user_agent` | TEXT | User agent trình duyệt |
| `ip_address` | INET | Địa chỉ IP |
| `expires_at` | TIMESTAMPTZ | Thời gian hết hạn |
| `revoked_at` | TIMESTAMPTZ | Thời gian thu hồi |
| `created_at` | TIMESTAMPTZ | Ngày tạo |

---

### Cloud Integration

#### `cloud_accounts`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `name` | VARCHAR(120) | Tên hiển thị |
| `provider` | CloudProvider | Nhà cung cấp (AWS/GCP/AZURE) |
| `provider_account_id` | VARCHAR(32) | Account ID của provider |
| `role_arn` | TEXT | IAM Role ARN |
| `external_id_ciphertext` | TEXT | External ID đã mã hóa |
| `status` | CloudAccountStatus | Trạng thái kết nối |
| `last_checked_at` | TIMESTAMPTZ | Lần kiểm tra kết nối cuối |
| `last_error_code` | VARCHAR(100) | Mã lỗi cuối |
| `last_error_message` | TEXT | Thông báo lỗi cuối |
| `created_by` | UUID FK → users | Người tạo |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Unique**: `(provider, provider_account_id)`

#### `cloud_account_regions`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud |
| `region` | VARCHAR(32) | Mã region (vd: us-east-1) |
| `is_enabled` | BOOLEAN | Region có được bật không |
| `last_synced_at` | TIMESTAMPTZ | Lần đồng bộ cuối |

**Unique**: `(cloud_account_id, region)`

#### `cloud_connection_checks`

Ghi lại lịch sử kiểm tra kết nối đến cloud provider.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud |
| `success` | BOOLEAN | Kết quả kiểm tra |
| `assumed_role_arn` | TEXT | Role ARN đã assume |
| `caller_account_id` | VARCHAR(32) | Account ID thực tế |
| `caller_arn` | TEXT | ARN đầy đủ |
| `error_code` | VARCHAR(100) | Mã lỗi nếu thất bại |
| `error_message` | TEXT | Thông báo lỗi |
| `duration_ms` | INT | Thời gian kiểm tra (ms) |
| `requested_by` | UUID FK → users | Người yêu cầu |

**Index**: `(cloud_account_id, created_at DESC)`

#### `cloud_resources`

Tài nguyên cloud đã phát hiện (EC2 instances, ALB, etc.).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud |
| `provider` | CloudProvider | Nhà cung cấp |
| `region` | VARCHAR(32) | Region |
| `resource_type` | VARCHAR(80) | Loại resource (EC2, ALB, etc.) |
| `provider_resource_id` | VARCHAR(255) | ID từ provider (vd: i-xxxxx) |
| `name` | VARCHAR(255) | Tên resource |
| `status` | VARCHAR(80) | Trạng thái (running, stopped) |
| `tags` | JSON | Tags (key-value) |
| `metadata` | JSON | Metadata bổ sung |
| `is_active` | BOOLEAN | Resource còn active không |
| `first_discovered_at` | TIMESTAMPTZ | Lần đầu phát hiện |
| `last_seen_at` | TIMESTAMPTZ | Lần cuối thấy |

**Unique**: `(provider, cloud_account_id, region, resource_type, provider_resource_id)`
**Index**: `(cloud_account_id, region, resource_type)`, `(resource_type, status, is_active)`, `(name)`

#### `resource_tags`

Tags của cloud resource (tách riêng để query nhanh).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `resource_id` | UUID FK → cloud_resources | Resource |
| `key` | VARCHAR(128) | Tag key |
| `value` | VARCHAR(256) | Tag value |

**Unique**: `(resource_id, key)`, **Index**: `(key, value)`

#### `resource_sync_snapshots`

Ghi nhận mỗi lần đồng bộ tài nguyên.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud |
| `provider` | CloudProvider | Provider |
| `status` | ResourceSyncStatus | Trạng thái đồng bộ |
| `resource_types` | TEXT[] | Các loại resource đã sync |
| `regions` | TEXT[] | Các region đã sync |
| `started_at` | TIMESTAMPTZ | Thời gian bắt đầu |
| `finished_at` | TIMESTAMPTZ | Thời gian hoàn thành |
| `duration_ms` | INT | Thời gian thực hiện |
| `discovered_count` | INT | Số resource phát hiện mới |
| `created_count` | INT | Số resource tạo mới |
| `updated_count` | INT | Số resource cập nhật |
| `inactivated_count` | INT | Số resource đánh dấu inactive |
| `error_code` | VARCHAR(100) | Mã lỗi |
| `error_message` | TEXT | Thông báo lỗi |
| `summary` | JSON | Tổng kết chi tiết |
| `requested_by` | UUID FK → users | Người yêu cầu |

**Index**: `(cloud_account_id, started_at DESC)`

---

### Job System

#### `jobs`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `type` | JobType | Loại job |
| `status` | JobStatus | Trạng thái |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud liên quan |
| `resource_id` | UUID FK → cloud_resources | Resource liên quan |
| `requested_by` | UUID FK → users | Người tạo |
| `payload` | JSON | Dữ liệu job |
| `result_summary` | JSON | Kết quả tổng kết |
| `idempotency_key` | VARCHAR(255) UNIQUE | Khóa chống trùng lặp |
| `priority` | SMALLINT | Độ ưu tiên (0 = default) |
| `progress` | SMALLINT | Tiến độ (0-100) |
| `attempts_made` | SMALLINT | Số lần đã thử |
| `max_attempts` | SMALLINT | Số lần thử tối đa (mặc định 3) |
| `queued_at` | TIMESTAMPTZ | Thời gian vào queue |
| `started_at` | TIMESTAMPTZ | Thời gian bắt đầu |
| `completed_at` | TIMESTAMPTZ | Thời gian hoàn thành |
| `cancelled_at` | TIMESTAMPTZ | Thời gian hủy |

**Index**: `(status, created_at DESC)`, `(type, status)`, `(cloud_account_id, created_at DESC)`, `(requested_by, created_at DESC)`

#### `job_executions`

Mỗi lần thực thi của một job (1 job có nhiều execution nếu retry).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `job_id` | UUID FK → jobs | Job |
| `attempt_number` | SMALLINT | Số lần thử |
| `worker_name` | VARCHAR(120) | Tên worker xử lý |
| `status` | ExecutionStatus | Trạng thái thực thi |
| `started_at` | TIMESTAMPTZ | Bắt đầu |
| `finished_at` | TIMESTAMPTZ | Hoàn thành |
| `duration_ms` | BIGINT | Thời gian (ms) |
| `error_code` | VARCHAR(100) | Mã lỗi |
| `error_type` | VARCHAR(100) | Loại lỗi |
| `error_message` | TEXT | Thông báo lỗi |
| `error_details` | JSON | Chi tiết lỗi |
| `output` | JSON | Kết quả output |

**Unique**: `(job_id, attempt_number)`

#### `job_events`

Events trong quá trình thực thi job.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `job_id` | UUID FK → jobs | Job |
| `event_type` | VARCHAR(80) | Loại event |
| `message` | TEXT | Nội dung |
| `progress` | SMALLINT | Tiến độ tại thời điểm event |
| `payload` | JSON | Dữ liệu bổ sung |

**Index**: `(job_id, created_at DESC)`

#### `worker_heartbeats`

Worker định kỳ gửi heartbeat để theo dõi trạng thái.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `worker_id` | VARCHAR(120) PK | ID worker |
| `queue_name` | VARCHAR(120) | Tên queue đang xử lý |
| `hostname` | VARCHAR(255) | Hostname |
| `process_id` | INT | Process ID |
| `status` | VARCHAR(32) | Trạng thái |
| `active_jobs` | INT | Số job đang xử lý |
| `last_heartbeat_at` | TIMESTAMPTZ | Heartbeat cuối |
| `started_at` | TIMESTAMPTZ | Thời gian khởi động |

#### `job_schedules`

Lịch chạy job định kỳ.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `job_type` | ScheduleJobType | Loại job (RESOURCE_SYNC / METRIC_COLLECTION) |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud |
| `interval_ms` | INT | Khoảng thời gian (ms) |
| `enabled` | BOOLEAN | Bật/tắt |
| `scheduler_key` | VARCHAR(255) UNIQUE | Key trong BullMQ scheduler |
| `last_run_at` | TIMESTAMPTZ | Lần chạy cuối |
| `next_run_at` | TIMESTAMPTZ | Lần chạy tiếp theo |
| `created_by` | UUID FK → users | Người tạo |

**Unique**: `(cloud_account_id, job_type)`

---

### Monitoring & Metrics

#### `metric_definitions`

Định nghĩa metric có thể thu thập (vd: AWS/EC2 CPUUtilization).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `provider` | CloudProvider | Cloud provider |
| `resource_type` | VARCHAR(80) | Loại resource |
| `namespace` | VARCHAR(120) | CloudWatch namespace |
| `metric_name` | VARCHAR(120) | Tên metric |
| `default_statistic` | VARCHAR(40) | Statistic mặc định (Average, Sum, etc.) |
| `default_period_seconds` | INT | Chu kỳ mặc định (giây) |
| `unit` | VARCHAR(40) | Đơn vị (Percent, Bytes, etc.) |
| `is_enabled` | BOOLEAN | Bật/tắt thu thập |

**Unique**: `(provider, resource_type, namespace, metric_name)`

#### `metric_points`

Điểm dữ liệu metric (timeseries data).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | BIGINT AUTO_INCREMENT | Khóa chính (dùng BigInt cho volume lớn) |
| `resource_id` | UUID FK → cloud_resources | Resource |
| `metric_definition_id` | UUID FK → metric_definitions | Định nghĩa metric |
| `timestamp` | TIMESTAMPTZ | Thời điểm thu thập |
| `value` | DOUBLE PRECISION | Giá trị |
| `unit` | VARCHAR(40) | Đơn vị |
| `dimensions_hash` | VARCHAR(64) | Hash của dimensions |
| `dimensions` | JSON | Dimensions (vd: InstanceId) |

**Unique**: `(resource_id, metric_definition_id, timestamp, dimensions_hash)`

#### `metric_aggregates`

Dữ liệu metric đã tổng hợp (bucket).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | BIGINT AUTO_INCREMENT | Khóa chính |
| `resource_id` | UUID FK → cloud_resources | Resource |
| `metric_definition_id` | UUID FK → metric_definitions | Metric |
| `bucket_start` | TIMESTAMPTZ | Thời điểm bắt đầu bucket |
| `bucket_size` | VARCHAR(20) | Kích thước bucket (1h, 1d) |
| `min_value` | DOUBLE PRECISION | Giá trị nhỏ nhất |
| `max_value` | DOUBLE PRECISION | Giá trị lớn nhất |
| `avg_value` | DOUBLE PRECISION | Giá trị trung bình |
| `sum_value` | DOUBLE PRECISION | Tổng giá trị |
| `sample_count` | INT | Số mẫu |

**Unique**: `(resource_id, metric_definition_id, bucket_start, bucket_size)`

#### `resource_health_snapshots`

Snapshot đánh giá sức khỏe resource.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `resource_id` | UUID FK → cloud_resources | Resource |
| `status` | HealthStatus | HEALTHY/DEGRADED/UNHEALTHY/UNKNOWN |
| `reason` | TEXT | Lý do |
| `cpu_utilization` | DOUBLE PRECISION | CPU utilization % |
| `status_check_failed` | DOUBLE PRECISION | Status check failed |
| `metrics_summary` | JSON | Tổng hợp metrics |
| `evaluated_at` | TIMESTAMPTZ | Thời điểm đánh giá |

**Index**: `(resource_id, evaluated_at DESC)`

---

### Logs

#### `log_queries`

Truy vấn log từ CloudWatch.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `job_id` | UUID UNIQUE FK → jobs | Job thực hiện query |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud |
| `region` | VARCHAR(32) | Region |
| `query_string` | TEXT | Query string |
| `log_groups` | JSON | Danh sách log groups |
| `start_time` | TIMESTAMPTZ | Thời gian bắt đầu |
| `end_time` | TIMESTAMPTZ | Thời gian kết thúc |
| `provider_query_id` | VARCHAR(255) | Query ID từ CloudWatch |
| `status` | LogQueryStatus | Trạng thái |
| `result_count` | INT | Số kết quả |
| `scanned_bytes` | BIGINT | Số bytes đã quét |
| `expires_at` | TIMESTAMPTZ | Thời gian hết hạn |

#### `log_query_results`

Kết quả từng dòng của log query.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `log_query_id` | UUID FK → log_queries | Query |
| `sequence_no` | INT | Số thứ tự |
| `data` | JSON | Dữ liệu log |
| `object_storage_key` | TEXT | Key lưu trữ object (nếu offload) |
| `is_masked` | BOOLEAN | Dữ liệu đã được mask chưa |

**Unique**: `(log_query_id, sequence_no)`

---

### Alerting

#### `alert_rules`

Quy tắc cảnh báo dựa trên ngưỡng metric.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `name` | VARCHAR(160) | Tên rule |
| `cloud_account_id` | UUID FK → cloud_accounts | Tài khoản cloud |
| `resource_id` | UUID FK → cloud_resources | Resource cụ thể (NULL = tất cả) |
| `resource_type` | VARCHAR(80) | Loại resource |
| `metric_definition_id` | UUID FK → metric_definitions | Metric |
| `operator` | AlertOperator | Toán tử (GT, LT, etc.) |
| `threshold` | DOUBLE PRECISION | Ngưỡng |
| `duration_seconds` | INT | Thời gian vi phạm để kích hoạt |
| `severity` | AlertSeverity | Mức độ |
| `cooldown_seconds` | INT | Thời gian cooldown giữa các lần alert |
| `recovery_threshold` | DOUBLE PRECISION | Ngưỡng phục hồi |
| `is_enabled` | BOOLEAN | Bật/tắt |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Index**: `(created_by, cloud_account_id)`

#### `alerts`

Cảnh báo đã kích hoạt.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `alert_rule_id` | UUID FK → alert_rules | Rule tạo alert |
| `resource_id` | UUID FK → cloud_resources | Resource bị ảnh hưởng |
| `status` | AlertStatus | OPEN → ACKNOWLEDGED → RESOLVED |
| `severity` | AlertSeverity | Mức độ |
| `fingerprint` | VARCHAR(128) | Fingerprint dùng deduplication |
| `title` | VARCHAR(255) | Tiêu đề |
| `message` | TEXT | Nội dung |
| `observed_value` | DOUBLE PRECISION | Giá trị quan sát được |
| `threshold_value` | DOUBLE PRECISION | Ngưỡng đã cấu hình |
| `first_triggered_at` | TIMESTAMPTZ | Lần đầu kích hoạt |
| `last_triggered_at` | TIMESTAMPTZ | Lần cuối kích hoạt |
| `acknowledged_at` | TIMESTAMPTZ | Thời gian acknowledge |
| `acknowledged_by` | UUID FK → users | Người acknowledge |
| `resolved_at` | TIMESTAMPTZ | Thời gian resolve |
| `resolved_by` | UUID FK → users | Người resolve |

**Index**: `(status, severity, last_triggered_at DESC)`, `(resource_id, status)`

#### `alert_events`

Lịch sử thay đổi trạng thái của alert.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `alert_id` | UUID FK → alerts | Alert |
| `event_type` | VARCHAR(80) | Loại event (triggered, acknowledged, resolved) |
| `actor_user_id` | UUID FK → users | Người thực hiện |
| `payload` | JSON | Dữ liệu bổ sung |
| `created_at` | TIMESTAMPTZ | Thời gian |

---

### Incident Management

#### `incidents`

Sự cố được tạo từ alert hoặc thủ công.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `incident_number` | BIGINT AUTO_INCREMENT UNIQUE | Số hiệu incident |
| `title` | VARCHAR(255) | Tiêu đề |
| `description` | TEXT | Mô tả |
| `status` | IncidentStatus | OPEN → INVESTIGATING → MITIGATED → RESOLVED → CLOSED |
| `severity` | IncidentSeverity | SEV1-SEV4 |
| `primary_resource_id` | UUID FK → cloud_resources | Resource chính |
| `assignee_id` | UUID FK → users | Người được gán |
| `created_by` | UUID FK → users | Người tạo |
| `created_by_type` | VARCHAR(20) | Loại actor (USER / AUTO) |
| `dedup_key` | VARCHAR(255) UNIQUE | Deduplication key |
| `rule_code` | VARCHAR(80) | Rule code (nếu tạo tự động) |
| `occurrence_count` | INT | Số lần xuất hiện |
| `last_observed_at` | TIMESTAMPTZ | Lần cuối quan sát |
| `latest_metric_snapshot` | JSON | Snapshot metric mới nhất |
| `root_cause` | TEXT | Nguyên nhân gốc |
| `resolution_note` | TEXT | Ghi chú giải quyết |
| `opened_at` | TIMESTAMPTZ | Thời gian mở |
| `mitigated_at` | TIMESTAMPTZ | Thời gian giảm nhẹ |
| `resolved_at` | TIMESTAMPTZ | Thời gian giải quyết |
| `closed_at` | TIMESTAMPTZ | Thời gian đóng |

**Index**: `(dedup_key, status)`

#### `incident_alerts`

Bảng liên kết nhiều-nhiều giữa incident và alert.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `incident_id` | UUID FK → incidents | Incident |
| `alert_id` | UUID FK → alerts | Alert |
| `linked_by` | UUID FK → users | Người liên kết |
| `linked_at` | TIMESTAMPTZ | Thời gian liên kết |

**Composite PK**: `(incident_id, alert_id)`

#### `incident_timeline`

Dòng thời gian sự kiện của incident.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `incident_id` | UUID FK → incidents | Incident |
| `event_type` | VARCHAR(80) | Loại event |
| `actor_user_id` | UUID FK → users | Người thực hiện |
| `content` | TEXT | Nội dung |
| `metadata` | JSON | Metadata |
| `created_at` | TIMESTAMPTZ | Thời gian |

#### `incident_evidence`

Bằng chứng liên quan đến incident.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `incident_id` | UUID FK → incidents | Incident |
| `evidence_type` | VARCHAR(60) | Loại evidence (job_output, log, metric, external) |
| `job_execution_id` | UUID FK → job_executions | Job execution output |
| `log_query_result_id` | UUID FK → log_query_results | Log query result |
| `resource_id` | UUID FK → cloud_resources | Resource snapshot |
| `external_url` | TEXT | URL bên ngoài |
| `snapshot` | JSON | Dữ liệu snapshot |
| `added_by` | UUID FK → users | Người thêm |

---

### Notifications

#### `notifications`

Thông báo trong hệ thống.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `type` | VARCHAR(80) | Loại thông báo |
| `source` | NotificationSource | Nguồn (INCIDENT, MONITORING, JOB, CLOUD_ACCOUNT, SYSTEM) |
| `severity` | AlertSeverity | Mức độ |
| `title` | VARCHAR(255) | Tiêu đề |
| `message` | TEXT | Nội dung |
| `resource_id` | UUID FK → cloud_resources | Resource liên quan |
| `incident_id` | UUID FK → incidents | Incident liên quan |
| `job_id` | UUID | Job liên quan |
| `read_status` | NotificationReadStatus | UNREAD / READ |
| `read_at` | TIMESTAMPTZ | Thời gian đọc |

**Index**: `(source, created_at DESC)`, `(read_status, created_at DESC)`

#### `notification_preferences`

Cấu hình kênh nhận thông báo của user.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `user_id` | UUID FK → users | Người dùng |
| `source` | NotificationSource | Nguồn thông báo |
| `channel` | NotificationChannel | Kênh (IN_APP, EMAIL, SLACK, WEBHOOK) |
| `enabled` | BOOLEAN | Bật/tắt |

**Unique**: `(user_id, source, channel)`

#### `notification_deliveries`

Lịch sử gửi thông báo qua các kênh.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `notification_id` | UUID FK → notifications | Notification |
| `alert_id` | UUID FK → alerts | Alert (nếu từ alert) |
| `incident_id` | UUID FK → incidents | Incident (nếu từ incident) |
| `channel` | NotificationChannel | Kênh gửi |
| `destination` | TEXT | Địa chỉ gửi (email, webhook URL) |
| `template_code` | VARCHAR(120) | Mã template |
| `status` | NotificationStatus | PENDING → SENDING → SENT / FAILED |
| `deduplication_key` | VARCHAR(255) UNIQUE | Chống gửi trùng |
| `attempt_count` | SMALLINT | Số lần thử |
| `provider_message_id` | VARCHAR(255) | Message ID từ provider |
| `last_error` | TEXT | Lỗi cuối |
| `scheduled_at` | TIMESTAMPTZ | Thời gian lên lịch |
| `sent_at` | TIMESTAMPTZ | Thời gian gửi |

**Index**: `(notification_id)`

---

### System

#### `audit_logs`

Nhật ký hành động của người dùng.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | BIGINT AUTO_INCREMENT | Khóa chính (BigInt cho volume lớn) |
| `actor_user_id` | UUID FK → users | Người dùng |
| `action` | VARCHAR(120) | Hành động |
| `target_type` | VARCHAR(80) | Loại đối tượng |
| `target_id` | VARCHAR(255) | ID đối tượng |
| `request_id` | UUID | Request ID |
| `ip_address` | INET | Địa chỉ IP |
| `user_agent` | TEXT | User agent |
| `metadata` | JSON | Metadata bổ sung |

**Index**: `(actor_user_id)`, `(target_type, target_id)`, `(created_at)`, `(request_id)`

#### `system_settings`

Cấu hình hệ thống dạng key-value.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `key` | VARCHAR(120) PK | Khóa cấu hình |
| `value` | JSON | Giá trị (JSON) |

---

## Sơ đồ quan hệ

```
users ─────────────┬── sessions
                   ├── audit_logs
                   ├── cloud_accounts ────┬── cloud_account_regions
                   │                      ├── cloud_connection_checks
                   │                      ├── cloud_resources ──── resource_tags
                   │                      │                     ├── metric_points
                   │                      │                     ├── metric_aggregates
                   │                      │                     ├── resource_health_snapshots
                   │                      │                     ├── alerts
                   │                      │                     └── incidents
                   │                      ├── resource_sync_snapshots
                   │                      ├── jobs ──── job_executions
                   │                      │        ├── job_events
                   │                      │        └── log_queries ──── log_query_results
                   │                      ├── alert_rules ──── alerts ──── alert_events
                   │                      │                           └── incident_alerts
                   │                      ├── job_schedules
                   │                      └── log_queries
                   ├── incidents ──── incident_alerts
                   │             ├── incident_timeline
                   │             ├── incident_evidence
                   │             └── notifications
                   ├── notifications ──── notification_deliveries
                   └── notification_preferences

worker_heartbeats (độc lập)
system_settings (độc lập)
```

## Ghi chú thiết kế

- **Soft delete**: `users`, `cloud_accounts`, `alert_rules` dùng `deleted_at` thay vì xóa cứng
- **Idempotency**: `jobs.idempotency_key` (UNIQUE) chống tạo job trùng lặp
- **Fingerprint deduplication**: `alerts.fingerprint` chống alert trùng cho cùng một vấn đề
- **Dedup key**: `incidents.dedup_key` (UNIQUE) chống incident trùng
- **Token family**: `sessions.token_family` hỗ trợ refresh token rotation, phát hiện token reuse
- **Connection pooling**: Dùng `@prisma/adapter-pg` với `pg.Pool` thay vì connection pool mặc định của Prisma
- **BigInt ID**: `metric_points`, `metric_aggregates`, `audit_logs` dùng `BIGINT AUTO_INCREMENT` thay vì UUID để tối ưu cho volume dữ liệu lớn
