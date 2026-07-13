import { cacheFetch } from "@/lib/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface AniZipImage {
  coverType?: string;
  url?: string;
}

interface AniZipPayload {
  images?: AniZipImage[];
}

async function getTitleLogo(anilistId: number): Promise<string | null> {
  return cacheFetch(
    `anizip:title-logo:${anilistId}`,
    async () => {
      const response = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Tatakai/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) return null;

      const payload = await response.json() as AniZipPayload;
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
    },
    {
      freshMs: 7 * 24 * 60 * 60 * 1000,
      staleMs: 30 * 24 * 60 * 60 * 1000,
      expireMs: 60 * 24 * 60 * 60 * 1000,
      shouldCache: (value) => value === null || (typeof value === "string" && value.startsWith("https://")),
    },
  );
}

export async function GET(request: NextRequest) {
  const anilistId = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    return NextResponse.json({ error: "A valid AniList id is required" }, { status: 400 });
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
