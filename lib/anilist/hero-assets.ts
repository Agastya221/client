import "server-only";

import { cacheFetch } from "@/lib/cache";
import { CUSTOM_TITLE_LOGOS, CUSTOM_TVDB_MAPPINGS } from "@/lib/custom-logos";
import {
  type FanartLogoSelection,
  type FanartPayload,
  NO_FANART_LOGOS,
  selectFanartLogos,
} from "@/lib/anilist/logo-selection";

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

interface RelationEdge {
  relationType?: string;
  node?: { id?: number };
}

interface KitsuResourceIdentifier {
  id?: string;
  type?: string;
}

interface KitsuRelationshipEntry {
  attributes?: { role?: string };
  relationships?: {
    destination?: { data?: KitsuResourceIdentifier };
  };
}

interface KitsuMappingEntry {
  attributes?: {
    externalSite?: string;
    externalId?: string;
  };
  relationships?: {
    item?: { data?: KitsuResourceIdentifier };
  };
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

function tvdbIdFrom(payload: AniZipPayload, anilistId: number): number | null {
  const id = Number(payload.mappings?.thetvdb_id);
  if (Number.isInteger(id) && id > 0) return id;
  return CUSTOM_TVDB_MAPPINGS[anilistId] || null;
}

async function fetchFanartLogo(tvdbId: number): Promise<FanartLogoSelection> {
  const apiKey = process.env.FANART_TV_API_KEY?.trim();
  if (!apiKey || tvdbId <= 0) return NO_FANART_LOGOS;

  const response = await fetch(`https://webservice.fanart.tv/v3.2/tv/${tvdbId}`, {
    headers: {
      Accept: "application/json",
      "api-key": apiKey,
      "User-Agent": "Yorumi/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) return NO_FANART_LOGOS;

  return selectFanartLogos((await response.json()) as FanartPayload);
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
  // Fanart is queried even when AniZip already has a logo: AniZip images carry
  // no language tag, so Fanart is the only language-aware source. When the
  // Fanart API key is unset this resolves without a network round trip.
  const fanartLogos = fetchPreferredFanartLogo
    ? await fetchFanartLogo(tvdbId || 0).catch(() => NO_FANART_LOGOS)
    : NO_FANART_LOGOS;

  return {
    // Order: an explicitly English Fanart logo, then the AniZip clearlogo
    // (language unknown), then the best-ranked Fanart logo of any language.
    logo: fanartLogos.english?.url || anizipLogo || fanartLogos.best?.url || null,
    backdrop: httpsImage(payload.images, "fanart"),
  };
}

const KITSU_HEADERS = {
  Accept: "application/vnd.api+json",
  "User-Agent": "Yorumi/1.0",
};

async function fetchKitsuPrequelId(anilistId: number): Promise<number | null> {
  try {
    const mappingUrl = new URL("https://kitsu.io/api/edge/mappings");
    mappingUrl.searchParams.set("filter[externalSite]", "anilist/anime");
    mappingUrl.searchParams.set("filter[externalId]", String(anilistId));
    mappingUrl.searchParams.set("include", "item");
    const mappingResponse = await fetch(mappingUrl, {
      headers: KITSU_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!mappingResponse.ok) return null;
    const mappingPayload = (await mappingResponse.json()) as { data?: KitsuMappingEntry[] };
    const kitsuId = mappingPayload.data?.find(
      (entry) => entry.relationships?.item?.data?.type === "anime",
    )?.relationships?.item?.data?.id;
    if (!kitsuId) return null;

    const relationshipsResponse = await fetch(
      `https://kitsu.io/api/edge/anime/${kitsuId}/media-relationships?include=destination`,
      {
        headers: KITSU_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!relationshipsResponse.ok) return null;
    const relationshipsPayload = (await relationshipsResponse.json()) as {
      data?: KitsuRelationshipEntry[];
    };
    const destination = relationshipsPayload.data?.find(
      (entry) =>
        entry.attributes?.role?.toLowerCase() === "prequel" &&
        entry.relationships?.destination?.data?.type === "anime",
    )?.relationships?.destination?.data;
    if (!destination?.id) return null;

    const destinationMappingsResponse = await fetch(
      `https://kitsu.io/api/edge/anime/${destination.id}/mappings`,
      {
        headers: KITSU_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!destinationMappingsResponse.ok) return null;
    const destinationMappings = (await destinationMappingsResponse.json()) as {
      data?: KitsuMappingEntry[];
    };
    const externalId = destinationMappings.data?.find(
      (entry) => entry.attributes?.externalSite?.toLowerCase() === "anilist/anime",
    )?.attributes?.externalId;
    const id = Number(externalId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
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
    if (response.ok) {
      const payload = (await response.json()) as {
        data?: { Media?: { relations?: { edges?: RelationEdge[] } } };
      };
      const relation = payload.data?.Media?.relations?.edges?.find(
        (edge) => edge.relationType === "PREQUEL" || edge.relationType === "PARENT",
      );
      const id = Number(relation?.node?.id);
      if (Number.isInteger(id) && id > 0) return id;
    }
  } catch {
    // AniList is the primary relation source. Kitsu below is only used while
    // AniList is unavailable or has no usable parent relation.
  }

  return fetchKitsuPrequelId(anilistId);
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
  if (!assets.logo && !assets.backdrop) return false;
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
    `anizip:hero-assets:v6:${artworkTier}:${anilistId}`,
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
    logo: customLogo || cached.logo,
    backdrop: cached.backdrop,
  };
}
