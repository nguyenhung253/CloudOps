import { Params } from 'nestjs-pino';

/**
 * Pino logger configuration with correlation fields and sensitive data redaction.
 *
 * Redaction: strips authorization headers, cookies, passwords,
 * tokens, external IDs, and AWS credentials from log output.
 *
 * Correlation fields (requestId, jobId, cloudAccountId, userId, executionId)
 * are injected at runtime via LoggerContextMiddleware and child loggers.
 */
export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    autoLogging: false,
    // Redact sensitive fields from all log output
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.newPassword',
        'req.body.token',
        'req.body.externalId',
        'req.body.external_id',
        'req.body.accessKeyId',
        'req.body.secretAccessKey',
        'req.body.sessionToken',
        'res.headers["set-cookie"]',
        'awsAccessKeyId',
        'awsSecretAccessKey',
        'awsSessionToken',
      ],
      censor: '[REDACTED]',
    },
    // Use pino-pretty in dev, raw JSON in production
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
              // Colorize correlation fields for readability
              messageFormat: '{context} {msg}',
            },
          }
        : undefined,
    // Custom serializers for clean log output
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    // Suppress noisy NestJS internal logs
    hooks: {
      logMethod(inputArgs, method) {
        const [obj] = inputArgs;
        if (obj && typeof obj === 'object' && 'context' in obj) {
          const context = obj.context as string;
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
  forRoutes: ['{*path}'],
};

export default loggerConfig;
