import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => {
  const devFallback = 'dev-secret-do-not-use-in-production';
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    jwtSecret: jwtSecret || devFallback,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  };
});
