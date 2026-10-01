import { searchAnilist } from "@/lib/anilist/api";
import { getCatalogAvailabilityForMedia } from "@/lib/anilist/availability";
import { NextRequest } from "next/server";
import { runAfterResponse } from "@/lib/cache";
import { readStoredStream, SEARCH_RESULT_SECONDS, searchStoreKey, writeStoredValue } from "@/lib/stream-store";

const RESPONSE_HEADERS = { "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" };

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
  // The navbar's dropdown shows five results and never reads the availability hints, so it asks
  // for a small page and skips the extra provider lookups (the slow part of a cold search).
  const suggest = searchParams.get("suggest") === "1";

  const sort =
    sortParam === "trending" ? ["TRENDING_DESC"] :
    sortParam === "season" ? ["POPULARITY_DESC"] :
    sortParam === "score" ? ["SCORE_DESC"] :
    sortParam === "newest" ? ["START_DATE_DESC"] :
    sortParam === "title" ? ["TITLE_ROMAJI"] :
    search ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"];

  const current = sortParam === "season" && !season && !seasonYear ? getCurrentSeasonAndYear() : undefined;

  // Shared answer from Redis first: a search someone already made never reaches AniList again.
  const storeKey = searchStoreKey({ q: search, genre, page, sort: sortParam, format, status, season, year: seasonYear, language: countryOfOrigin, suggest });
  const stored = await readStoredStream<{ media: unknown[] }>(storeKey);
  if (stored && Array.isArray(stored.result.media) && stored.result.media.length > 0) {
    return Response.json(stored.result, { headers: { ...RESPONSE_HEADERS, "x-search-cache": "HIT" } });
  }

  try {
    const result = await searchAnilist({
      search,
      genre,
      page,
      perPage: suggest ? 6 : 24,
      sort,
      status,
      format,
      season: season || current?.season,
      seasonYear: seasonYear || current?.seasonYear,
      countryOfOrigin,
    });

    let availabilityHints: Record<number, unknown> = {};
    try {
      availabilityHints = !suggest && result.media.length > 0
        ? await getCatalogAvailabilityForMedia(result.media)
        : {};
    } catch {
      // Non-critical — proceed without hints
    }

    const body = { media: result.media, pageInfo: result.pageInfo, availabilityHints };
    // Only real answers are shared; an empty one is usually a rate-limited or failed lookup.
    if (result.media.length > 0) runAfterResponse(writeStoredValue(storeKey, body, SEARCH_RESULT_SECONDS));
    // Catalogue data, the same for everyone: the browser may reuse it for a while, so typing
    // the same thing again is instant, and show an older answer while fetching a fresh one.
    return Response.json(body, { headers: RESPONSE_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
