import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false,
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'HH:MM:ss',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
        hooks: {
          logMethod(inputArgs, method) {
            const [obj] = inputArgs;
            if (obj && typeof obj === 'object' && 'context' in obj) {
              const context = obj.context;
              if (
                context === 'InstanceLoader' ||
                context === 'RoutesResolver' ||
                context === 'RouterExplorer' ||
                context === 'NestFactory' ||
                context === 'NestApplication' ||
                context === 'LegacyRouteConverter'
              ) {
                return;
              }
            }
            method.apply(this, inputArgs);
          },
        },
      },
    }),
  ],
  providers: [AppService],
})
export class AppModule {}
