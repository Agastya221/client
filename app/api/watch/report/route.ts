import { NextResponse } from "next/server";
import { recordLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * POST /api/watch/report
 *
 * Reports a broken or stale stream for a specific anime episode.
 * Proxies to the Flask backend's /api/watch/report endpoint which:
 *   1. Marks matching EpisodeStream records as isStale = true
 *   2. Sets SeedingState for the anime to PENDING with priority=100
 *
 * Body: { anilistId: number, episodeNumber?: number, dubbed?: boolean }
 *
 * Returns: { success: true, message: string, markedStale: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { anilistId, episodeNumber, dubbed } = body as {
      anilistId?: number;
      episodeNumber?: number;
      dubbed?: boolean;
    };

    if (!anilistId) {
      return NextResponse.json({ error: "anilistId is required" }, { status: 400 });
    }

    const backendUrl = process.env.ANIME_API_BASE_URL || "http://localhost:5000";

    const resp = await fetch(`${backendUrl}/api/watch/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anilistId,
        episodeNumber: episodeNumber ?? null,
        dubbed: dubbed ?? false,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Backend request failed" }));
      recordLog("warn", "watch.report.backend_error", { anilistId, episodeNumber }, errorData.error);
      return NextResponse.json(
        { error: errorData.error || "Failed to report stream" },
        { status: resp.status }
      );
    }

    const data = await resp.json();

    recordLog("info", "watch.report.success", {
      anilistId,
      episodeNumber,
      dubbed,
      markedStale: data.markedStale,
    });

    return NextResponse.json({
      success: true,
      anilistId,
      episodeNumber,
      markedStale: data.markedStale ?? 0,
      message: data.message ?? "Stream reported — will refresh in background shortly",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    recordLog("error", "watch.report.error", {}, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
