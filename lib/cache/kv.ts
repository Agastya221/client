/**
 * Cloudflare KV REST API cache helper
 *
 * Works in any Node.js / edge runtime by hitting the KV REST API.
 * Required environment variables:
 *   CF_KV_ACCOUNT_ID   – Cloudflare account ID
 *   CF_KV_NAMESPACE_ID – KV namespace ID (create one in CF dashboard)
 *   CF_KV_API_TOKEN    – API token with KV:Edit permission
 *
 * Usage:
 *   import { kvGet, kvSet, kvDelete } from "@/lib/cache/kv";
 *
 *   const cached = await kvGet<MyType>("my-key");
 *   if (!cached) {
 *     const fresh = await fetchExpensiveData();
 *     await kvSet("my-key", fresh, 300); // TTL 300s
 *   }
 */

const NAMESPACE_BASE = () => {
  const accountId = process.env.CF_KV_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  if (!accountId || !namespaceId) return null;
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
};

const TOKEN = () => process.env.CF_KV_API_TOKEN ?? null;

function isEnabledFlag(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() || "");
}

function isDisabledFlag(value: string | undefined): boolean {
  return /^(0|false|no|off)$/i.test(value?.trim() || "");
}

function isBuildProcess(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build"
    || process.env.npm_lifecycle_event === "build";
}

function usesLocalSiteUrl(): boolean {
  const rawUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!rawUrl) return false;

  try {
    const hostname = new URL(rawUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Persistent KV is a production-runtime cache.
 *
 * Local development and `next build` still use the in-memory L1 cache, but
 * they must not consume the production namespace's daily write allowance.
 * Each escape hatch is explicit so an intentional local cache test remains
 * possible without making it the default.
 */
export function isKvRuntimeEnabled(): boolean {
  if (isDisabledFlag(process.env.CF_KV_ENABLED)) return false;

  if (isBuildProcess() && !isEnabledFlag(process.env.CF_KV_ALLOW_BUILD)) {
    return false;
  }

  const isLocalRuntime = process.env.NODE_ENV !== "production" || usesLocalSiteUrl();
  if (isLocalRuntime && !isEnabledFlag(process.env.CF_KV_ALLOW_LOCAL)) {
    return false;
  }

  return true;
}

export function isKvConfigured(): boolean {
  return isKvRuntimeEnabled()
    && Boolean(
      process.env.CF_KV_ACCOUNT_ID
      && process.env.CF_KV_NAMESPACE_ID
      && process.env.CF_KV_API_TOKEN,
    );
}

/** Read a JSON value from KV. Returns null on miss or error. */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  if (!isKvConfigured()) return null;
  const base = NAMESPACE_BASE();
  const token = TOKEN();
  if (!base || !token) return null;

  try {
    const res = await fetch(`${base}/values/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Write a JSON value to KV with an optional TTL in seconds. */
export async function kvSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  if (!isKvConfigured()) return;
  const base = NAMESPACE_BASE();
  const token = TOKEN();
  if (!base || !token) return;

  const url = `${base}/values/${encodeURIComponent(key)}?expiration_ttl=${Math.max(60, Math.ceil(ttlSeconds))}`;
  try {
    await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: JSON.stringify(value),
    });
  } catch {
    // best-effort; don't throw on cache write failure
  }
}

/** Delete a key from KV. */
export async function kvDelete(key: string): Promise<void> {
  if (!isKvConfigured()) return;
  const base = NAMESPACE_BASE();
  const token = TOKEN();
  if (!base || !token) return;

  try {
    await fetch(`${base}/values/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort
  }
}

type KvKeyListResponse = {
  result?: Array<{ name?: string }>;
  result_info?: {
    cursor?: string;
  };
};

/** Delete all keys matching a prefix, including paginated KV listings. */
export async function kvDeletePrefix(prefix: string): Promise<void> {
  if (!isKvConfigured() || !prefix) return;
  const base = NAMESPACE_BASE();
  const token = TOKEN();
  if (!base || !token) return;

  try {
    let cursor = "";
    do {
      const params = new URLSearchParams({ prefix, limit: "1000" });
      if (cursor) params.set("cursor", cursor);

      const listResponse = await fetch(`${base}/keys?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!listResponse.ok) return;

      const payload = await listResponse.json() as KvKeyListResponse;
      const keys = (payload.result || [])
        .map((entry) => entry.name)
        .filter((name): name is string => Boolean(name));

      if (keys.length > 0) {
        const deleteResponse = await fetch(`${base}/bulk/delete`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(keys),
        });
        if (!deleteResponse.ok) return;
      }

      cursor = payload.result_info?.cursor || "";
    } while (cursor);
  } catch {
    // Cache invalidation is best-effort and must not break playback.
  }
}

/**
 * Cache-aside helper: try KV first, fall back to fetcher, store result.
 *
 * @param key       KV cache key
 * @param fetcher   Async function that returns fresh data
 * @param ttl       TTL in seconds (default 300)
 */
export async function kvCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 300,
): Promise<T> {
  const cached = await kvGet<T>(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  // Fire-and-forget so we don't block the response
  void kvSet(key, fresh, ttl);
  return fresh;
}
