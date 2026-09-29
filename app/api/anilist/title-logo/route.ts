import { getAnilistHeroAssets } from "@/lib/anilist/hero-assets";
import { NextRequest, NextResponse } from "next/server";

// Must stay dynamic: the response is keyed on the `id` search param, and Next's
// route-handler cache key is the resolved *pathname* only (search params are not
// part of it). `force-static` would additionally force `searchParams` to return
// empty values, so this route cannot be prerendered or ISR-cached. Browser/CDN
// freshness is therefore expressed purely through the Cache-Control header below,
// which Next does not overwrite for non-ISR route handlers.
export const dynamic = "force-dynamic";

// The underlying data is KV-cached for 7 days and effectively immutable, so let the
// browser reuse its own copy for a day (max-age) while the CDN keeps it for a week
// (s-maxage) and may serve stale for a further 30 days while revalidating.
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

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
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
