export const dynamic = "force-dynamic";

const flixImageSegmentXorKey = Uint8Array.from([
  157, 42, 241, 71, 179, 142, 92, 112,
  166, 25, 228, 59, 216, 98, 15, 197,
]);

function decryptFlixManifest(body: string, playlistKey: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("#EXTM3U")) return trimmed;
  const key = Buffer.from(playlistKey, "base64");
  const payload = Buffer.from(trimmed, "base64");
  if (!key.length || !payload.length) throw new Error("Invalid FlixCloud playlist encoding");
  const decoded = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) decoded[i] = payload[i] ^ key[i % key.length];
  const text = decoded.toString("utf8").trim();
  if (!text.startsWith("#EXTM3U")) throw new Error("FlixCloud manifest decrypt failed");
  return text;
}

function unwrapFlixImageSegment(body: Buffer): Buffer | null {
  const isWebp = body.length > 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
  const isPng = body.length > 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const offset = isWebp ? 12 : isPng ? 8 : 0;
  if (!offset) return null;
  const output = Buffer.from(body.subarray(offset));
  if (output[0] !== 0x47) {
    for (let i = 0; i < output.length; i++) output[i] ^= flixImageSegmentXorKey[i % flixImageSegmentXorKey.length];
  }
  return output;
}

function srtToVtt(input: string): string {
  const body = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const referer = searchParams.get("referer");
  const playlistKey = searchParams.get("playlist_key");
  const unwrapImageSegment = searchParams.get("unwrap") === "flix-segment";
  const serveAsTs = searchParams.get("as_ts") === "1";
  const isVideo = searchParams.get("type") === "video";

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== "https:" && parsedTarget.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }

  // Wide-open CORS headers for player integration
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
  };

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": isVideo ? "video/mp4,video/*,*/*;q=0.8" : "*/*",
      "Accept-Language": "en-US,en;q=0.9",
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
    if (range && !unwrapImageSegment) headers["Range"] = range;

    let response = await fetch(targetUrl, { headers, cache: "no-store" });
    if (response.status >= 500 && response.status <= 504) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      response = await fetch(targetUrl, { headers, cache: "no-store" });
    }

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

    const isSrtSubtitle = !isVideo && parsedTarget.pathname.toLowerCase().endsWith(".srt");
    if (isSrtSubtitle) {
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Content-Type", "text/vtt; charset=utf-8");
      responseHeaders.set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      return new Response(srtToVtt(await response.text()), {
        status: 200,
        headers: responseHeaders,
      });
    }

    if (!isM3U8) {
      if (unwrapImageSegment) {
        const unwrapped = unwrapFlixImageSegment(Buffer.from(await response.arrayBuffer()));
        if (!unwrapped) return new Response("Invalid FlixCloud segment", { status: 502, headers: corsHeaders });
        const segmentHeaders = new Headers(corsHeaders);
        segmentHeaders.set("Content-Type", "video/mp2t");
        segmentHeaders.set("Content-Length", String(unwrapped.length));
        segmentHeaders.set("Cache-Control", "no-store");
        segmentHeaders.set("X-Content-Type-Options", "nosniff");
        return new Response(new Uint8Array(unwrapped), { status: 200, headers: segmentHeaders });
      }
      // Directly stream video segments/subtitles/keys
      const responseHeaders = new Headers(corsHeaders);
      if (serveAsTs) responseHeaders.set("Content-Type", "video/mp2t");
      else if (contentType) responseHeaders.set("Content-Type", contentType);
      const assetPath = parsedTarget.pathname.toLowerCase();
      const isCacheableSegment = /\.(ts|m4s|aac|key|vtt|srt)$/.test(assetPath);
      responseHeaders.set(
        "Cache-Control",
        isCacheableSegment && !range
          ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      );
      responseHeaders.set("Vary", "Range");
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      for (const header of ["accept-ranges", "content-length", "content-range", "content-disposition"]) {
        const value = response.headers.get(header);
        if (value) responseHeaders.set(header, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // Rewrite HLS playlist URLs to go through the proxy
    let playlistText = await response.text();
    if (!playlistText.trim().startsWith("#EXTM3U")) {
      if (!playlistKey) return new Response("Unsupported playlist encoding", { status: 502, headers: corsHeaders });
      try {
        playlistText = decryptFlixManifest(playlistText, playlistKey);
      } catch {
        return new Response("FlixCloud playlist decrypt failed", { status: 502, headers: corsHeaders });
      }
    }
    const targetBaseUrl = parsedTarget;
    const hasAesKey = /^#EXT-X-KEY:.*METHOD=(?!NONE)/m.test(playlistText);

    const rewriteUrl = (urlStr: string, segmentLine = false) => {
      if (urlStr.startsWith("data:") || urlStr.startsWith("skd:")) {
        return urlStr;
      }
      try {
        const resolved = new URL(urlStr, targetBaseUrl).toString();
        const proxied = new URL("/api/proxy/m3u8-streaming-proxy", request.url);
        proxied.searchParams.set("url", resolved);
        if (referer) proxied.searchParams.set("referer", referer);
        if (playlistKey) proxied.searchParams.set("playlist_key", playlistKey);
        // If the URL ends with a typical segment extension, mark it as type=video to skip parsing
        const assetPath = new URL(resolved).pathname;
        const isFlixImageSegment = Boolean(playlistKey && segmentLine && /\.(png|webp)$/i.test(assetPath));
        if (/\.(ts|mp4|m4s|key)$/i.test(assetPath) || isFlixImageSegment) {
          proxied.searchParams.set("type", "video");
        }
        if (isFlixImageSegment) {
          proxied.searchParams.set("as_ts", "1");
          if (!hasAesKey) proxied.searchParams.set("unwrap", "flix-segment");
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
      return rewriteUrl(trimmed, true);
    });

    const rewrittenText = rewrittenLines.join("\n");
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
    responseHeaders.set("Cache-Control", "public, max-age=15, s-maxage=60, stale-while-revalidate=300");
    responseHeaders.set("X-Content-Type-Options", "nosniff");

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
