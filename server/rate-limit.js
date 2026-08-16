// Fixed-window per-key limiter. Each key gets its own window; stale windows are
// pruned on every check so the map can't grow unbounded across many distinct IPs.
import { AppError } from './errors.js';

export function createRateLimiter({ limit, windowMs, enabled = true, now = Date.now } = {}) {
  const windows = new Map();

  function prune(currentTime) {
    for (const [key, entry] of windows) {
      if (currentTime - entry.windowStart >= windowMs) {
        windows.delete(key);
      }
    }
  }

  function check(key) {
    if (!enabled) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const currentTime = now();
    prune(currentTime);
    let entry = windows.get(key);
    if (!entry) {
      entry = { windowStart: currentTime, count: 0 };
      windows.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.windowStart + windowMs - currentTime) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { check };
}

// Express middleware keyed by client IP.
export function rateLimitMiddleware(limiter) {
  return (req, res, next) => {
    const { allowed, retryAfterSeconds } = limiter.check(req.ip);
    if (!allowed) {
      res.set('Retry-After', String(retryAfterSeconds));
      next(new AppError(429, 'rate_limited', 'Too many requests — try again later'));
      return;
    }
    next();
  };
}
