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
import { getAccessConfig } from "./lib/access/invite";
import { makeWarmToken, WARM_HEADER } from "./lib/warm-pages";

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
    const blocked = await applyAccessGate(request, env as Record<string, unknown>);
    if (blocked) return blocked;
    return (openNext.fetch as (request: Request, env: unknown, ctx: unknown) => Promise<Response>)(request, env, ctx);
  },

  /**
   * Keep-warm ping. The Anivexa API runs on Render's free plan, which sleeps after
   * ~15 minutes without traffic; the next request then waits 30-60s while it boots.
   * That would hit whoever presses play first, and any AniList request that goes
   * through it. Pinging every 10 minutes (see `triggers.crons` in wrangler.jsonc)
   * keeps the instance awake: ~720 of Render's 750 free hours per month, which only
   * fits while it is the account's single free service.
   */
  async scheduled(_controller: unknown, env: ScheduledEnv, ctx: ExecutionContextLike): Promise<void> {
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
