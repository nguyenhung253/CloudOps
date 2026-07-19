import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApplicationError } from '../errors/application.error';
import { ErrorCode } from '../errors/error-code.enum';
import * as crypto from 'crypto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalizeException(exception);
    const requestId = (request as any)['id'] || request.headers['x-request-id'] || crypto.randomUUID();

    response.status(normalized.statusCode).json({
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ? { details: normalized.details } : {}),
      },
      meta: {
        path: request.url,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }

  private normalizeException(exception: unknown) {
    if (exception instanceof ApplicationError) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const resBody = exception.getResponse();
      let code = ErrorCode.INTERNAL_ERROR;
      let message = exception.message;
      let details: any[] | undefined = undefined;

      if (typeof resBody === 'object' && resBody !== null) {
        const body = resBody as any;
        if (body.message) {
          message = Array.isArray(body.message) ? body.message[0] : body.message;
        }
        if (body.error) {
          code = body.error.toUpperCase().replace(/\s+/g, '_') as ErrorCode;
        }
        if (Array.isArray(body.message)) {
          code = ErrorCode.VALIDATION_ERROR;
          message = 'Request validation failed';
          details = body.message.map((msg: string) => {
            const field = msg.split(' ')[0] || 'field';
            return {
              field,
              message: msg,
            };
          });
        }
      }

      // Map specific HTTP statuses to standard error codes
      if (statusCode === HttpStatus.UNAUTHORIZED) {
        code = ErrorCode.UNAUTHORIZED;
      } else if (statusCode === HttpStatus.FORBIDDEN) {
        code = ErrorCode.FORBIDDEN;
      } else if (statusCode === HttpStatus.NOT_FOUND) {
        code = ErrorCode.RESOURCE_NOT_FOUND;
      } else if (statusCode === HttpStatus.CONFLICT) {
        code = ErrorCode.RESOURCE_CONFLICT;
      } else if (statusCode === HttpStatus.BAD_REQUEST && code !== ErrorCode.VALIDATION_ERROR) {
        code = ErrorCode.VALIDATION_ERROR;
      }

      // Map specific messages to standard error codes
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('invalid email or password') || lowerMessage.includes('invalid credentials')) {
        code = ErrorCode.INVALID_CREDENTIALS;
      } else if (lowerMessage.includes('token reuse detected') || lowerMessage.includes('session revoked due to token reuse')) {
        code = ErrorCode.REFRESH_TOKEN_REUSED;
      } else if (lowerMessage.includes('expired')) {
        code = ErrorCode.TOKEN_EXPIRED;
      }

      return {
        statusCode,
        code,
        message,
        details,
      };
    }

    // Default fallback for unhandled errors
    const error = exception as Error;
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: error?.message || 'Internal server error',
      details: undefined,
    };
  }
}
