import { searchAnilist } from "@/lib/anilist/api";
import { getCatalogAvailabilityForMedia } from "@/lib/anilist/availability";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

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

  try {
    const result = await searchAnilist({ search, genre, page, perPage: 24, sort });

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
