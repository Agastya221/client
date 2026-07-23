import "server-only";

import { cacheFetch } from "@/lib/cache";
import { CUSTOM_TITLE_LOGOS } from "@/lib/custom-logos";

interface AniZipImage {
  coverType?: string;
  url?: string;
}

interface AniZipPayload {
  images?: AniZipImage[];
}

interface RelationEdge {
  relationType?: string;
  node?: { id?: number };
}

export interface AnilistHeroAssets {
  logo: string | null;
  backdrop: string | null;
}

const EMPTY_ASSETS: AnilistHeroAssets = {
  logo: null,
  backdrop: null,
};

function httpsImage(images: AniZipImage[] | undefined, coverType: string): string | null {
  const candidate = images?.find(
    (image) => image.coverType?.trim().toLowerCase() === coverType,
  )?.url;
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchDirectAssets(anilistId: number): Promise<AnilistHeroAssets> {
  const response = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Tatakai/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return EMPTY_ASSETS;

  const payload = (await response.json()) as AniZipPayload;
  return {
    logo: httpsImage(payload.images, "clearlogo"),
    backdrop: httpsImage(payload.images, "fanart"),
  };
}

async function fetchPrequelId(anilistId: number): Promise<number | null> {
  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query { Media(id: ${anilistId}) { relations { edges { relationType node { id } } } } }`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      data?: { Media?: { relations?: { edges?: RelationEdge[] } } };
    };
    const relation = payload.data?.Media?.relations?.edges?.find(
      (edge) => edge.relationType === "PREQUEL" || edge.relationType === "PARENT",
    );
    const id = Number(relation?.node?.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function fillMissing(
  preferred: AnilistHeroAssets,
  fallback: AnilistHeroAssets,
): AnilistHeroAssets {
  return {
    logo: preferred.logo || fallback.logo,
    backdrop: preferred.backdrop || fallback.backdrop,
  };
}

function isCacheable(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const assets = value as AnilistHeroAssets;
  return [assets.logo, assets.backdrop].every(
    (url) => url === null || (typeof url === "string" && url.startsWith("https://")),
  );
}

/**
 * Provides a transparent logo and a full-height fanart backdrop without using
 * a paid TVDB API call. The public artwork URLs come from AniZip mappings and
 * are stored in the existing memory + KV cache.
 */
export async function getAnilistHeroAssets(anilistId: number): Promise<AnilistHeroAssets> {
  const cached = await cacheFetch(
    `anizip:hero-assets:v1:${anilistId}`,
    async () => {
      let assets = await fetchDirectAssets(anilistId).catch(() => EMPTY_ASSETS);
      let relationId = anilistId;

      for (let depth = 0; depth < 2 && (!assets.logo || !assets.backdrop); depth += 1) {
        const prequelId = await fetchPrequelId(relationId);
        if (!prequelId) break;
        relationId = prequelId;
        const fallback = await fetchDirectAssets(prequelId).catch(() => EMPTY_ASSETS);
        assets = fillMissing(assets, fallback);
      }

      return assets;
    },
    {
      freshMs: 7 * 24 * 60 * 60 * 1000,
      staleMs: 30 * 24 * 60 * 60 * 1000,
      expireMs: 60 * 24 * 60 * 60 * 1000,
      shouldCache: isCacheable,
    },
  );

  return {
    logo: CUSTOM_TITLE_LOGOS[anilistId] || cached.logo,
    backdrop: cached.backdrop,
  };
}
