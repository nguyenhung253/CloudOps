import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
}));
