import { NextRequest, NextResponse } from "next/server";
import { cacheInvalidatePrefix, cacheStats } from "@/lib/cache";

/**
 * GET /api/cache/stats — view cache status (dev only)
 */
export async function GET() {
  return NextResponse.json(cacheStats());
}

/**
 * POST /api/cache/invalidate — clear cache for a specific anime
 * Body: { "animeId": "animekai~one-piece-100" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const animeId = body?.animeId;
    if (!animeId || typeof animeId !== "string") {
      return NextResponse.json({ error: "animeId required" }, { status: 400 });
    }

    cacheInvalidatePrefix(`detail-model:${animeId}`);
    cacheInvalidatePrefix(`watch-session:${animeId}`);
    cacheInvalidatePrefix(`stream:${animeId}`);
    return NextResponse.json({ ok: true, invalidated: animeId });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
