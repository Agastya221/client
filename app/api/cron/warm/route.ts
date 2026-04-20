import { NextResponse } from "next/server";
import { encodeAnilistRouteId, getAnilistTrending } from "@/lib/anilist/api";
import { warmAnimeWatchWindow } from "@/lib/anime/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for warming

// GET /api/cron/warm — Warm cache for trending anime.
// Deploy as a Railway cron job or Vercel cron (every 30 min).
// Protects against abuse with a shared CRON_SECRET env var.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  // Protect endpoint — skip check if no CRON_SECRET is set (dev mode)
  if (cronSecret && key !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get top 10 trending anime from AniList
    const trending = await getAnilistTrending(10);
    const warmed: string[] = [];

    // Warm episode window 1-3 for each trending anime (both sub and dub).
    const warmTasks = trending.map(async (media) => {
      const title = media.title.english || media.title.romaji;
      try {
        const result = await warmAnimeWatchWindow({
          animeId: encodeAnilistRouteId(media.id),
          episodeNumbers: [1, 2, 3],
          dubbedModes: [false, true],
        });
        if (result.available && result.warmed > 0) {
          warmed.push(title);
        }
      } catch {
        // Skip failures silently
      }
    });

    // Run 3 at a time to avoid overwhelming the backend
    for (let i = 0; i < warmTasks.length; i += 3) {
      await Promise.allSettled(warmTasks.slice(i, i + 3));
    }

    return NextResponse.json({
      success: true,
      warmed: warmed.length,
      titles: warmed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Warm failed" },
      { status: 500 }
    );
  }
}
