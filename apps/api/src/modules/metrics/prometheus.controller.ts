import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrometheusService } from './prometheus.service';

/**
 * Exposes Prometheus-compatible metrics at GET /api/v1/metrics.
 *
 * The endpoint returns text/plain in Prometheus exposition format
 * and is excluded from ResponseInterceptor wrapping (raw output).
 */
@Controller('metrics')
export class PrometheusController {
  constructor(private readonly prometheusService: PrometheusService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async index(@Res() res: Response) {
    const metrics = await this.prometheusService.getMetrics();
    res.send(metrics);
  }
}
