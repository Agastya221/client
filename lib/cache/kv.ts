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

const BASE = () => {
  const accountId = process.env.CF_KV_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  if (!accountId || !namespaceId) return null;
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values`;
};

const TOKEN = () => process.env.CF_KV_API_TOKEN ?? null;

function isConfigured(): boolean {
  return Boolean(process.env.CF_KV_ACCOUNT_ID && process.env.CF_KV_NAMESPACE_ID && process.env.CF_KV_API_TOKEN);
}

/** Read a JSON value from KV. Returns null on miss or error. */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  if (!isConfigured()) return null;
  const base = BASE();
  const token = TOKEN();
  if (!base || !token) return null;

  try {
    const res = await fetch(`${base}/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
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
  if (!isConfigured()) return;
  const base = BASE();
  const token = TOKEN();
  if (!base || !token) return;

  const url = `${base}/${encodeURIComponent(key)}?expiration_ttl=${ttlSeconds}`;
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
  if (!isConfigured()) return;
  const base = BASE();
  const token = TOKEN();
  if (!base || !token) return;

  try {
    await fetch(`${base}/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort
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
