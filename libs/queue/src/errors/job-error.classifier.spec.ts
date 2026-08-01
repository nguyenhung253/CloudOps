import {
  classifyJobError,
  NonRetryableJobError,
  RetryableJobError,
} from './job-error.classifier';

describe('JobErrorClassifier', () => {
  describe('Retryable Errors', () => {
    it('should classify AWS throttling as retryable', () => {
      const error = { name: 'ThrottlingException', message: 'Rate exceeded' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify Network timeout as retryable', () => {
      const error = { code: 'ETIMEDOUT', message: 'Connection timed out' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify Redis connection error as retryable', () => {
      const error = { code: 'RedisConnectionError', message: 'Connection lost' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify AWS service unavailable (503) as retryable', () => {
      const error = { statusCode: 503, message: 'Service Unavailable' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify explicit RetryableJobError as retryable', () => {
      const error = new RetryableJobError('Temporary failure');
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(true);
    });
  });

  describe('Non-retryable Errors', () => {
    it('should classify IAM role invalid as non-retryable', () => {
      const error = { code: 'InvalidClientTokenId', message: 'The security token included in the request is invalid' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify Access denied as non-retryable', () => {
      const error = { code: 'AccessDeniedException', message: 'User is not authorized' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify Cloud account disabled as non-retryable', () => {
      const error = { code: 'CloudAccountDisabled', message: 'Cannot check disabled cloud account' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify Invalid payload as non-retryable', () => {
      const error = { name: 'BadRequestException', message: 'Invalid payload' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify Resource request invalid as non-retryable', () => {
      const error = { code: 'NoSuchEntity', message: 'The requested resource does not exist' };
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify explicit NonRetryableJobError as non-retryable', () => {
      const error = new NonRetryableJobError('Permanent failure');
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify unknown/generic errors as non-retryable by default', () => {
      const error = new Error('Something unexpected happened');
      const classified = classifyJobError(error);
      expect(classified.isRetryable).toBe(false);
      expect(classified.code).toBe('UNCLASSIFIED_ERROR');
    });
  });
});
