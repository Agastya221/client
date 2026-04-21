import { NextResponse } from "next/server";
import { getFastWatchSession, warmAnimeWatchWindow } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { measureAsync, recordLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * POST /api/prefetch — warm the backend cache for upcoming episodes.
 * Body: { episodes: [{ animeId, episodeNumber, provider?, dubbed? }] }
 * Called by the frontend silently in the background.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const episodesFromBody = Array.isArray(body?.episodes) ? body.episodes : [];
    const derivedEpisodes =
      body?.animeId && Array.isArray(body?.episodeNumbers)
        ? body.episodeNumbers.map((episodeNumber: number) => ({
            animeId: body.animeId,
            episodeNumber,
            provider: body.provider,
            dubbed: body.dubbed,
          }))
        : [];
    const episodes = [...episodesFromBody, ...derivedEpisodes];

    if (!Array.isArray(episodes) || episodes.length === 0) {
      return NextResponse.json({ warmed: 0 }, { status: 200 });
    }

    if (episodesFromBody.length === 0 && body?.animeId && Array.isArray(body?.episodeNumbers)) {
      const result = await measureAsync(
        "route.prefetch.window",
        {
          route: "/api/prefetch",
          provider: normalizeProviderParam(body.provider || "") || "auto",
        },
        async () =>
          warmAnimeWatchWindow({
            animeId: body.animeId,
            provider: normalizeProviderParam(body.provider || ""),
            episodeNumbers: body.episodeNumbers.slice(0, 6),
            dubbedModes: [Boolean(body.dubbed)],
          }),
      );
      return NextResponse.json({ warmed: result.warmed, total: result.attempted, available: result.available });
    }

    // Limit to 6 max to prevent abuse while still warming a useful local window.
    const toWarm = episodes.slice(0, 6);

    const results = await Promise.allSettled(
      toWarm.map(async (ep: { animeId: string; episodeNumber: number; provider?: string; dubbed?: boolean }) => {
        const timeout = AbortSignal.timeout(15000);
        await Promise.race([
          getFastWatchSession({
            animeId: ep.animeId,
            episodeNumber: Number(ep.episodeNumber || 1),
            provider: normalizeProviderParam(ep.provider || ""),
            dubbed: Boolean(ep.dubbed),
            server: null,
          }),
          new Promise((_, reject) => {
            timeout.addEventListener("abort", () => reject(new Error("prefetch timeout")), { once: true });
          }),
        ]);
        return true;
      })
    );

    const warmed = results.filter((r) => r.status === "fulfilled" && r.value).length;
    return NextResponse.json({ warmed, total: toWarm.length });
  } catch {
    recordLog("warn", "route.prefetch.failed", { route: "/api/prefetch" }, "Best-effort prefetch failed");
    return NextResponse.json({ warmed: 0 }, { status: 200 });
  }
}
