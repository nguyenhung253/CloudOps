import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as crypto from 'crypto';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    if (request?.url?.includes('/api/docs') || request?.url?.includes('/health') || request?.url?.includes('/ready') || request?.url?.includes('/version')) {
      return next.handle();
    }

    return next.handle().pipe(

      map((data: any) => {
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        const requestId = (request as any)['id'] || request.headers['x-request-id'] || crypto.randomUUID();
        const timestamp = new Date().toISOString();

        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data &&
          data.meta &&
          typeof data.meta === 'object' &&
          'page' in data.meta
        ) {
          return {
            success: true,
            data: data.data,
            meta: {
              ...data.meta,
              requestId,
              timestamp,
            },
          };
        }

        return {
          success: true,
          data: data || {},
          meta: {
            requestId,
            timestamp,
          },
        };
      }),
    );
  }
}
