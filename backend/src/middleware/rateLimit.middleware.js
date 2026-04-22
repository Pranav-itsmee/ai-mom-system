const buckets = new Map();

function cleanupExpiredBuckets(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function createRateLimiter({
  keyPrefix = 'rate-limit',
  windowMs,
  max,
  message = 'Too many requests. Please try again later.',
  keyGenerator,
}) {
  if (!windowMs || !max) {
    throw new Error('windowMs and max are required for createRateLimiter');
  }

  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 5000) cleanupExpiredBuckets(now);

    const identity = keyGenerator ? keyGenerator(req) : req.ip;
    const key = `${keyPrefix}:${identity || 'anonymous'}`;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

module.exports = { createRateLimiter };
