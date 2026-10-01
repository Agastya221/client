/**
 * Resolved stream links kept in Upstash Redis, called straight from the Worker over its REST API
 * (one HTTPS request per command). This skips the Render hop of lib/stream-store-remote.ts,
 * which added about 0.17 s to every repeat open and failed whenever Render was asleep.
 *
 * Needs the Worker secrets UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (the same values
 * the Render service uses). Without them lib/stream-store.ts falls back to the Render route.
 * Only keys that start with "stream-link:" are ever touched, because the token reaches the whole
 * database. Every failure just means "not stored", so playback is never blocked.
 */
import type { StreamStorage } from "@/lib/stream-store";

const TIMEOUT_MS = 2_500;
const KEY_PREFIX = "stream-link:";
const MAX_KEY_CHARS = 300;
const MAX_VALUE_CHARS = 256 * 1024;
const SCAN_COUNT = 1_000;
const SCAN_PAGES_MAX = 50;

export interface UpstashConfig {
  url: string;
  token: string;
}

export function upstashConfig(env: Record<string, string | undefined> = process.env): UpstashConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, "") ?? "";
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  if (!/^https:\/\//.test(url) || !token || url.includes("YOUR_") || token.includes("YOUR_")) return null;
  return { url, token };
}

const validKey = (key: unknown): key is string =>
  typeof key === "string" && key.startsWith(KEY_PREFIX) && key.length <= MAX_KEY_CHARS && !/[\s*?[\]\\]/.test(key);

export function createUpstashStreamStorage(options: {
  fetchImpl?: typeof fetch;
  config?: () => UpstashConfig | null;
} = {}): StreamStorage {
  const config = options.config ?? (() => upstashConfig());

  async function command(args: (string | number)[]): Promise<unknown> {
    const target = config();
    if (!target) return null;
    try {
      const response = await (options.fetchImpl ?? fetch)(target.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${target.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      return ((await response.json()) as { result?: unknown }).result ?? null;
    } catch {
      return null;
    }
  }

  return {
    async get<T>(key: string) {
      if (!validKey(key)) return null;
      const value = await command(["GET", key]);
      if (typeof value !== "string") return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      if (!validKey(key)) return;
      const text = JSON.stringify(value);
      if (!text || text.length > MAX_VALUE_CHARS) return;
      await command(["SET", key, text, "EX", Math.max(60, Math.floor(ttlSeconds))]);
    },
    async delete(key) {
      if (!validKey(key)) return;
      await command(["DEL", key]);
    },
    async deletePrefix(prefix) {
      if (!validKey(prefix)) return;
      let cursor = "0";
      for (let page = 0; page < SCAN_PAGES_MAX; page += 1) {
        const result = await command(["SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", SCAN_COUNT]);
        if (!Array.isArray(result)) break;
        const [next, keys] = result as [string | number, unknown];
        const found = Array.isArray(keys) ? keys.filter(validKey) : [];
        if (found.length) await command(["DEL", ...found]);
        cursor = String(next);
        if (cursor === "0") break;
      }
    },
  };
}

export const upstashStreamStorage = createUpstashStreamStorage();
