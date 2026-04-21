import { NextResponse } from "next/server";
import { getFastWatchSession, warmAnimeWatchWindow } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { measureAsync, recordCounter, recordLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * POST /api/prefetch — warm the backend cache for upcoming episodes.
 * Body: { episodes: [{ animeId, episodeNumber, provider?, dubbed? }] }
 *   or: { animeId, episodeNumbers: [1, 2], provider?, dubbed? }
 * Called by the frontend silently in the background.
 *
 * BUDGET LIMITS:
 * - Max 3 episodes per request (prevents over-fetching)
 * - 10s timeout per episode (prevents hanging)
 * - In-flight deduplication via server-side cache layer
 */

/* ── Simple in-flight guard ─────────────────────────────────
   Prevents the same animeId from having multiple warm requests
   running simultaneously. */
const inflightWarms = new Set<string>();
const MAX_CONCURRENT_WARMS = 3;
const MAX_EPISODES_PER_REQUEST = 3;

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

    // Budget: reject if too many concurrent warms are already in-flight
    if (inflightWarms.size >= MAX_CONCURRENT_WARMS) {
      recordCounter("prefetch.rejected", 1, { reason: "max_concurrent" });
      return NextResponse.json({ warmed: 0, skipped: true, reason: "busy" }, { status: 200 });
    }

    if (episodesFromBody.length === 0 && body?.animeId && Array.isArray(body?.episodeNumbers)) {
      const warmKey = `warm:${body.animeId}`;

      // Deduplicate: skip if this anime is already being warmed
      if (inflightWarms.has(warmKey)) {
        recordCounter("prefetch.deduplicated", 1, { route: "/api/prefetch" });
        return NextResponse.json({ warmed: 0, skipped: true, reason: "in_flight" }, { status: 200 });
      }

      inflightWarms.add(warmKey);
      try {
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
              episodeNumbers: body.episodeNumbers.slice(0, MAX_EPISODES_PER_REQUEST),
              dubbedModes: [Boolean(body.dubbed)],
            }),
        );
        return NextResponse.json({ warmed: result.warmed, total: result.attempted, available: result.available });
      } finally {
        inflightWarms.delete(warmKey);
      }
    }

    // Limit to MAX_EPISODES_PER_REQUEST to prevent abuse while still warming a useful local window.
    const toWarm = episodes.slice(0, MAX_EPISODES_PER_REQUEST);

    const results = await Promise.allSettled(
      toWarm.map(async (ep: { animeId: string; episodeNumber: number; provider?: string; dubbed?: boolean }) => {
        const timeout = AbortSignal.timeout(10_000);
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
