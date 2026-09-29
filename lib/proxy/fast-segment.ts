/**
 * Fast path for proxied HLS video segments, run by worker.ts before Next.js.
 *
 * About 150 segment requests make up one episode, ~90% of all Worker traffic. Routing
 * each through the Next.js route handler cost ~24 ms of CPU, almost all of it Next's own
 * per-request overhead, against the free plan's 10 ms limit. This handles the same
 * requests with plain fetch-and-stream in ~1-2 ms.
 *
 * It must behave exactly like the streaming branch of
 * app/api/proxy/m3u8-streaming-proxy/route.ts (see tests/fast-segment.test.ts, which
 * compares the two). It only takes requests that are guaranteed to hit that branch:
 * GET, `type=video`, and no `unwrap` (FlixCloud image segments must be decoded, which
 * stays in the route). Everything else returns null and falls through to Next.js.
 *
 * Keep this file free of Next.js and Node-only imports: it runs outside Next.
 */
export const SEGMENT_PROXY_PATH = "/api/proxy/m3u8-streaming-proxy";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PASSTHROUGH_HEADERS = ["accept-ranges", "content-length", "content-range", "content-disposition"];

/** Returns a response for a plain video-segment proxy request, or null to fall through. */
export function maybeHandleFastSegment(request: Request): Promise<Response> | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.pathname !== SEGMENT_PROXY_PATH) return null;
  const params = url.searchParams;
  if (params.get("type") !== "video" || params.get("unwrap") === "flix-segment") return null;
  return proxySegment(request, params);
}

async function proxySegment(request: Request, params: URLSearchParams): Promise<Response> {
  const targetUrl = params.get("url");
  const referer = params.get("referer");
  const serveAsTs = params.get("as_ts") === "1";

  if (!targetUrl) return new Response("Missing url parameter", { status: 400 });

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== "https:" && parsedTarget.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      "Accept": "video/mp4,video/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (referer) {
      headers["Referer"] = referer;
      try {
        headers["Origin"] = new URL(referer).origin;
      } catch {
        // Safe to ignore invalid referer for Origin header
      }
    }
    const range = request.headers.get("range");
    if (range) headers["Range"] = range;

    let response = await fetch(targetUrl, { headers, cache: "no-store" });
    if (response.status >= 500 && response.status <= 504) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      response = await fetch(targetUrl, { headers, cache: "no-store" });
    }

    if (!response.ok) {
      return new Response(`Target returned status ${response.status}`, {
        status: response.status,
        headers: CORS_HEADERS,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    const responseHeaders = new Headers(CORS_HEADERS);
    if (serveAsTs) responseHeaders.set("Content-Type", "video/mp2t");
    else if (contentType) responseHeaders.set("Content-Type", contentType);
    const isCacheableSegment = /\.(ts|m4s|aac|key|vtt|srt)$/.test(parsedTarget.pathname.toLowerCase());
    responseHeaders.set(
      "Cache-Control",
      isCacheableSegment && !range
        ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
        : "no-store",
    );
    responseHeaders.set("Vary", "Range");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    for (const header of PASSTHROUGH_HEADERS) {
      const value = response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error("Local HLS proxy error:", error);
    return new Response("Proxy internal error", { status: 500, headers: CORS_HEADERS });
  }
}
