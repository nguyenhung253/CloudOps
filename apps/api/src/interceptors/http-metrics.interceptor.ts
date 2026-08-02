import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrometheusService } from '../modules/metrics/prometheus.service';

/**
 * Lightweight HTTP metrics interceptor.
 * Tracks request count and duration per method + normalized path.
 *
 * Registered alongside the existing ResponseInterceptor from @app/common.
 * Skipped for /health and /metrics endpoints.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private requestCounter: ReturnType<PrometheusService['registerCounter']>;
  private durationHistogram: ReturnType<PrometheusService['registerHistogram']>;

  constructor(private readonly prometheus: PrometheusService) {
    this.requestCounter = this.prometheus.registerCounter(
      'http_requests_total',
      'Total number of HTTP requests',
      ['method', 'path', 'status'],
    );
    this.durationHistogram = this.prometheus.registerHistogram(
      'http_request_duration_seconds',
      'HTTP request duration in seconds',
      ['method', 'path'],
      [0.1, 0.5, 1, 2, 5, 10],
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const path = request?.url;

    // Skip non-HTTP or health/metrics endpoints
    if (!path || path.includes('/health') || path.includes('/api/v1/metrics')) {
      return next.handle();
    }

    const method = request.method ?? 'UNKNOWN';
    const normalizedPath = this.normalizePath(path);
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = context.switchToHttp().getResponse()?.statusCode ?? 200;
          this.requestCounter.inc({ method, path: normalizedPath, status: String(status) });
          this.durationHistogram.observe({ method, path: normalizedPath }, (Date.now() - start) / 1000);
        },
        error: () => {
          const status = context.switchToHttp().getResponse()?.statusCode ?? 500;
          this.requestCounter.inc({ method, path: normalizedPath, status: String(status) });
          this.durationHistogram.observe({ method, path: normalizedPath }, (Date.now() - start) / 1000);
        },
      }),
    );
  }

  /**
   * Normalize dynamic path segments (UUIDs, numbers) to avoid metric cardinality explosion.
   * e.g. /api/v1/cloud-accounts/abc-123 → /api/v1/cloud-accounts/:id
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:num');
  }
}
