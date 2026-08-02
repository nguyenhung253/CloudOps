import { Module, Global } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PrometheusController } from './prometheus.controller';
import { PrometheusService } from './prometheus.service';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [MetricsController, PrometheusController],
  providers: [MetricsService, PrometheusService],
  exports: [MetricsService, PrometheusService],
})
export class MetricsModule {}
