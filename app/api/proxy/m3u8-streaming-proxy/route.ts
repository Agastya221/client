import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const referer = searchParams.get("referer");
  const isVideo = searchParams.get("type") === "video";

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  // Wide-open CORS headers for player integration
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    if (referer) {
      headers["Referer"] = referer;
      try {
        const refUrl = new URL(referer);
        headers["Origin"] = refUrl.origin;
      } catch {
        // Safe to ignore invalid referer for Origin header
      }
    }
    const range = request.headers.get("range");
    if (range) headers["Range"] = range;

    const response = await fetch(targetUrl, {
      headers,
    });

    if (!response.ok) {
      return new Response(`Target returned status ${response.status}`, {
        status: response.status,
        headers: corsHeaders,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    
    // Check if it's an HLS playlist (.m3u8) or a video segment/subtitles
    const isM3U8 = !isVideo && (
      targetUrl.split("?")[0].endsWith(".m3u8") ||
      contentType.includes("mpegurl") ||
      contentType.includes("application/vnd.apple.mpegurl") ||
      contentType.includes("application/x-mpegurl")
    );

    if (!isM3U8) {
      // Directly stream video segments/subtitles/keys
      const responseHeaders = new Headers(corsHeaders);
      if (contentType) responseHeaders.set("Content-Type", contentType);
      for (const header of ["accept-ranges", "content-length", "content-range"]) {
        const value = response.headers.get(header);
        if (value) responseHeaders.set(header, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // Rewrite HLS playlist URLs to go through the proxy
    const playlistText = await response.text();
    const targetBaseUrl = new URL(targetUrl);

    const rewriteUrl = (urlStr: string) => {
      if (urlStr.startsWith("data:") || urlStr.startsWith("skd:")) {
        return urlStr;
      }
      try {
        const resolved = new URL(urlStr, targetBaseUrl).toString();
        const proxied = new URL("/api/proxy/m3u8-streaming-proxy", request.url);
        proxied.searchParams.set("url", resolved);
        if (referer) proxied.searchParams.set("referer", referer);
        // If the URL ends with a typical segment extension, mark it as type=video to skip parsing
        const isSegment = resolved.split("?")[0].match(/\.(ts|mp4|m4s|key)$/i);
        if (isSegment) {
          proxied.searchParams.set("type", "video");
        }
        return proxied.pathname + proxied.search;
      } catch {
        return urlStr;
      }
    };

    const lines = playlistText.split(/\r?\n/);
    const rewrittenLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        // Rewrite URI attributes in tags (e.g. #EXT-X-KEY:METHOD=AES-128,URI="...")
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (match, p1) => {
            return `URI="${rewriteUrl(p1)}"`;
          });
        }
        return line;
      }

      // Rewrite segment or sub-playlist URIs
      return rewriteUrl(trimmed);
    });

    const rewrittenText = rewrittenLines.join("\n");
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set("Content-Type", contentType || "application/vnd.apple.mpegurl");

    return new Response(rewrittenText, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Local HLS proxy error:", error);
    return new Response("Proxy internal error", { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
