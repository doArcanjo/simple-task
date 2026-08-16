// Express app factory. No telemetry, no request logger — just security headers,
// JSON parsing, routes, the static build, and one error handler.
import express from 'express';
import { AppError } from './errors.js';
import { createRateLimiter, rateLimitMiddleware } from './rate-limit.js';
import { authGate, createAuthRouter, createApiRouter } from './routes.js';

function securityHeaders(req, res, next) {
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
}

export function createApp({ config, db }) {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: config.version });
  });

  const authLimiter = createRateLimiter(config.authRateLimit);
  app.use('/auth', rateLimitMiddleware(authLimiter), createAuthRouter({ config, db }));

  app.use('/api', authGate({ config, db }), createApiRouter({ db }));

  app.use(express.static(config.frontendDir));

  app.use((req, res, next) => {
    next(new AppError(404, 'route_not_found', 'Not found'));
  });

  // 4-arg signature is how express recognizes error-handling middleware.
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'invalid_json', message: 'Request body must be valid JSON' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Unexpected server error' } });
  });

  return app;
}
