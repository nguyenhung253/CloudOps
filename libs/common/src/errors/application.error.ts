import { ErrorCode } from './error-code.enum';

export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    message: string,
    readonly statusCode: number = 400,
    readonly details?: any[],
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
