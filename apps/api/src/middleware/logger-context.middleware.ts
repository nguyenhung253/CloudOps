import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { logContext, LogContextFields } from '@app/common';

/**
 * Initializes per-request correlation context for structured logging.
 *
 * Must run AFTER RequestIdMiddleware (which sets `req.id`).
 * Stores { requestId } into AsyncLocalStorage so every downstream
 * log call can include correlation fields via logContext.get().
 */
@Injectable()
export class LoggerContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const ctx: LogContextFields = {
      requestId: (req as any).id as string | undefined,
    };

    logContext.run(ctx, () => {
      next();
    });
  }
}
