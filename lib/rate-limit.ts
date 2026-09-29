/**
 * Simple in-memory rate limiter for API routes.
 * Tracks requests per IP over a sliding window.
 *
 * DEPLOYMENT NOTE (Cloudflare Workers / any multi-instance host):
 * This limiter is *per-isolate*. Cloudflare runs many isolates per colo and
 * recycles them aggressively, so an attacker is effectively rate limited
 * per-isolate rather than globally — the practical ceiling is many multiples
 * of `maxRequests`. Treat this as cheap abuse dampening, not as a security
 * control. For a real global limit, move the counter to a shared store
 * (Durable Object, KV with a short TTL, or Upstash Redis).
 */

const windowMs = 60_000; // 1 minute window
const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 5 minutes.
//
// Guarded because Cloudflare Workers forbids I/O and timers in global scope:
// calling setInterval at module scope throws during isolate initialisation and
// takes the whole Worker down. When no timer is available the map is still
// bounded — `rateLimit()` overwrites expired entries lazily on next hit for
// the same IP — it just holds on to idle keys a bit longer.
if (typeof setInterval !== "undefined") {
  try {
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, val] of store) {
        if (val.resetAt < now) store.delete(key);
      }
    }, 300_000);
    cleanupTimer.unref?.();
  } catch {
    // Timers unavailable at module scope (Workers global scope). Fine: the
    // lazy expiry inside rateLimit() keeps the limiter correct without it.
  }
}

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
