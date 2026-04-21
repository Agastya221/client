import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAnilistDetail,
  getAnilistTrending,
  searchAnilist,
  type AnilistMedia,
} from "@/lib/anilist/api";
import { measureAsync, recordLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

function parseAnilistId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseGenres(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function fetchRecommendations(
  anilistId: number | null,
  title: string,
  genres: string[],
): Promise<AnilistMedia[]> {
  if (anilistId) {
    try {
      const detail = await getAnilistDetail(anilistId);
      const recommendations = detail.recommendations.nodes
        .map((entry) => entry.mediaRecommendation)
        .filter(Boolean) as AnilistMedia[];
      if (recommendations.length > 0) return recommendations;
    } catch {
      // Fall through to the next lookup.
    }
  }

  if (title) {
    try {
      const searchResults = await searchAnilist({ search: title, perPage: 1 });
      const matchId = searchResults.media[0]?.id;
      if (matchId) {
        const detail = await getAnilistDetail(matchId);
        const recommendations = detail.recommendations.nodes
          .map((entry) => entry.mediaRecommendation)
          .filter(Boolean) as AnilistMedia[];
        if (recommendations.length > 0) return recommendations;
      }
    } catch {
      // Fall through to the next lookup.
    }
  }

  if (genres.length > 0) {
    try {
      const genreResults = await searchAnilist({ genre: genres[0], perPage: 10 });
      if (genreResults.media.length > 0) return genreResults.media;
    } catch {
      // Fall through to trending.
    }
  }

  try {
    return await getAnilistTrending(10);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = String(searchParams.get("title") || "").trim();
  const genres = parseGenres(searchParams.get("genres"));
  const anilistId = parseAnilistId(searchParams.get("anilistId"));

  try {
    const [authSession, recommendations] = await Promise.all([
      auth().catch(() => null),
      measureAsync(
        "route.watch_page_context",
        {
          route: "/api/watch-page-context",
          hasAnilistId: anilistId ? "true" : "false",
          hasTitle: title ? "true" : "false",
        },
        () => fetchRecommendations(anilistId, title, genres),
      ),
    ]);

    return NextResponse.json({
      currentUserId: authSession?.user?.id ?? null,
      recommendations,
    });
  } catch (error) {
    recordLog(
      "warn",
      "route.watch_page_context.failed",
      { route: "/api/watch-page-context" },
      error instanceof Error ? error.message : "Unable to load watch page context",
    );
    return NextResponse.json(
      {
        currentUserId: null,
        recommendations: [],
      },
    );
  }
}
