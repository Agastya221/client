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

  const sort =
    sortParam === "trending" ? ["TRENDING_DESC"] :
    sortParam === "season" ? ["POPULARITY_DESC"] :
    search ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"];

  const current = sortParam === "season" ? getCurrentSeasonAndYear() : undefined;

  try {
    const result = await searchAnilist({
      search,
      genre,
      page,
      perPage: 24,
      sort,
      season: current?.season,
      seasonYear: current?.seasonYear,
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
