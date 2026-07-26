import { NextResponse } from "next/server";
import { cacheInvalidatePrefix, cacheStorePersistent } from "@/lib/cache";
import {
  affectsPlaybackCache,
  isWatchReportIssue,
  type WatchReportIssue,
} from "@/lib/anime/watch-report";
import { recordLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * POST /api/watch/report
 *
 * Accepts playback and metadata reports without depending on the retired
 * Python/Railway backend. Reports are retained in the existing memory + KV
 * storage layer and playback-related reports invalidate the affected source
 * caches immediately.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      animeId,
      anilistId,
      animeTitle,
      episodeNumber,
      dubbed,
      provider,
      serverId,
      issues,
      notes,
      pageUrl,
    } = body as {
      animeId?: string;
      anilistId?: number;
      animeTitle?: string;
      episodeNumber?: number;
      dubbed?: boolean;
      provider?: string;
      serverId?: string | null;
      issues?: unknown[];
      notes?: string;
      pageUrl?: string;
    };

    const normalizedAnimeId = String(animeId || "").trim().slice(0, 240);
    const normalizedEpisode = Number(episodeNumber);
    const normalizedIssues = Array.isArray(issues)
      ? Array.from(new Set(issues.filter(isWatchReportIssue)))
      : [];
    const normalizedNotes = String(notes || "").trim().slice(0, 500);

    if (!normalizedAnimeId) {
      return NextResponse.json({ error: "Anime information is missing." }, { status: 400 });
    }
    if (!Number.isInteger(normalizedEpisode) || normalizedEpisode <= 0) {
      return NextResponse.json({ error: "A valid episode number is required." }, { status: 400 });
    }
    if (normalizedIssues.length === 0) {
      return NextResponse.json({ error: "Choose at least one issue." }, { status: 400 });
    }

    const createdAt = new Date().toISOString();
    const reportId = crypto.randomUUID();
    const report = {
      id: reportId,
      createdAt,
      animeId: normalizedAnimeId,
      anilistId: Number.isInteger(Number(anilistId)) && Number(anilistId) > 0
        ? Number(anilistId)
        : null,
      animeTitle: String(animeTitle || "").trim().slice(0, 240),
      episodeNumber: normalizedEpisode,
      dubbed: Boolean(dubbed),
      provider: String(provider || "").trim().slice(0, 80),
      serverId: String(serverId || "").trim().slice(0, 160) || null,
      issues: normalizedIssues as WatchReportIssue[],
      notes: normalizedNotes,
      pageUrl: String(pageUrl || request.headers.get("referer") || "").slice(0, 500),
      userAgent: String(request.headers.get("user-agent") || "").slice(0, 300),
    };

    const retentionMs = 90 * 24 * 60 * 60 * 1000;
    await cacheStorePersistent(`watch-report:${Date.now()}:${reportId}`, report, {
      freshMs: retentionMs,
      staleMs: retentionMs,
      expireMs: retentionMs,
    });

    const playbackCacheInvalidated = affectsPlaybackCache(normalizedIssues as WatchReportIssue[]);
    if (playbackCacheInvalidated) {
      cacheInvalidatePrefix(`watch-session:${normalizedAnimeId}`, { persistent: false });
      cacheInvalidatePrefix(`stream:${normalizedAnimeId}`, { persistent: false });
    }

    recordLog("info", "watch.report.success", {
      reportId,
      animeId: normalizedAnimeId,
      anilistId: report.anilistId,
      episodeNumber: normalizedEpisode,
      dubbed: Boolean(dubbed),
      provider: report.provider,
      issues: normalizedIssues.join(","),
      cacheInvalidated: playbackCacheInvalidated,
    });

    return NextResponse.json({
      success: true,
      reportId,
      cacheInvalidated: playbackCacheInvalidated,
      message: "Report received. Thank you for helping us improve playback.",
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    recordLog("error", "watch.report.error", {}, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
