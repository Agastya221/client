import { searchAnilist } from "@/lib/anilist/api";
import { getCatalogAvailabilityForMedia } from "@/lib/anilist/availability";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

function getCurrentSeasonAndYear(): { season: "WINTER" | "SPRING" | "SUMMER" | "FALL"; seasonYear: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed (0=Jan, 11=Dec)
  let season: "WINTER" | "SPRING" | "SUMMER" | "FALL";
  if (month >= 0 && month <= 2) season = "WINTER";
  else if (month >= 3 && month <= 5) season = "SPRING";
  else if (month >= 6 && month <= 8) season = "SUMMER";
  else season = "FALL";
  return { season, seasonYear: year };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("q") || undefined;
  const genre = searchParams.get("genre") || undefined;
  const page = Number(searchParams.get("page")) || 1;
  const sortParam = searchParams.get("sort") || "";
  const format = searchParams.get("format") || undefined;
  const status = searchParams.get("status") || undefined;
  const season = searchParams.get("season") || undefined;
  const seasonYear = Number(searchParams.get("year")) || undefined;
  const countryOfOrigin = searchParams.get("language") || undefined;

  const sort =
    sortParam === "trending" ? ["TRENDING_DESC"] :
    sortParam === "season" ? ["POPULARITY_DESC"] :
    sortParam === "score" ? ["SCORE_DESC"] :
    sortParam === "newest" ? ["START_DATE_DESC"] :
    sortParam === "title" ? ["TITLE_ROMAJI"] :
    search ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"];

  const current = sortParam === "season" && !season && !seasonYear ? getCurrentSeasonAndYear() : undefined;

  try {
    const result = await searchAnilist({
      search,
      genre,
      page,
      perPage: 24,
      sort,
      status,
      format,
      season: season || current?.season,
      seasonYear: seasonYear || current?.seasonYear,
      countryOfOrigin,
    });

    let availabilityHints: Record<number, unknown> = {};
    try {
      availabilityHints = result.media.length > 0
        ? await getCatalogAvailabilityForMedia(result.media)
        : {};
    } catch {
      // Non-critical — proceed without hints
    }

    return Response.json({
      media: result.media,
      pageInfo: result.pageInfo,
      availabilityHints,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
