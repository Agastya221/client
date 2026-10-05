/**
 * Worker entry point: OpenNext's generated handler plus a cron `scheduled` handler.
 *
 * `opennextjs-cloudflare build` writes `.open-next/worker.js`, which only exports
 * `fetch`. Cloudflare Cron Triggers need a `scheduled` export as well, so wrangler.jsonc
 * points `main` here and this file delegates every request to the generated handler.
 *
 * It re-exports the optional Durable Object classes the generated worker exposes, so
 * the deployed surface is identical apart from `scheduled`.
 *
 * Not part of the Next.js app: wrangler bundles this file, and tsconfig.json excludes it because
 * `.open-next/worker.js` only exists after `opennextjs-cloudflare build`.
 */
import openNext from "./.open-next/worker.js";
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
import { maybeHandleFastSegment } from "./lib/proxy/fast-segment";
import { applyAccessGate } from "./lib/access/gate";
// This build's ISR revalidation ID; the gate lets Next's own page refreshes through with it.
import prerenderManifest from "./.open-next/server-functions/default/.next/prerender-manifest.json";

const REVALIDATE_ID: string | null =
  (prerenderManifest as { preview?: { previewModeId?: string } }).preview?.previewModeId ?? null;
import { getAccessConfig } from "./lib/access/invite";
import { makeWarmToken, WARM_HEADER } from "./lib/warm-pages";
import { withEdgeCache } from "./lib/edge-page-cache";

interface ScheduledEnv {
  ANIVEXA_API_BASE_URL?: string;
  SITE_ORIGIN?: string;
  [key: string]: unknown;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  /**
   * Video segments skip Next.js entirely (see lib/proxy/fast-segment.ts): ~150 per
   * episode, and Next's per-request overhead alone exceeded the free plan's 10 ms CPU.
   */
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const fastSegment = maybeHandleFastSegment(request, env as Record<string, unknown>);
    if (fastSegment) return fastSegment;
    // Invite-only gate. A no-op unless SITE_ACCESS is set (see lib/access/gate.ts).
    const blocked = await applyAccessGate(request, env as Record<string, unknown>, { revalidateId: REVALIDATE_ID });
    if (blocked) return blocked;
    // Watch pages and comment lists are shared from Cloudflare's edge cache (lib/edge-page-cache.ts):
    // rendering them cost 80-160 ms of CPU each, the cause of Error 1102 while switching episodes.
    // Keyed by deployment, so a new deploy never serves pages that point at old files.
    const version = (env as { CF_VERSION_METADATA?: { id?: string } }).CF_VERSION_METADATA?.id || "dev";
    return withEdgeCache(
      request,
      version,
      () => (openNext.fetch as (request: Request, env: unknown, ctx: unknown) => Promise<Response>)(request, env, ctx),
      ctx as ExecutionContextLike,
    );
  },

  /**
   * Keep-warm ping. The Anivexa API runs on Render's free plan, which sleeps after
   * ~15 minutes without traffic; the next request then waits 30-60s while it boots.
   * That would hit whoever presses play first, and any AniList request that goes
   * through it. Pinging every 10 minutes (see `triggers.crons` in wrangler.jsonc)
   * keeps the instance awake: ~720 of Render's 750 free hours per month, which only
   * fits while it is the account's single free service.
   */
  async scheduled(controller: { cron?: string } | undefined, env: ScheduledEnv, ctx: ExecutionContextLike): Promise<void> {
    // The 5-past schedule (wrangler.jsonc) only pre-fetches episodes: a run of its own, so its
    // outside requests do not share the free plan's ~50-per-run budget with the page warm-up.
    if (controller?.cron === PREFETCH_CRON) {
      ctx.waitUntil(prefetchEpisodes(env, ctx));
      return;
    }
    ctx.waitUntil(warmPages(env, ctx));
    const base = env.ANIVEXA_API_BASE_URL?.trim().replace(/\/+$/, "");
    if (!base) {
      console.warn("keep-warm skipped: ANIVEXA_API_BASE_URL is not set");
      return;
    }

    ctx.waitUntil(
      (async () => {
        const startedAt = Date.now();
        try {
          const response = await fetch(`${base}/healthz`, {
            headers: { "User-Agent": "tatakai-keepwarm/1.0" },
            signal: AbortSignal.timeout(50_000),
          });
          await response.body?.cancel();
          console.log(`keep-warm ${response.status} in ${Date.now() - startedAt}ms`);
        } catch (error) {
          console.warn(`keep-warm failed after ${Date.now() - startedAt}ms:`, String(error));
        }
      })(),
    );
  },
};

const PREFETCH_CRON = "5-59/10 * * * *";

/** Looks up the latest episode of airing shows ahead of viewers (app/api/cron/prefetch-episodes). */
async function prefetchEpisodes(env: ScheduledEnv, ctx: ExecutionContextLike): Promise<void> {
  const origin = env.SITE_ORIGIN?.trim().replace(/\/+$/, "");
  const secret = getAccessConfig({ ...env, SITE_ACCESS: "on" }).secret;
  if (!origin || !secret) {
    console.warn("prefetch-episodes skipped: SITE_ORIGIN or the site secret is not set");
    return;
  }
  try {
    const request = new Request(`${origin}/api/cron/prefetch-episodes`, {
      headers: { [WARM_HEADER]: await makeWarmToken(secret) },
    });
    // Never let a stuck run sit until Cloudflare's 15-minute cap: give up after 3 minutes.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      (async () => {
        const response = await (openNext.fetch as (request: Request, env: unknown, ctx: unknown) => Promise<Response>)(request, env, ctx);
        return `prefetch-episodes ${response.status}: ${(await response.text()).slice(0, 900)}`;
      })(),
      new Promise<string>((resolve) => { timer = setTimeout(() => resolve("prefetch-episodes gave up after 180s"), 180_000); }),
    ]).finally(() => clearTimeout(timer));
    console.log(outcome);
  } catch (error) {
    console.warn("prefetch-episodes failed:", String(error));
  }
}

/**
 * Pre-renders a rotating batch of popular anime pages (see app/api/cron/warm-pages/route.ts) so
 * visitors find them cached. Runs inside the same Worker, so it also keeps this copy of the
 * Next.js server warm. Never throws: a failed warm-up must not affect the keep-warm ping.
 */
async function warmPages(env: ScheduledEnv, ctx: ExecutionContextLike): Promise<void> {
  const origin = env.SITE_ORIGIN?.trim().replace(/\/+$/, "");
  const secret = getAccessConfig({ ...env, SITE_ACCESS: "on" }).secret;
  if (!origin || !secret) {
    console.warn("warm-pages skipped: SITE_ORIGIN or the site secret is not set");
    return;
  }
  try {
    const request = new Request(`${origin}/api/cron/warm-pages?n=4`, {
      headers: { [WARM_HEADER]: await makeWarmToken(secret) },
    });
    const response = await (openNext.fetch as (request: Request, env: unknown, ctx: unknown) => Promise<Response>)(request, env, ctx);
    const summary = (await response.text()).slice(0, 600);
    console.log(`warm-pages ${response.status}: ${summary}`);
  } catch (error) {
    console.warn("warm-pages failed:", String(error));
  }
}
