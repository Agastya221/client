import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/prefetch — warm the backend cache for upcoming episodes.
 * Body: { episodes: [{ animeId, episodeNumber, provider?, dubbed? }] }
 * Called by the frontend silently in the background.
 */
export async function POST(request: Request) {
  try {
    const { episodes } = await request.json();

    if (!Array.isArray(episodes) || episodes.length === 0) {
      return NextResponse.json({ warmed: 0 }, { status: 200 });
    }

    // Limit to 3 max to prevent abuse
    const toWarm = episodes.slice(0, 3);

    // Fire all prefetches in parallel — don't await individually
    const results = await Promise.allSettled(
      toWarm.map(async (ep: { animeId: string; episodeNumber: number; provider?: string; dubbed?: boolean }) => {
        const params = new URLSearchParams({
          animeId: ep.animeId,
          episodeNumber: String(ep.episodeNumber),
        });
        if (ep.provider) params.set("provider", ep.provider);
        if (ep.dubbed) params.set("dub", "1");

        // Internal fetch to our own watch-session route — this triggers the backend scraping + caching
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
        const res = await fetch(`${baseUrl}/api/watch-session?${params}`, {
          signal: AbortSignal.timeout(15000), // 15s timeout per prefetch
        });
        return res.ok;
      })
    );

    const warmed = results.filter((r) => r.status === "fulfilled" && r.value).length;
    return NextResponse.json({ warmed, total: toWarm.length });
  } catch {
    return NextResponse.json({ warmed: 0 }, { status: 200 });
  }
}
