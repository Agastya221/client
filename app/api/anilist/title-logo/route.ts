import { getAnilistHeroAssets } from "@/lib/anilist/hero-assets";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const anilistId = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    return NextResponse.json({ error: "A valid AniList id is required" }, { status: 400 });
  }

  const assets = await getAnilistHeroAssets(anilistId).catch(() => ({
    logo: null,
    backdrop: null,
  }));

  return NextResponse.json(assets, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}
