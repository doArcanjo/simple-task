import { afterEach, describe, expect, it } from 'vitest';
import { createRateLimiter } from '../server/rate-limit.js';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';

describe('createRateLimiter (unit, fake clock)', () => {
  it('allows requests up to the limit within a window', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => clock });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check('ip').allowed).toBe(true);
    }
  });

  it('blocks the request beyond the limit, with a positive retry-after', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => clock });
    for (let i = 0; i < 3; i += 1) {
      limiter.check('ip');
    }
    const result = limiter.check('ip');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets once the window has fully passed', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => clock });
    limiter.check('ip');
    limiter.check('ip');
    expect(limiter.check('ip').allowed).toBe(false);
    clock += 1001;
    expect(limiter.check('ip').allowed).toBe(true);
  });

  it('bypasses the limit entirely when disabled', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, enabled: false });
    for (let i = 0; i < 20; i += 1) {
      expect(limiter.check('ip').allowed).toBe(true);
    }
  });

  it('tracks each key independently', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
    expect(limiter.check('ip-a').allowed).toBe(true);
    expect(limiter.check('ip-a').allowed).toBe(false);
    expect(limiter.check('ip-b').allowed).toBe(true);
  });

  it('keeps working after many keys expire (pruning does not break state)', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
    for (let i = 0; i < 50; i += 1) {
      limiter.check(`ip-${i}`);
    }
    clock += 5000;
    expect(limiter.check('ip-fresh').allowed).toBe(true);
  });
});

describe('rate limiting over HTTP', () => {
  let db;
  let server;

  afterEach(() => {
    server?.close();
    db?.close();
  });

  async function startApp(clockRef) {
    db = createDb({ file: ':memory:' });
    const config = {
      jwtSecret: 'test-secret',
      tokenTtlSeconds: 86_400,
      trustProxy: false,
      frontendDir: '/no-such-static-dir-in-tests',
      version: '1.0.0-test',
      authRateLimit: { enabled: true, limit: 3, windowMs: 1000, now: () => clockRef.value },
    };
    const app = createApp({ config, db });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }

  async function attempt(baseUrl, n) {
    return fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `x${n}@example.com`, password: 'whatever123' }),
    });
  }

  it('returns 429 with Retry-After once the window is exhausted', async () => {
    const clockRef = { value: 0 };
    const baseUrl = await startApp(clockRef);
    for (let i = 0; i < 3; i += 1) {
      const res = await attempt(baseUrl, i);
      expect(res.status).toBe(401); // wrong creds, but under the limit
    }
    const blocked = await attempt(baseUrl, 99);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    const body = await blocked.json();
    expect(body.error.code).toBe('rate_limited');
  });

  it('allows requests again once the window passes', async () => {
    const clockRef = { value: 0 };
    const baseUrl = await startApp(clockRef);
    for (let i = 0; i < 3; i += 1) {
      await attempt(baseUrl, i);
    }
    expect((await attempt(baseUrl, 99)).status).toBe(429);
    clockRef.value += 1001;
    expect((await attempt(baseUrl, 100)).status).toBe(401);
  });
});
