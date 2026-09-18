/**
 * Simple fixed-window rate limit (per isolate). Stops brute-force login /
 * signup spam in a classroom without pulling in Redis.
 */
const { AppError } = require("../errors/AppError");
const { clientIp } = require("../lib/ops-metrics");

function rateLimit({ windowMs = 60_000, max = 20, keyFn } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = (keyFn ? keyFn(req) : null) || `${req.path}:${clientIp(req)}`;
    let bucket = hits.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      hits.set(key, bucket);
    }
    bucket.count += 1;
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (now - v.start >= windowMs) hits.delete(k);
      }
    }
    if (bucket.count > max) {
      const retrySec = Math.max(1, Math.ceil((windowMs - (now - bucket.start)) / 1000));
      res.setHeader("Retry-After", String(retrySec));
      return next(
        new AppError(429, "Too many attempts. Wait a moment and try again.", {
          retryAfterSec: retrySec
        })
      );
    }
    next();
  };
}

module.exports = { rateLimit };
