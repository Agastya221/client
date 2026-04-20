import { NextRequest, NextResponse } from "next/server";
import { resolveStreamSource } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";

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
 *   server?: string
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
    } = body || {};

    if (!animeId || typeof animeId !== "string") {
      return NextResponse.json({ error: "animeId is required" }, { status: 400 });
    }

    const result = await resolveStreamSource({
      animeId,
      episodeNumber: episodeNumber ? Number(episodeNumber) : undefined,
      provider: normalizeProviderParam(provider || ""),
      episodeId: episodeId || null,
      dubbed: Boolean(dubbed),
      server: server || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[resolve-source] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve stream source" },
      { status: 500 },
    );
  }
}
