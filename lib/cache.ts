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

import { recordCounter } from "@/lib/observability";

type CacheEntry<T> = {
  data: T;
  createdAt: number;
  staleAt: number;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const refreshing = new Set<string>();

/** Defaults: 5 min fresh, 30 min stale-while-revalidate, 1 hour hard expire */
const DEFAULT_FRESH_MS = 5 * 60 * 1000;
const DEFAULT_STALE_MS = 30 * 60 * 1000;
const DEFAULT_EXPIRE_MS = 60 * 60 * 1000;

function cacheNamespace(key: string): string {
  return key.split(":")[0] || "unknown";
}

// Cleanup every 10 minutes
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt < now) store.delete(key);
    }
  }, 10 * 60 * 1000);
  cleanupTimer.unref?.();
}

export interface CacheOptions {
  /** Time in ms before data is considered stale (default: 5 min) */
  freshMs?: number;
  /** Time in ms to serve stale data while refreshing (default: 30 min) */
  staleMs?: number;
  /** Hard expiration time in ms (default: 1 hour) */
  expireMs?: number;
  /** Skip storing broken or partial payloads. */
  shouldCache?: (value: unknown) => boolean;
}

function createEntry<T>(data: T, createdAt: number, freshMs: number, expireMs: number): CacheEntry<T> {
  return {
    data,
    createdAt,
    staleAt: createdAt + freshMs,
    expiresAt: createdAt + expireMs,
  };
}

function canStore(value: unknown, shouldCache?: ((value: unknown) => boolean) | undefined): boolean {
  return shouldCache ? shouldCache(value) : true;
}

async function fetchAndMaybeStore<T>(
  key: string,
  namespace: string,
  fetcher: () => Promise<T>,
  options: {
    freshMs: number;
    expireMs: number;
    shouldCache?: (value: unknown) => boolean;
    source: "miss" | "refresh";
  },
): Promise<T> {
  const existingPromise = inFlight.get(key) as Promise<T> | undefined;
  if (existingPromise) {
    recordCounter("cache.coalesced", 1, { namespace, source: options.source });
    return existingPromise;
  }

  const promise = (async () => {
    const data = await fetcher();
    if (!canStore(data, options.shouldCache)) {
      recordCounter("cache.store_skipped", 1, { namespace, source: options.source });
      return data;
    }

    const storedAt = Date.now();
    store.set(key, createEntry(data, storedAt, options.freshMs, options.expireMs));
    recordCounter("cache.store", 1, { namespace, source: options.source });
    return data;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
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
  const shouldCache = options?.shouldCache;
  const now = Date.now();

  const existing = store.get(key) as CacheEntry<T> | undefined;
  const namespace = cacheNamespace(key);

  if (existing) {
    if (!canStore(existing.data, shouldCache)) {
      store.delete(key);
      recordCounter("cache.invalidate", 1, { namespace, scope: "invalid" });
    }
    // Hard expired — delete it
    else if (existing.expiresAt < now) {
      store.delete(key);
      recordCounter("cache.expired", 1, { namespace });
    }
    // Still fresh — return immediately
    else if (existing.staleAt > now) {
      recordCounter("cache.hit", 1, { namespace, state: "fresh" });
      return existing.data;
    }
    // Stale but not expired — return stale data, refresh in background
    else {
      recordCounter("cache.hit", 1, { namespace, state: "stale" });
      if (!refreshing.has(key) && !inFlight.has(key)) {
        refreshing.add(key);
        fetchAndMaybeStore(key, namespace, fetcher, {
          freshMs,
          expireMs,
          shouldCache,
          source: "refresh",
        })
        .then(() => {
          recordCounter("cache.refresh", 1, { namespace, outcome: "success" });
        })
        .catch(() => {
          // Keep stale data if refresh fails
          recordCounter("cache.refresh", 1, { namespace, outcome: "error" });
        })
        .finally(() => {
          refreshing.delete(key);
        });
      } else {
        recordCounter("cache.refresh", 1, { namespace, outcome: "deduped" });
      }
      return existing.data;
    }
  }

  // No cache — fetch fresh
  recordCounter("cache.miss", 1, { namespace });
  return fetchAndMaybeStore(key, namespace, fetcher, {
    freshMs,
    expireMs,
    shouldCache,
    source: "miss",
  });
}

/**
 * Invalidate a specific cache key.
 * Use when a stream source fails and we want to re-fetch next time.
 */
export function cacheInvalidate(key: string): void {
  store.delete(key);
  recordCounter("cache.invalidate", 1, { namespace: cacheNamespace(key), scope: "single" });
}

/**
 * Invalidate all keys matching a prefix.
 * e.g., cacheInvalidatePrefix("watch-session:animekai~naruto")
 */
export function cacheInvalidatePrefix(prefix: string): void {
  let deleted = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      deleted += 1;
    }
  }
  recordCounter("cache.invalidate", 1, {
    namespace: cacheNamespace(prefix),
    scope: "prefix",
    deleted,
  });
}

/** Get cache stats for debugging */
export function cacheStats(): {
  size: number;
  inFlight: number;
  refreshing: number;
  keys: string[];
  namespaces: Array<{ namespace: string; entries: number; fresh: number; stale: number }>;
} {
  const now = Date.now();
  const namespaces = new Map<string, { entries: number; fresh: number; stale: number }>();

  for (const [key, entry] of store.entries()) {
    const namespace = cacheNamespace(key);
    const current = namespaces.get(namespace) || { entries: 0, fresh: 0, stale: 0 };
    current.entries += 1;
    if (entry.staleAt > now) current.fresh += 1;
    else current.stale += 1;
    namespaces.set(namespace, current);
  }

  return {
    size: store.size,
    inFlight: inFlight.size,
    refreshing: refreshing.size,
    keys: Array.from(store.keys()),
    namespaces: Array.from(namespaces.entries())
      .map(([namespace, stats]) => ({ namespace, ...stats }))
      .sort((left, right) => right.entries - left.entries),
  };
}
