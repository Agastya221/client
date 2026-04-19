/**
 * Simple in-memory rate limiter for API routes.
 * Tracks requests per IP over a sliding window.
 */

const windowMs = 60_000; // 1 minute window
const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.resetAt < now) store.delete(key);
  }
}, 300_000);

export function rateLimit(
  ip: string,
  maxRequests: number = 30
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || entry.resetAt < now) {
    // First request in this window
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  const allowed = entry.count <= maxRequests;

  return { allowed, remaining, resetAt: entry.resetAt };
}

export function getRateLimitHeaders(result: ReturnType<typeof rateLimit>): HeadersInit {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
  };
}
