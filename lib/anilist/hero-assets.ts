import "server-only";

import { cacheFetch } from "@/lib/cache";
import { CUSTOM_TITLE_LOGOS, CUSTOM_TVDB_MAPPINGS } from "@/lib/custom-logos";

interface AniZipImage {
  coverType?: string;
  url?: string;
}

interface AniZipPayload {
  images?: AniZipImage[];
  mappings?: {
    thetvdb_id?: number | string | null;
  };
}

interface FanartImage {
  url?: string;
  lang?: string;
  likes?: string;
}

interface FanartPayload {
  hdtvlogo?: FanartImage[];
  clearlogo?: FanartImage[];
}

interface SelectedFanartLogo {
  url: string;
  language: string;
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

const PREFERRED_LOGO_LANGUAGES = ["en", "ja", "ko", "00", ""] as const;

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

function safeHttpsUrl(candidate: string | undefined): string | null {
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function selectFanartLogo(payload: FanartPayload): SelectedFanartLogo | null {
  const candidates = [...(payload.hdtvlogo || []), ...(payload.clearlogo || [])]
    .map((image) => ({
      ...image,
      url: safeHttpsUrl(image.url),
      language: (image.lang || "").toLowerCase(),
      likes: Number.parseInt(image.likes || "0", 10) || 0,
    }))
    .filter((image): image is typeof image & { url: string } => Boolean(image.url));

  candidates.sort((left, right) => {
    const leftLanguage = PREFERRED_LOGO_LANGUAGES.indexOf(
      left.language as (typeof PREFERRED_LOGO_LANGUAGES)[number],
    );
    const rightLanguage = PREFERRED_LOGO_LANGUAGES.indexOf(
      right.language as (typeof PREFERRED_LOGO_LANGUAGES)[number],
    );
    const leftRank = leftLanguage === -1 ? PREFERRED_LOGO_LANGUAGES.length : leftLanguage;
    const rightRank = rightLanguage === -1 ? PREFERRED_LOGO_LANGUAGES.length : rightLanguage;
    return leftRank - rightRank || right.likes - left.likes;
  });

  const selected = candidates[0];
  return selected ? { url: selected.url, language: selected.language } : null;
}

function tvdbIdFrom(payload: AniZipPayload, anilistId: number): number | null {
  const id = Number(payload.mappings?.thetvdb_id);
  if (Number.isInteger(id) && id > 0) return id;
  return CUSTOM_TVDB_MAPPINGS[anilistId] || null;
}

async function fetchFanartLogo(tvdbId: number): Promise<SelectedFanartLogo | null> {
  const apiKey = process.env.FANART_TV_API_KEY?.trim();
  if (!apiKey || tvdbId <= 0) return null;

  const response = await fetch(`https://webservice.fanart.tv/v3.2/tv/${tvdbId}`, {
    headers: {
      Accept: "application/json",
      "api-key": apiKey,
      "User-Agent": "Yorumi/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) return null;

  return selectFanartLogo((await response.json()) as FanartPayload);
}

async function fetchDirectAssets(
  anilistId: number,
  fetchPreferredFanartLogo: boolean,
): Promise<AnilistHeroAssets> {
  const response = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Yorumi/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return EMPTY_ASSETS;

  const payload = (await response.json()) as AniZipPayload;
  const anizipLogo = httpsImage(payload.images, "clearlogo");
  const tvdbId = tvdbIdFrom(payload, anilistId);
  const fanartLogo = !anizipLogo && fetchPreferredFanartLogo
    ? await fetchFanartLogo(tvdbId || 0).catch(() => null)
    : null;

  return {
    // AniZip stays authoritative. Within the Fanart fallback, English artwork
    // is selected ahead of Japanese/native alternatives when available.
    logo: anizipLogo || fanartLogo?.url || null,
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
 * a paid TVDB API call. AniZip remains the primary source, Fanart.tv fills
 * missing logos, and results are stored in the existing memory + KV cache.
 */
export async function getAnilistHeroAssets(anilistId: number): Promise<AnilistHeroAssets> {
  const customLogo = CUSTOM_TITLE_LOGOS[anilistId] || null;
  const artworkTier = process.env.FANART_TV_API_KEY?.trim() ? "fanart" : "base";
  const cached = await cacheFetch(
    `anizip:hero-assets:v4:${artworkTier}:${anilistId}`,
    async () => {
      let assets = await fetchDirectAssets(anilistId, true).catch(() => EMPTY_ASSETS);
      let relationId = anilistId;

      for (
        let depth = 0;
        depth < 2 && ((!customLogo && !assets.logo) || !assets.backdrop);
        depth += 1
      ) {
        const prequelId = await fetchPrequelId(relationId);
        if (!prequelId) break;
        relationId = prequelId;
        const fallback = await fetchDirectAssets(prequelId, !assets.logo)
          .catch(() => EMPTY_ASSETS);
        assets = fillMissing(assets, fallback);
      }

      return assets;
    },
    {
      freshMs: 7 * 24 * 60 * 60 * 1000,
      staleMs: 7 * 24 * 60 * 60 * 1000,
      expireMs: 7 * 24 * 60 * 60 * 1000,
      shouldCache: isCacheable,
    },
  );

  return {
    logo: cached.logo || customLogo,
    backdrop: cached.backdrop,
  };
}
