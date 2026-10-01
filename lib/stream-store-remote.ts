/**
 * Where resolved stream links are kept: the Redis behind the Render service, reached through its
 * protected POST /linkstore endpoint (core/linkstore.js in the Anivexa API). Same x-proxy-key as
 * the AniList relay, so the Worker needs no Redis credentials, and Redis has no daily write cap
 * (Cloudflare KV allows only 1,000 writes a day on the free plan).
 *
 * Every failure (no proxy configured, Render slow or down, Redis not set up there) just means
 * "not stored": a read finds nothing and a write is skipped, so playback is never blocked.
 */
import { anilistProxyUrl } from "@/lib/anilist/endpoint";
import type { StreamStorage } from "@/lib/stream-store";

const TIMEOUT_MS = 2_500;

/** https://<render>/linkstore, derived from ANILIST_PROXY_URL (https://<render>/anilist). */
export function linkStoreUrl(proxy = anilistProxyUrl()): string | null {
  if (!proxy) return null;
  return `${proxy.replace(/\/+$/, "").replace(/\/anilist$/, "")}/linkstore`;
}

export function createRemoteStreamStorage(options: {
  fetchImpl?: typeof fetch;
  url?: () => string | null;
  key?: () => string | undefined;
} = {}): StreamStorage {
  const url = options.url ?? (() => linkStoreUrl());
  const proxyKey = options.key ?? (() => process.env.ANILIST_PROXY_KEY?.trim());

  async function call(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const endpoint = url();
    if (!endpoint) return null;
    const key = proxyKey();
    try {
      const response = await (options.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "x-proxy-key": key } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return {
    async get<T>(key: string) {
      const reply = await call({ op: "get", key });
      if (!reply || typeof reply.value !== "string") return null;
      try {
        return JSON.parse(reply.value) as T;
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      await call({ op: "set", key, value: JSON.stringify(value), ttlSeconds });
    },
    async delete(key) {
      await call({ op: "del", key });
    },
    async deletePrefix(prefix) {
      await call({ op: "delprefix", prefix });
    },
  };
}

export const remoteStreamStorage = createRemoteStreamStorage();
