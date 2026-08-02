import helmet from 'helmet';

/**
 * Helmet configuration — HTTP security headers.
 * CSP relaxed slightly to allow Swagger UI CDN assets.
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'cdn.jsdelivr.net'],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * CORS configuration.
 * Allows the frontend origin with credentials (httpOnly cookies).
 */
export const corsConfig = {
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:8000',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] as const,
  credentials: true,
  maxAge: 86400,
};

/**
 * Rate limiting tiers.
 *
 * Global:      60 requests per minute per IP
 * Auth login:   5 requests per minute (brute-force protection)
 * Auth forgot:  3 requests per 15 minutes (enumeration protection)
 * Auth register: 10 requests per hour
 */
export const rateLimitTiers = {
  global: { ttl: 60000, limit: 60 },
  authLogin: { ttl: 60000, limit: 5 },
  authForgotPassword: { ttl: 900000, limit: 3 },
  authRegister: { ttl: 3600000, limit: 10 },
} as const;
