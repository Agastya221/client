/**
 * Server-side in-memory cache for expensive API responses.
 *
 * This acts as a fast layer in front of the Python scraper API.
 * - First request → calls the real API, caches the result
 * - Subsequent requests → served instantly from cache
 * - TTL-based expiration with stale-while-revalidate
 * - Manual invalidation when streams fail
 *
 * In production with Redis:
 *   Replace the Map with a Redis client for cross-process sharing.
 *   The interface stays the same.
 */

type CacheEntry<T> = {
  data: T;
  createdAt: number;
  staleAt: number;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

/** Defaults: 5 min fresh, 30 min stale-while-revalidate, 1 hour hard expire */
const DEFAULT_FRESH_MS = 5 * 60 * 1000;
const DEFAULT_STALE_MS = 30 * 60 * 1000;
const DEFAULT_EXPIRE_MS = 60 * 60 * 1000;

// Cleanup every 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt < now) store.delete(key);
    }
  }, 10 * 60 * 1000);
}

export interface CacheOptions {
  /** Time in ms before data is considered stale (default: 5 min) */
  freshMs?: number;
  /** Time in ms to serve stale data while refreshing (default: 30 min) */
  staleMs?: number;
  /** Hard expiration time in ms (default: 1 hour) */
  expireMs?: number;
}

/**
 * Get-or-fetch with stale-while-revalidate semantics.
 *
 * @param key   Cache key (e.g., "watch-session:animekai~naruto")
 * @param fetcher  Async function that produces the data
 * @param options  TTL configuration
 * @returns The cached or freshly fetched data
 */
export async function cacheFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  const freshMs = options?.freshMs ?? DEFAULT_FRESH_MS;
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
  const expireMs = options?.expireMs ?? DEFAULT_EXPIRE_MS;
  const now = Date.now();

  const existing = store.get(key) as CacheEntry<T> | undefined;

  if (existing) {
    // Hard expired — delete it
    if (existing.expiresAt < now) {
      store.delete(key);
    }
    // Still fresh — return immediately
    else if (existing.staleAt > now) {
      return existing.data;
    }
    // Stale but not expired — return stale data, refresh in background
    else {
      // Fire-and-forget refresh
      fetcher()
        .then((freshData) => {
          store.set(key, {
            data: freshData,
            createdAt: now,
            staleAt: now + freshMs,
            expiresAt: now + expireMs,
          });
        })
        .catch(() => {
          // Keep stale data if refresh fails
        });
      return existing.data;
    }
  }

  // No cache — fetch fresh
  const data = await fetcher();
  store.set(key, {
    data,
    createdAt: now,
    staleAt: now + freshMs,
    expiresAt: now + expireMs,
  });
  return data;
}

/**
 * Invalidate a specific cache key.
 * Use when a stream source fails and we want to re-fetch next time.
 */
export function cacheInvalidate(key: string): void {
  store.delete(key);
}

/**
 * Invalidate all keys matching a prefix.
 * e.g., cacheInvalidatePrefix("watch-session:animekai~naruto")
 */
export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Get cache stats for debugging */
export function cacheStats(): { size: number; keys: string[] } {
  return { size: store.size, keys: Array.from(store.keys()) };
}
