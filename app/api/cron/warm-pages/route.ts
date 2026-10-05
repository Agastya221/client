import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAccessConfig } from "@/lib/access/invite";
import { routeEnv } from "@/lib/access/route-env";
import { getAnilistPopular, getAnilistSeasonal, getAnilistTrending } from "@/lib/anilist/api";
import { makeWarmToken, pickWarmBatch, verifyWarmToken, WARM_HEADER } from "@/lib/warm-pages";

export const dynamic = "force-dynamic";

const MAX_BATCH = 8;
const PER_PAGE_TIMEOUT_MS = 20_000;

/**
 * GET /api/cron/warm-pages — opens a rotating batch of popular anime pages so each is already
 * rendered and cached when a visitor arrives (the first render of a page takes 0.5-3 s and, on
 * an idle site, also starts the whole Next.js server). Called by the worker's 10-minute cron
 * (worker.ts), authenticated with a token derived from the site secret.
 *
 * The batch rotates through trending, seasonal and popular titles by clock, so every title gets
 * its turn over a day. Pages already cached answer in a few milliseconds and cost no KV write.
 */
/**
 * Fetches one of this site's own pages. Through the worker's binding to itself when there is
 * one: a plain fetch() of the site's own workers.dev address from inside the worker is refused
 * by Cloudflare (403 in 1 ms, seen 2026-10-03), so every warm-up silently did nothing.
 */
function selfFetch(url: string, init: RequestInit): Promise<Response> {
  // A Request built in code has no Host header, unlike one from a browser. OpenNext reads Host
  // when it refreshes a stale page (`host.includes(...)`), so without it every warm-up of a stale
  // page crashed with a 500 (seen 2026-10-05).
  const headers = new Headers(init.headers);
  if (!headers.has("host")) headers.set("host", new URL(url).host);
  init = { ...init, headers };
  try {
    const self = (getCloudflareContext().env as unknown as { WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> } })
      .WORKER_SELF_REFERENCE;
    if (self) return self.fetch(new Request(url, init));
  } catch {
    // not inside a Worker (local `next start`): plain fetch below
  }
  return fetch(url, init);
}

export async function GET(request: Request) {
  const env = routeEnv();
  const secret = getAccessConfig({ ...env, SITE_ACCESS: "on" }).secret;
  if (!(await verifyWarmToken(secret, request.headers.get(WARM_HEADER)))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  const size = Math.min(MAX_BATCH, Math.max(1, Number.parseInt(url.searchParams.get("n") ?? "4", 10) || 4));

  const [trending, seasonal, popular] = await Promise.all([
    getAnilistTrending(24).catch(() => []),
    getAnilistSeasonal(24).catch(() => []),
    getAnilistPopular(24).catch(() => []),
  ]);
  const ids = [...new Set([...trending, ...seasonal, ...popular].filter((m) => !m.isAdult).map((m) => m.id))];
  const batch = pickWarmBatch(ids, Date.now(), size);

  const token = await makeWarmToken(secret);
  const results: { id: number; status: number | string; cache: string | null; ms: number }[] = [];
  for (const id of batch) {
    const started = Date.now();
    try {
      const response = await selfFetch(`${url.origin}/anime/anilist~${id}`, {
        headers: { [WARM_HEADER]: token },
        redirect: "manual",
        signal: AbortSignal.timeout(PER_PAGE_TIMEOUT_MS),
      });
      await response.arrayBuffer();
      results.push({ id, status: response.status, cache: response.headers.get("x-opennext-cache"), ms: Date.now() - started });
    } catch (error) {
      results.push({ id, status: error instanceof Error ? error.name : "error", cache: null, ms: Date.now() - started });
    }
  }

  return NextResponse.json({ pool: ids.length, warmed: results }, { headers: { "Cache-Control": "no-store" } });
}
