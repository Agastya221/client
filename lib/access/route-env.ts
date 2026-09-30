import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * process.env plus the KV binding, for Next route handlers. The worker hands the binding to
 * worker.ts directly, but route handlers only reach it through the Cloudflare context, which
 * does not exist under `next start` locally (then there is simply no binding).
 */
export function routeEnv(): Record<string, unknown> {
  let kv: unknown;
  try {
    kv = (getCloudflareContext().env as unknown as Record<string, unknown>).APP_CACHE_KV;
  } catch {
    // not running inside a Worker
  }
  return kv ? { ...process.env, APP_CACHE_KV: kv } : { ...process.env };
}
