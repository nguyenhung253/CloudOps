export class JobError extends Error {
  public readonly isRetryable: boolean;
  public readonly code: string;

  constructor(message: string, isRetryable = false, code = 'JOB_ERROR') {
    super(message);
    this.name = 'JobError';
    this.isRetryable = isRetryable;
    this.code = code;
  }
}

export class RetryableJobError extends JobError {
  constructor(message: string, code = 'RETRYABLE_JOB_ERROR') {
    super(message, true, code);
    this.name = 'RetryableJobError';
  }
}

export class NonRetryableJobError extends JobError {
  constructor(message: string, code = 'NON_RETRYABLE_JOB_ERROR') {
    super(message, false, code);
    this.name = 'NonRetryableJobError';
  }
}

const RETRYABLE_CODES = new Set([
  'ThrottlingException',
  'Throttling',
  'RequestLimitExceeded',
  'TooManyRequestsException',
  'ProvisionedThroughputExceededException',
  'PriorRequestNotComplete',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'TimeoutError',
  'JOB_TIMEOUT',
  'RedisConnectionError',
  'READONLY',
  'CLUSTERDOWN',
  'LOADING',
  'ServiceUnavailableException',
  'ServiceUnavailable',
  'AWS_THROTTLING',
  'NETWORK_TIMEOUT',
  'REDIS_TEMP_ERROR',
  'AWS_SERVICE_UNAVAILABLE',
]);

const NON_RETRYABLE_CODES = new Set([
  'InvalidClientTokenId',
  'UnrecognizedClientException',
  'InvalidIdentityToken',
  'AccessDenied',
  'AccessDeniedException',
  'UnauthorizedException',
  'CloudAccountDisabled',
  'ACCOUNT_DISABLED',
  'IAM_ROLE_INVALID',
  'ACCESS_DENIED',
  'INVALID_PAYLOAD',
  'BadRequestException',
  'ValidationError',
  'NoSuchEntity',
  'NotFoundException',
  'ResourceNotFoundException',
  'RESOURCE_INVALID',
]);

export interface ClassifiedError {
  isRetryable: boolean;
  code: string;
  type: string;
  message: string;
}

export function classifyJobError(error: unknown): ClassifiedError {
  if (error instanceof JobError) {
    return {
      isRetryable: error.isRetryable,
      code: error.code,
      type: error.name,
      message: error.message,
    };
  }

  if (error && typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    const name = String(errObj.name || '');
    const code = String(errObj.code || errObj.name || 'UNKNOWN_ERROR');
    const status = Number(errObj.status || errObj.statusCode || 0);
    const message = errObj.message ? String(errObj.message) : 'Unknown job execution error';

    // 1. Check Non-retryable first
    if (
      NON_RETRYABLE_CODES.has(code) ||
      NON_RETRYABLE_CODES.has(name) ||
      status === 401 ||
      status === 403 ||
      status === 400 ||
      status === 404
    ) {
      return {
        isRetryable: false,
        code,
        type: name || 'NonRetryableError',
        message,
      };
    }

    // Check message string for explicit non-retryable keywords
    const lowerMsg = message.toLowerCase();
    if (
      lowerMsg.includes('iam role') ||
      lowerMsg.includes('access denied') ||
      lowerMsg.includes('account is disabled') ||
      lowerMsg.includes('disabled cloud account') ||
      lowerMsg.includes('payload missing') ||
      lowerMsg.includes('invalid payload')
    ) {
      return {
        isRetryable: false,
        code: code !== 'UNKNOWN_ERROR' ? code : 'NON_RETRYABLE_ERROR',
        type: name || 'NonRetryableError',
        message,
      };
    }

    // 2. Check Retryable
    if (
      RETRYABLE_CODES.has(code) ||
      RETRYABLE_CODES.has(name) ||
      status === 429 ||
      status === 503 ||
      status === 504 ||
      lowerMsg.includes('throttl') ||
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('timeout') ||
      lowerMsg.includes('timed out') ||
      lowerMsg.includes('redis') ||
      lowerMsg.includes('service unavailable')
    ) {
      return {
        isRetryable: true,
        code,
        type: name || 'RetryableError',
        message,
      };
    }
  }

  // Default fallback: unclassified errors are assumed non-retryable.
  // Only explicitly matched retryable conditions (throttling, network, Redis) get retries.
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return {
    isRetryable: false,
    code: 'UNCLASSIFIED_ERROR',
    type: error instanceof Error ? error.name : 'Error',
    message,
  };
}
