/**
 * Cloudflare's free Cache API in front of the two requests that cost the most CPU per visit:
 *
 *  - the watch page (`/anime/<id>/watch?ep=N[&dub=1]`): rendered by Next on every visit,
 *    80-150 ms of CPU against the free plan's 10 ms, which is what produced Error 1102
 *    while switching episodes. Its HTML has nothing per viewer, so one copy serves everyone.
 *  - the comment list (`GET /api/comments`): a Prisma query plus two AniList calls each time.
 *
 * Served from worker.ts before Next.js starts, so a hit costs a few ms. The Cache API only
 * works on a custom domain (yorumi.lol) and is kept per data centre; on workers.dev it simply
 * never hits. Nothing here touches KV, so it costs none of the 1,000 daily KV writes.
 */

export const WATCH_PAGE_SECONDS = 10 * 60;
export const COMMENTS_SECONDS = 20;

const CACHE_ORIGIN = "https://edge-cache.yorumi.internal";

interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

/** The cache key for a request, or null when the request must always reach Next. */
export function edgeCacheKey(request: Request, version: string): { key: string; seconds: number } | null {
  if (request.method !== "GET") return null;
  // Client-side navigations and prefetches ask for the RSC payload under the same path.
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch") || request.headers.has("next-router-state-tree")) {
    return null;
  }
  const url = new URL(request.url);
  const params = url.searchParams;

  const watch = url.pathname.match(/^\/anime\/([^/]+)\/watch\/?$/);
  if (watch) {
    // Only the shareable form: provider/server/episodeId pick a specific source on purpose.
    if ([...params.keys()].some((name) => name !== "ep" && name !== "dub")) return null;
    const ep = Number(params.get("ep") || "1");
    if (!Number.isInteger(ep) || ep <= 0) return null;
    const dub = params.get("dub") === "1" || params.get("dub") === "true" ? "dub" : "sub";
    return { key: `${CACHE_ORIGIN}/${version}/watch/${watch[1]}/${ep}/${dub}`, seconds: WATCH_PAGE_SECONDS };
  }

  if (url.pathname === "/api/comments") {
    const animeId = params.get("animeId");
    if (!animeId || params.has("fresh") || params.has("id")) return null;
    const episode = params.get("episode") || "all";
    return { key: `${CACHE_ORIGIN}/${version}/comments/${encodeURIComponent(animeId)}/${encodeURIComponent(episode)}`, seconds: COMMENTS_SECONDS };
  }

  return null;
}

/** Whether a response may be shared with every viewer. */
export function isShareable(response: Response): boolean {
  return response.status === 200 && !response.headers.has("set-cookie");
}

/**
 * Answers from the edge cache when it can, otherwise asks `next` and keeps a shareable answer.
 * The viewer's own response keeps Next's headers; only the stored copy gets a lifetime.
 */
export async function withEdgeCache(
  request: Request,
  version: string,
  next: () => Promise<Response>,
  ctx: WaitUntil,
  cache: CacheLike | null = (globalThis as { caches?: { default?: CacheLike } }).caches?.default ?? null,
): Promise<Response> {
  const target = cache ? edgeCacheKey(request, version) : null;
  if (!cache || !target) return next();

  const keyRequest = new Request(target.key);
  try {
    const hit = await cache.match(keyRequest);
    if (hit) {
      const response = new Response(hit.body, hit);
      response.headers.set("x-edge-cache", "HIT");
      response.headers.delete("cache-control");
      response.headers.set("cache-control", "private, no-store");
      return response;
    }
  } catch {
    // A cache failure is just a miss.
  }

  const response = await next();
  if (!isShareable(response)) return response;
  const stored = new Response(response.clone().body, response);
  stored.headers.set("cache-control", `public, max-age=${target.seconds}`);
  ctx.waitUntil(cache.put(keyRequest, stored).catch(() => undefined));
  const out = new Response(response.body, response);
  out.headers.set("x-edge-cache", "MISS");
  return out;
}
