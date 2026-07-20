import { cacheFetch } from "@/lib/cache";
import { CUSTOM_TITLE_LOGOS } from "@/lib/custom-logos";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface AniZipImage {
  coverType?: string;
  url?: string;
}

interface AniZipPayload {
  images?: AniZipImage[];
}

async function fetchDirectLogo(anilistId: number): Promise<string | null> {
  const response = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Tatakai/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as AniZipPayload;
  const logo = payload.images?.find(
    (image) => image.coverType?.trim().toLowerCase() === "clearlogo",
  )?.url;

  if (!logo) return null;
  try {
    const url = new URL(logo);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchPrequelId(anilistId: number): Promise<number | null> {
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query { Media(id: ${anilistId}) { relations { edges { relationType node { id } } } } }`,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const edges = json.data?.Media?.relations?.edges || [];
    const target = edges.find(
      (e: { relationType: string }) =>
        e.relationType === "PREQUEL" || e.relationType === "PARENT",
    );
    return target?.node?.id ?? null;
  } catch {
    return null;
  }
}

async function getTitleLogo(anilistId: number): Promise<string | null> {
  return cacheFetch(
    `anizip:title-logo:${anilistId}`,
    async () => {
      // 1. Try direct AniZip lookup
      const directLogo = await fetchDirectLogo(anilistId).catch(() => null);
      if (directLogo) return directLogo;

      // 2. Try prequel / parent series fallback for sequels (e.g. Season 2, Season 3)
      const prequelId = await fetchPrequelId(anilistId);
      if (prequelId) {
        const parentLogo = await fetchDirectLogo(prequelId).catch(() => null);
        if (parentLogo) return parentLogo;

        // Try 2nd level prequel (Season 3 -> Season 2 -> Season 1)
        const grandPrequelId = await fetchPrequelId(prequelId);
        if (grandPrequelId) {
          const grandLogo = await fetchDirectLogo(grandPrequelId).catch(() => null);
          if (grandLogo) return grandLogo;
        }
      }

      return null;
    },
    {
      freshMs: 7 * 24 * 60 * 60 * 1000,
      staleMs: 30 * 24 * 60 * 60 * 1000,
      expireMs: 60 * 24 * 60 * 60 * 1000,
      shouldCache: (value) =>
        value === null || (typeof value === "string" && value.startsWith("https://")),
    },
  );
}

export async function GET(request: NextRequest) {
  const anilistId = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    return NextResponse.json({ error: "A valid AniList id is required" }, { status: 400 });
  }

  // Check custom override dictionary first
  if (CUSTOM_TITLE_LOGOS[anilistId]) {
    return NextResponse.json(
      { logo: CUSTOM_TITLE_LOGOS[anilistId] },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  }

  const logo = await getTitleLogo(anilistId).catch(() => null);
  return NextResponse.json(
    { logo },
    {
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000",
      },
    },
  );
}
