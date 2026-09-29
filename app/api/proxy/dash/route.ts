import { isAllowedDashAsset, readDashProxyToken } from "@/lib/anime/dash-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const session = readDashProxyToken(params.get("token") || "");
  if (!session) return new Response("Invalid DASH session", { status: 403 });

  let assetUrl: URL;
  try {
    assetUrl = new URL(params.get("url") || "");
    if (!isAllowedDashAsset(assetUrl, session.manifestUrl)) throw new Error("Disallowed DASH asset");
  } catch {
    return new Response("Invalid DASH asset", { status: 400 });
  }

  const headers: Record<string, string> = { Accept: "*/*" };
  if (session.authorization) headers.Authorization = session.authorization;
  if (session.referer) {
    headers.Referer = session.referer;
    try { headers.Origin = new URL(session.referer).origin; } catch {}
  }
  const range = request.headers.get("range");
  if (range) headers.Range = range;

  try {
    let upstream: Response | null = null;
    for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
      upstream = await fetch(assetUrl, {
        headers,
        cache: "no-store",
        redirect: "manual",
        signal: request.signal,
      });
      if (upstream.status < 300 || upstream.status >= 400) break;
      const location = upstream.headers.get("location");
      if (!location) break;
      const redirectedUrl = new URL(location, assetUrl);
      if (!isAllowedDashAsset(redirectedUrl, session.manifestUrl)) {
        return new Response("Disallowed DASH redirect", { status: 502 });
      }
      assetUrl = redirectedUrl;
    }
    if (!upstream || (upstream.status >= 300 && upstream.status < 400)) {
      return new Response("DASH redirect limit reached", { status: 502 });
    }

    const assetPath = assetUrl.pathname.toLowerCase();
    const contentType = assetPath.endsWith(".vtt")
      ? "text/vtt; charset=utf-8"
      : assetPath.endsWith(".mpd")
        ? "application/dash+xml"
        : upstream.headers.get("content-type") || "application/octet-stream";
    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": contentType,
    });
    for (const name of ["content-range", "accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response("DASH upstream unavailable", { status: 502 });
  }
}
