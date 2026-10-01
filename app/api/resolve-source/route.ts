import { activeStreamStorageName } from "@/lib/stream-store";
import { NextRequest, NextResponse } from "next/server";
import { resolveStreamSource } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { measureAsync, recordLog } from "@/lib/observability";

/**
 * POST /api/resolve-source
 * 
 * Called by WatchExperience on the client after the page renders.
 * Resolves the actual stream URL (the slow part), while the page
 * shell was already rendered instantly from cached detail data.
 * 
 * Body: {
 *   animeId: string,
 *   episodeNumber?: number,
 *   provider?: string,
 *   episodeId?: string,
 *   dubbed?: boolean,
 *   server?: string,
 *   refresh?: boolean   // discard the stored link for this episode and resolve a new one
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      animeId,
      episodeNumber,
      provider,
      episodeId,
      dubbed,
      server,
      refresh,
    } = body || {};

    if (!animeId || typeof animeId !== "string") {
      return NextResponse.json({ error: "animeId is required" }, { status: 400 });
    }

    recordLog("info", "anime.resolve_source.request", {
      animeId,
      episodeNumber: episodeNumber || "auto",
      provider: normalizeProviderParam(provider || "") || "auto",
      dubbed: dubbed ? "dub" : "sub",
      server: server || "auto",
    });

    const result = await measureAsync(
      "route.resolve_source",
      {
        route: "/api/resolve-source",
        provider: normalizeProviderParam(provider || "") || "auto",
      },
      async () =>
        resolveStreamSource({
          animeId,
          episodeNumber: episodeNumber ? Number(episodeNumber) : undefined,
          provider: normalizeProviderParam(provider || ""),
          episodeId: episodeId || null,
          dubbed: Boolean(dubbed),
          server: server || null,
          // The player hit an error or the viewer pressed "Refresh source": drop the stored link.
          refresh: refresh === true,
        }),
    );

    recordLog("info", "anime.resolve_source.response", {
      animeId,
      episodeNumber: episodeNumber || "auto",
      requestedProvider: normalizeProviderParam(provider || "") || "auto",
      provider: result.provider,
      activeServerId: result.activeServerId || "none",
      sourceKind: result.source?.kind || "none",
      isM3U8: Boolean(result.source?.isM3U8),
      hasProxy: Boolean(result.source?.proxiedUrl),
      subtitleCount: result.subtitles.length,
      serverCount: result.serverOptions.length,
      watchAttempts: result.watchAttempts.map((attempt) => `${attempt.provider}:${attempt.ok ? "ok" : "fail"}:${attempt.reason}`).join(" | ").slice(0, 180),
    });

    return NextResponse.json(result, { headers: { "x-link-store": activeStreamStorageName() } });
  } catch (error) {
    recordLog(
      "error",
      "route.resolve_source.failed",
      { route: "/api/resolve-source" },
      error instanceof Error ? error.message : "Failed to resolve stream source",
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve stream source" },
      { status: 500 },
    );
  }
}
