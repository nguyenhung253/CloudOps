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
        if (Array.isArray(body.message)) {
          code = ErrorCode.VALIDATION_ERROR;
          const mappedDetails = body.message.map((msg: string) => {
            const field = this.guessValidationField(msg);
            return {
              field,
              message: this.humanizeValidationMessage(msg, field),
            };
          });
          details = mappedDetails;
          // Prefer the first field message over a generic banner
          message = mappedDetails[0]?.message || 'Dữ liệu gửi lên không hợp lệ';
        }
      } else if (typeof resBody === 'string') {
        message = resBody;
      }

      // Prefer explicit business codes from message heuristics before generic HTTP mapping
      const semantic = this.mapAuthAndDomainMessage(message);
      if (semantic) {
        code = semantic.code;
        message = semantic.message;
      } else if (statusCode === HttpStatus.UNAUTHORIZED) {
        code = ErrorCode.UNAUTHORIZED;
        // Never surface raw Nest "Unauthorized" / "Authorization" wording to clients
        if (this.isGenericAuthMessage(message)) {
          message = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn';
        }
      } else if (statusCode === HttpStatus.FORBIDDEN) {
        code = ErrorCode.FORBIDDEN;
        if (this.isGenericAuthMessage(message)) {
          message = 'Bạn không có quyền thực hiện thao tác này';
        }
      } else if (statusCode === HttpStatus.NOT_FOUND) {
        code = ErrorCode.RESOURCE_NOT_FOUND;
      } else if (statusCode === HttpStatus.CONFLICT) {
        code = ErrorCode.RESOURCE_CONFLICT;
      } else if (statusCode === HttpStatus.BAD_REQUEST && code !== ErrorCode.VALIDATION_ERROR) {
        code = ErrorCode.VALIDATION_ERROR;
      }

      return {
        statusCode,
        code,
        message,
        details,
      };
    }

    // Default fallback for unhandled errors.
    // NEVER expose raw error message to clients — log internally instead.
    const error = exception as Error;
    if (error?.message) {
      console.error(
        `[GlobalExceptionFilter] Unhandled error: ${error.message}`,
        error.stack,
      );
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Lỗi máy chủ nội bộ',
      details: undefined,
    };
  }

  private isGenericAuthMessage(message: string): boolean {
    const lower = (message || '').toLowerCase();
    return (
      !message ||
      lower === 'unauthorized' ||
      lower === 'forbidden' ||
      lower.includes('authorization') ||
      lower.includes('www-authenticate') ||
      lower === 'request failed with status code 401' ||
      lower === 'request failed with status code 403'
    );
  }

  private mapAuthAndDomainMessage(
    message: string,
  ): { code: ErrorCode; message: string } | null {
    const lower = (message || '').toLowerCase();

    if (
      lower.includes('invalid email or password') ||
      lower.includes('email or password is incorrect') ||
      lower.includes('invalid credentials') ||
      lower.includes('email hoặc mật khẩu')
    ) {
      return {
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không chính xác',
      };
    }

    if (lower.includes('account is locked') || lower.includes('tài khoản đã bị khóa')) {
      return {
        code: ErrorCode.ACCOUNT_LOCKED,
        message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên',
      };
    }

    if (
      lower.includes('account is disabled') ||
      lower.includes('account is not active') ||
      lower.includes('tài khoản đã bị vô hiệu')
    ) {
      return {
        code: ErrorCode.ACCOUNT_DISABLED,
        message: 'Tài khoản của bạn đã bị vô hiệu hóa',
      };
    }

    if (lower.includes('email already exists') || lower.includes('email đã được')) {
      return {
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
        message: 'Email này đã được đăng ký',
      };
    }

    if (lower.includes('refresh token missing')) {
      return {
        code: ErrorCode.REFRESH_TOKEN_MISSING,
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
      };
    }

    if (
      lower.includes('token reuse detected') ||
      lower.includes('session revoked due to token reuse')
    ) {
      return {
        code: ErrorCode.REFRESH_TOKEN_REUSED,
        message: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại',
      };
    }

    if (
      lower.includes('invalid or expired refresh token') ||
      lower.includes('jwt expired') ||
      (lower.includes('expired') && lower.includes('token'))
    ) {
      return {
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
      };
    }

    return null;
  }

  private guessValidationField(msg: string): string {
    // class-validator default: "<property> must be ..."
    const propertyMatch = msg.match(/^([a-zA-Z0-9_]+)\s/);
    if (propertyMatch) {
      return propertyMatch[1];
    }

    const lower = msg.toLowerCase();
    if (lower.includes('email')) return 'email';
    if (lower.includes('password') || lower.includes('mật khẩu')) return 'password';
    if (lower.includes('fullname') || lower.includes('full name') || lower.includes('họ tên')) {
      return 'fullName';
    }
    return 'field';
  }

  /** Translate common class-validator English defaults into Vietnamese. */
  private humanizeValidationMessage(msg: string, field: string): string {
    // Already Vietnamese custom messages from DTOs
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(msg)) {
      return msg;
    }

    const lower = msg.toLowerCase();
    const fieldLabel =
      field === 'email'
        ? 'Email'
        : field === 'password'
          ? 'Mật khẩu'
          : field === 'fullName'
            ? 'Họ tên'
            : 'Trường này';

    if (lower.includes('must be longer than or equal to') || lower.includes('must be at least')) {
      const lenMatch = msg.match(/(\d+)/);
      const len = lenMatch?.[1] ?? '6';
      return `${fieldLabel} phải có ít nhất ${len} ký tự`;
    }
    if (lower.includes('should not be empty') || lower.includes('must be a string')) {
      return `Vui lòng nhập ${fieldLabel.toLowerCase()}`;
    }
    if (lower.includes('must be an email') || lower.includes('email')) {
      return 'Email không hợp lệ';
    }

    // Strip leading property name from default class-validator wording
    return msg.replace(/^[a-zA-Z0-9_]+\s+/, '').replace(/^./, (c) => c.toUpperCase());
  }
}
