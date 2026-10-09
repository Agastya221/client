/**
 * Serves hero artwork (title logos and backdrops) from this site with long-lived caching.
 *
 * Measured 2026-10-05: logos came straight from assets.fanart.tv as 72-204 KB PNGs taking
 * 1.2-2.3 s every time, with no Cache-Control header, so browsers did not reliably keep them and
 * the carousel logo appeared late on every visit. Through here an image is fetched from the
 * source once, kept in Cloudflare's edge cache (the Cache API works on the custom domain) and
 * marked immutable for the browser, so later views load from cache.
 *
 * Runs in worker.ts before Next.js (a fetch and a cache lookup, ~1 ms CPU). Only the artwork
 * hosts below are accepted, so this is not an open proxy.
 */

export const IMAGE_PROXY_PATH = "/api/proxy/img";

const ALLOWED_HOSTS = new Set(["assets.fanart.tv", "artworks.thetvdb.com"]);
const BROWSER_CACHE = "public, max-age=31536000, immutable";
const EDGE_TTL_SECONDS = 30 * 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 15_000;

export function isProxiableImage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** The address to put in <img src>: our cached copy for artwork hosts, the original otherwise. */
export function heroImageSrc<T extends string | null | undefined>(url: T): T | string {
  return isProxiableImage(url) ? `${IMAGE_PROXY_PATH}?u=${encodeURIComponent(url as string)}` : url;
}

interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Returns a response for an image-proxy request, or null when the request is not one. */
export function maybeHandleImageProxy(request: Request, ctx?: WaitUntilContext): Promise<Response> | null {
  const url = new URL(request.url);
  if (url.pathname !== IMAGE_PROXY_PATH) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return Promise.resolve(new Response(null, { status: 405 }));
  const target = url.searchParams.get("u");
  if (!target || !isProxiableImage(target)) return Promise.resolve(new Response("Not allowed", { status: 400 }));
  return proxyImage(request, target, ctx);
}

async function proxyImage(request: Request, target: string, ctx?: WaitUntilContext): Promise<Response> {
  // The cache key is our own URL, so it is the same for every visitor.
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return hit;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YoruMi-image-cache/1.0)", Accept: "image/*" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Cloudflare-specific: also keep the upstream answer in the edge cache.
      cf: { cacheEverything: true, cacheTtl: EDGE_TTL_SECONDS },
    } as RequestInit);
  } catch {
    return new Response("Image source did not answer", { status: 504 });
  }

  const type = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !type.startsWith("image/")) {
    await upstream.body?.cancel();
    // Short cache so a missing image is not re-requested on every slide change, but recovers soon.
    return new Response(null, { status: upstream.ok ? 415 : upstream.status, headers: { "Cache-Control": "public, max-age=300" } });
  }

  const body = await upstream.arrayBuffer();
  const response = new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.byteLength),
      "Cache-Control": BROWSER_CACHE,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
  if (cache) {
    const stored = new Response(body, { status: 200, headers: response.headers });
    const put = cache.put(cacheKey, stored).catch(() => undefined);
    if (ctx) ctx.waitUntil(put);
  }
  return response;
}
