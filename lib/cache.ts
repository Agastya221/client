/**
 * Two-level cache for expensive API responses.
 *
 * L1 is a fast process-local memory cache. L2 is Cloudflare KV, the only
 * persistent/distributed cache service used by this layer.
 */

import { recordCounter } from "@/lib/observability";
import {
  isKvConfigured,
  kvDelete,
  kvDeletePrefix,
  kvGet,
  kvSet,
} from "@/lib/cache/kv";

type CacheEnvelope<T> = {
  version: 1;
  data: T;
  createdAt: number;
  staleAt: number;
  expiresAt: number;
};

const inFlight = new Map<string, Promise<unknown>>();
const refreshing = new Set<string>();
const store = new Map<string, CacheEnvelope<unknown>>();

const DEFAULT_FRESH_MS = 5 * 60 * 1000;
const DEFAULT_STALE_MS = 30 * 60 * 1000;
const DEFAULT_EXPIRE_MS = 60 * 60 * 1000;

if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }, 10 * 60 * 1000);
  cleanupTimer.unref?.();
}

function cacheNamespace(key: string): string {
  return key.split(":")[0] || "unknown";
}

export interface CacheOptions {
  freshMs?: number;
  staleMs?: number;
  expireMs?: number;
  shouldCache?: (value: unknown) => boolean;
}

function createEnvelope<T>(
  data: T,
  createdAt: number,
  freshMs: number,
  staleMs: number,
  expireMs: number,
): CacheEnvelope<T> {
  return {
    version: 1,
    data,
    createdAt,
    staleAt: createdAt + freshMs,
    expiresAt: createdAt + Math.max(expireMs, staleMs),
  };
}

function isCacheEnvelope<T>(value: unknown): value is CacheEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CacheEnvelope<T>>;
  return candidate.version === 1
    && "data" in candidate
    && typeof candidate.createdAt === "number"
    && typeof candidate.staleAt === "number"
    && typeof candidate.expiresAt === "number";
}

function canStore(value: unknown, shouldCache?: (value: unknown) => boolean): boolean {
  return shouldCache ? shouldCache(value) : true;
}

function storeValue<T>(
  key: string,
  data: T,
  options: {
    freshMs: number;
    staleMs: number;
    expireMs: number;
  },
): void {
  const storedAt = Date.now();
  const envelope = createEnvelope(
    data,
    storedAt,
    options.freshMs,
    options.staleMs,
    options.expireMs,
  );
  store.set(key, envelope);
  const ttlSeconds = Math.max(60, Math.ceil((envelope.expiresAt - storedAt) / 1000));

  // The response is already safe in L1. Persist to KV without adding a
  // Cloudflare REST round trip to the user's request latency.
  void kvSet(key, envelope, ttlSeconds);
}

async function fetchAndMaybeStore<T>(
  key: string,
  namespace: string,
  fetcher: () => Promise<T>,
  options: {
    freshMs: number;
    staleMs: number;
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

    storeValue(
      key,
      data,
      {
        freshMs: options.freshMs,
        staleMs: options.staleMs,
        expireMs: options.expireMs,
      },
    );
    recordCounter("cache.store", 1, {
      namespace,
      source: options.source,
      target: isKvConfigured() ? "memory+cloudflare-kv" : "memory",
    });
    return data;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Get-or-fetch with memory-first, KV-backed stale-while-revalidate semantics. */
export async function cacheFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  const freshMs = options?.freshMs ?? DEFAULT_FRESH_MS;
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
  const expireMs = options?.expireMs ?? DEFAULT_EXPIRE_MS;
  const shouldCache = options?.shouldCache;
  const namespace = cacheNamespace(key);
  const now = Date.now();

  const memoryValue = store.get(key) as CacheEnvelope<T> | undefined;
  if (memoryValue) {
    if (!canStore(memoryValue.data, shouldCache)) {
      store.delete(key);
      void kvDelete(key);
      recordCounter("cache.invalidate", 1, { namespace, scope: "invalid" });
    } else if (memoryValue.expiresAt <= now) {
      store.delete(key);
      void kvDelete(key);
      recordCounter("cache.expired", 1, { namespace });
    } else if (memoryValue.staleAt > now) {
      recordCounter("cache.hit", 1, { namespace, state: "memory-fresh" });
      return memoryValue.data;
    } else {
      recordCounter("cache.hit", 1, { namespace, state: "memory-stale" });
      if (!refreshing.has(key) && !inFlight.has(key)) {
        refreshing.add(key);
        void fetchAndMaybeStore(key, namespace, fetcher, {
          freshMs,
          staleMs,
          expireMs,
          shouldCache,
          source: "refresh",
        })
          .then(() => {
            recordCounter("cache.refresh", 1, { namespace, outcome: "success" });
          })
          .catch(() => {
            recordCounter("cache.refresh", 1, { namespace, outcome: "error" });
          })
          .finally(() => {
            refreshing.delete(key);
          });
      } else {
        recordCounter("cache.refresh", 1, { namespace, outcome: "deduped" });
      }
      return memoryValue.data;
    }
  }

  const kvValue = await kvGet<CacheEnvelope<T> | T>(key);
  if (kvValue !== null) {
    // Values from the previous cache implementation were stored without an
    // envelope. Keep serving them until their existing KV TTL expires.
    if (!isCacheEnvelope<T>(kvValue)) {
      if (canStore(kvValue, shouldCache)) {
        store.set(
          key,
          createEnvelope(kvValue, now, freshMs, staleMs, expireMs),
        );
        recordCounter("cache.hit", 1, { namespace, state: "kv-legacy" });
        return kvValue;
      }
      void kvDelete(key);
    } else if (!canStore(kvValue.data, shouldCache)) {
      void kvDelete(key);
      recordCounter("cache.invalidate", 1, { namespace, scope: "invalid" });
    } else if (kvValue.expiresAt <= now) {
      void kvDelete(key);
      recordCounter("cache.expired", 1, { namespace });
    } else if (kvValue.staleAt > now) {
      store.set(key, kvValue);
      recordCounter("cache.hit", 1, { namespace, state: "kv-fresh" });
      return kvValue.data;
    } else {
      store.set(key, kvValue);
      recordCounter("cache.hit", 1, { namespace, state: "kv-stale" });
      if (!refreshing.has(key) && !inFlight.has(key)) {
        refreshing.add(key);
        void fetchAndMaybeStore(key, namespace, fetcher, {
          freshMs,
          staleMs,
          expireMs,
          shouldCache,
          source: "refresh",
        })
          .then(() => {
            recordCounter("cache.refresh", 1, { namespace, outcome: "success" });
          })
          .catch(() => {
            recordCounter("cache.refresh", 1, { namespace, outcome: "error" });
          })
          .finally(() => {
            refreshing.delete(key);
          });
      } else {
        recordCounter("cache.refresh", 1, { namespace, outcome: "deduped" });
      }
      return kvValue.data;
    }
  }

  recordCounter("cache.miss", 1, {
    namespace,
    target: isKvConfigured() ? "cloudflare-kv" : "unconfigured",
  });

  return fetchAndMaybeStore(key, namespace, fetcher, {
    freshMs,
    staleMs,
    expireMs,
    shouldCache,
    source: "miss",
  });
}

/** Write a known value to both memory and KV, without waiting on KV I/O. */
export function cacheStore<T>(
  key: string,
  data: T,
  options?: CacheOptions,
): void {
  if (!canStore(data, options?.shouldCache)) {
    cacheInvalidate(key);
    return;
  }

  storeValue(key, data, {
    freshMs: options?.freshMs ?? DEFAULT_FRESH_MS,
    staleMs: options?.staleMs ?? DEFAULT_STALE_MS,
    expireMs: options?.expireMs ?? DEFAULT_EXPIRE_MS,
  });
  recordCounter("cache.store", 1, {
    namespace: cacheNamespace(key),
    source: "manual",
    target: isKvConfigured() ? "memory+cloudflare-kv" : "memory",
  });
}

export function cacheInvalidate(key: string): void {
  store.delete(key);
  void kvDelete(key);
  recordCounter("cache.invalidate", 1, {
    namespace: cacheNamespace(key),
    scope: "single",
    target: "cloudflare-kv",
  });
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  void kvDeletePrefix(prefix);
  recordCounter("cache.invalidate", 1, {
    namespace: cacheNamespace(prefix),
    scope: "prefix",
    target: "cloudflare-kv",
  });
}

/** Synchronous L1 statistics plus the configured persistent cache mode. */
export function cacheStats(): {
  mode: "memory+cloudflare-kv";
  configured: boolean;
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
    mode: "memory+cloudflare-kv",
    configured: isKvConfigured(),
    size: store.size,
    inFlight: inFlight.size,
    refreshing: refreshing.size,
    keys: Array.from(store.keys()),
    namespaces: Array.from(namespaces.entries())
      .map(([namespace, stats]) => ({ namespace, ...stats }))
      .sort((left, right) => right.entries - left.entries),
  };
}
