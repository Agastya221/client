import { getFastWatchSession } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { measureAsync, recordLog } from "@/lib/observability";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseEpisodeNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDubbed(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const animeId = searchParams.get("animeId");

  if (!animeId) {
    return NextResponse.json(
      { message: "animeId is required" },
      { status: 400 },
    );
  }

  try {
    const session = await measureAsync(
      "route.watch_session",
      {
        route: "/api/watch-session",
        provider: normalizeProviderParam(searchParams.get("provider")) || "auto",
      },
      async () =>
        getFastWatchSession({
          animeId,
          episodeNumber: parseEpisodeNumber(searchParams.get("episodeNumber")),
          provider: normalizeProviderParam(searchParams.get("provider")),
          episodeId: searchParams.get("episodeId"),
          dubbed: parseDubbed(searchParams.get("dub")),
          server: searchParams.get("server"),
        }),
    );

    return NextResponse.json(session, {
      headers: {
        // SWR: serve from browser cache for 60s, revalidate in background for 5 min
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    recordLog(
      "warn",
      "route.watch_session.failed",
      { route: "/api/watch-session" },
      error instanceof Error ? error.message : "Unable to resolve watch session",
    );
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to resolve watch session",
      },
      { status: 500 },
    );
  }
}
