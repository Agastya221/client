/**
 * OpenNext configuration for the Cloudflare Workers adapter.
 *
 * Written against @opennextjs/cloudflare 1.20.1 — shape verified against
 * `node_modules/@opennextjs/cloudflare/templates/open-next.config.ts` and the
 * `defineCloudflareConfig` types in `dist/api/config.d.ts`, not from memory.
 *
 * Consumed by `opennextjs-cloudflare build`. Bindings referenced here must
 * exist in wrangler.jsonc.
 */
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

export default defineCloudflareConfig({
  /**
   * ISR / fetch cache backed by Workers KV (binding `NEXT_INC_CACHE_KV`).
   *
   * KV is chosen over the adapter's default R2 cache because the free plan
   * already includes a generous KV allowance and this project has no other
   * use for an R2 bucket. Entries are stored under the `incremental-cache`
   * prefix (override with the NEXT_INC_CACHE_KV_PREFIX var).
   */
  incrementalCache: kvIncrementalCache,

  /**
   * Revalidation queue. "direct" regenerates the page inline on the request
   * that finds a stale entry — no Durable Object required, which keeps this
   * deployable on the free plan.
   *
   * The app only uses time-based revalidation (`export const revalidate = 300`
   * in app/page.tsx and `next: { revalidate }` on a handful of fetches), never
   * revalidateTag/revalidatePath, so the default "dummy" tagCache is
   * deliberately left in place. If on-demand tag revalidation is added later,
   * wire up a tagCache override (D1 or a sharded Durable Object) at the same
   * time — otherwise those calls will silently no-op.
   */
  queue: "direct",

  /**
   * Left at the default (false). Cache interception must stay off if PPR is
   * ever enabled, and it is not needed for time-based ISR.
   */
  enableCacheInterception: false,

  // Optional cost/latency tuning for later — NOT enabled yet:
  //
  //   import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
  //   incrementalCache: withRegionalCache(kvIncrementalCache, { mode: "short-lived" }),
  //
  // This fronts KV with the per-colo Cache API and cuts KV read operations.
  // Adds a cross-region staleness window, so only turn it on once the basic
  // deploy is verified.
});
