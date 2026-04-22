/**
 * Tiny in-memory rate limiter.
 *
 * Good enough for a single-instance deployment. In multi-instance prod you'd
 * swap this for a Redis-backed limiter (upstash/rate-limit etc.).
 *
 * Algorithm: fixed window per key.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowSeconds: number },
): RateLimitResult {
  const now = Math.floor(Date.now() / 1000);
  const bucket = buckets.get(key);
  const windowStart =
    bucket && now - bucket.windowStart < options.windowSeconds
      ? bucket.windowStart
      : now;
  const count = bucket && windowStart === bucket.windowStart ? bucket.count + 1 : 1;
  buckets.set(key, { count, windowStart });
  // Occasional sweep so the map doesn't grow forever
  if (buckets.size > 5000 && Math.random() < 0.01) {
    for (const [k, v] of buckets) {
      if (now - v.windowStart > options.windowSeconds * 2) buckets.delete(k);
    }
  }
  return {
    allowed: count <= options.limit,
    remaining: Math.max(0, options.limit - count),
    resetAt: windowStart + options.windowSeconds,
  };
}
