import { NextResponse } from "next/server";
import { getAnilistPopular, getAnilistSeasonal, getAnilistTrending } from "@/lib/anilist/api";
import { warmAnimeKaiCatalog } from "@/lib/anime/api";
import { recordLog } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && key !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [trending, seasonal, popular] = await Promise.all([
      getAnilistTrending(18),
      getAnilistSeasonal(18),
      getAnilistPopular(18),
    ]);

    const catalog = Array.from(
      new Map(
        [...trending, ...seasonal, ...popular].map((media) => [
          media.id,
          {
            anilistId: media.id,
            titles: [
              media.title.english,
              media.title.romaji,
              media.title.native,
              ...(media.synonyms || []),
            ],
          },
        ]),
      ).values(),
    );

    const result = await warmAnimeKaiCatalog(catalog, {
      concurrency: 4,
      skipWarm: true,
    });

    return NextResponse.json({
      success: true,
      processed: result.processed,
      available: result.available,
      mapped: result.mapped,
      unavailable: result.unavailable,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    recordLog(
      "error",
      "anime.catalog_worker.cron_map_failed",
      { route: "/api/cron/map" },
      error instanceof Error ? error.message : "Catalog mapping failed",
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Catalog mapping failed" },
      { status: 500 },
    );
  }
}
