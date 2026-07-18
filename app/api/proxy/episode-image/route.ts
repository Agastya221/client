import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set([
  "static.wikia.nocookie.net",
]);

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let source: URL;
  try {
    source = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid image url" }, { status: 400 });
  }

  if (source.protocol !== "https:" || !ALLOWED_HOSTS.has(source.hostname)) {
    return NextResponse.json({ error: "image host is not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(source, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://onepiece.fandom.com/",
        "User-Agent": "Mozilla/5.0 (compatible; AnimePlay/1.0; +https://animeplay.local)",
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "upstream image unavailable" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "image request failed" }, { status: 502 });
  }
}
