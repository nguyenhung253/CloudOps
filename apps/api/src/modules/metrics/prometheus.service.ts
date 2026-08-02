import { Injectable } from '@nestjs/common';
import * as prometheus from 'prom-client';

@Injectable()
export class PrometheusService {
  private readonly registry: prometheus.Registry;

  constructor() {
    this.registry = new prometheus.Registry();
    prometheus.collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  registerCounter(name: string, help: string, labelNames: string[] = []): prometheus.Counter {
    let c = this.registry.getSingleMetric(name) as prometheus.Counter | undefined;
    if (!c) {
      c = new prometheus.Counter({ name, help, labelNames, registers: [this.registry] });
    }
    return c;
  }

  registerGauge(name: string, help: string, labelNames: string[] = []): prometheus.Gauge {
    let g = this.registry.getSingleMetric(name) as prometheus.Gauge | undefined;
    if (!g) {
      g = new prometheus.Gauge({ name, help, labelNames, registers: [this.registry] });
    }
    return g;
  }

  registerHistogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets: number[] = [0.1, 0.5, 1, 2, 5, 10],
  ): prometheus.Histogram {
    let h = this.registry.getSingleMetric(name) as prometheus.Histogram | undefined;
    if (!h) {
      h = new prometheus.Histogram({
        name, help, labelNames, buckets, registers: [this.registry],
      });
    }
    return h;
  }
}
