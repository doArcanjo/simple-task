// Environment configuration, read once at import. Every value has a default that
// keeps `npm install && npm start` working with nothing configured.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// .env support with no dependency (Node ships process.loadEnvFile).
// Never under test: a test run must not depend on the machine it runs on.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile(resolve(root, '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

const env = process.env.NODE_ENV ?? 'development';

function jwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (env === 'production') {
    // A known signing key means anyone can mint a token for any account.
    throw new Error('JWT_SECRET must be set in production — refusing to start with a public default');
  }
  return 'dev-only-insecure-secret';
}

const num = (raw, fallback) => (raw && Number.isFinite(Number(raw)) ? Number(raw) : fallback);

export const config = {
  env,
  version: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version,
  port: num(process.env.PORT, 3200),
  dataFile: process.env.DATA_FILE ?? resolve(root, 'data/app.db'),
  frontendDir: resolve(root, 'dist'),
  jwtSecret: jwtSecret(),
  tokenTtlSeconds: num(process.env.TOKEN_TTL_SECONDS, 86_400),
  // Only meaningful behind a reverse proxy; without it every client would share
  // the proxy's address and one bucket. Express's `trust proxy` setting.
  trustProxy: process.env.TRUST_PROXY === 'true',
  authRateLimit: {
    enabled: process.env.RATE_LIMIT !== 'off',
    limit: num(process.env.RATE_LIMIT_AUTH, 10),
    windowMs: 60_000,
  },
};
