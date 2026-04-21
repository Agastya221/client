import { cache } from "react";
import { Prisma } from "@prisma/client";
import { cacheFetch, cacheInvalidatePrefix } from "@/lib/cache";
import { measureAsync, recordCounter, recordLog } from "@/lib/observability";
import { anilistTitle, getAnilistDetail } from "@/lib/anilist/api";
import {
  PROVIDERS,
  type AnimeDetailModel,
  type AnimeDetailOverviewModel,
  type AnimeEpisodeListModel,
  type AnimeMetadataRow,
  type AnimeSeasonEntry,
  type CatalogAnime,
  type EpisodeModel,
  type GenresPageModel,
  type HomePageModel,
  type ProviderAttemptStatus,
  type ProviderId,
  type SearchPageModel,
  type ServerOption,
  type StreamSource,
  type SubtitleTrack,
  type WatchAttempt,
  type WatchSessionModel,
} from "./types";
import {
  bestTitleMatch,
  buildProviderOrder,
  buildProxyUrl,
  decodeAnimeId,
  encodeAnimeId,
  ensureArray,
  humanizeProviderId,
  normalizeText,
  numberOrNull,
  parseYear,
  pickFirstNonEmpty,
  uniqueStrings,
} from "./utils";

export const LOCAL_ANIME_API_BASE_URL = "http://localhost:5000";
export const PRODUCTION_ANIME_API_BASE_URL = "https://animekai-api-production-a143.up.railway.app";

export function resolveAnimeApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configuredBaseUrl = String(env.ANIME_API_BASE_URL || env.NEXT_PUBLIC_ANIME_API_BASE_URL || "").trim();
  const runtime = String(env.NODE_ENV || "development").toLowerCase();
  const fallbackBaseUrl =
    runtime === "development" || runtime === "test"
      ? LOCAL_ANIME_API_BASE_URL
      : PRODUCTION_ANIME_API_BASE_URL;

  return (configuredBaseUrl || fallbackBaseUrl).replace(/\/+$/, "");
}

const API_BASE_URL = resolveAnimeApiBaseUrl();
const HOME_REVALIDATE_SECONDS = 300;
const SEARCH_REVALIDATE_SECONDS = 120;
const DETAIL_REVALIDATE_SECONDS = 300;
const PROVIDER_MAPPING_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER_MAPPING_NOT_FOUND_TTL_MS = 12 * 60 * 60 * 1000;
const PROVIDER_MAPPING_UNKNOWN_TTL_MS = 60 * 60 * 1000;
const PROVIDER_SNAPSHOT_FRESH_MS = 6 * 60 * 60 * 1000;

type JsonValue = Record<string, any>;
export type ProviderJson = JsonValue;

type ProviderDetailBundle = {
  provider: ProviderId;
  providerId: string;
  anime: CatalogAnime;
  synopsis: string;
  metadata: AnimeMetadataRow[];
  seasons: AnimeSeasonEntry[];
  episodes: EpisodeModel[];
  related: CatalogAnime[];
  recommended: CatalogAnime[];
};

type ProviderDetailMetaBundle = Omit<ProviderDetailBundle, "episodes">;

type ProviderWatchPayload = {
  source: StreamSource | null;
  subtitles: SubtitleTrack[];
  serverOptions: ServerOption[];
  activeServerId: string | null;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
};

type AnimeDetailModelOptions = {
  resolveProviderFallbacks?: boolean;
  mergeEpisodeProviders?: boolean;
};

type ProviderMappingStatus = "FOUND" | "NOT_FOUND" | "UNKNOWN";

type ProviderDetailLoadResult<TBundle> = {
  bundle: TBundle | null;
  error: string | null;
};

type AnimeProviderAvailabilityRecord = {
  provider: ProviderId;
  status: ProviderMappingStatus;
  providerId: string | null;
  matchedTitle: string | null;
  checkedTitles: string[];
  failureReason: string | null;
  lastCheckedAt: Date | null;
  isAvailable: boolean;
};

export type WatchAvailabilitySummary = {
  provider: ProviderId;
  status: ProviderMappingStatus | "DIRECT";
  isAvailable: boolean;
  providerId: string | null;
  routeId: string | null;
  watchHref: string | null;
  message: string;
  checkedTitles: string[];
};

export type CatalogAvailabilityHint = {
  anilistId: number;
  status: ProviderMappingStatus | "DIRECT";
  isAvailable: boolean;
  routeId: string | null;
  watchHref: string | null;
  message: string;
};

type ProviderMetaSnapshotResult = {
  bundle: ProviderDetailMetaBundle;
  isFresh: boolean;
};

type ProviderEpisodeSnapshotResult = {
  episodes: EpisodeModel[];
  isFresh: boolean;
};

function providerSuccess(provider: ProviderId, message = "Using provider"): ProviderAttemptStatus {
  return { provider, state: "success", message };
}

function providerFailure(provider: ProviderId, message: string, empty = false): ProviderAttemptStatus {
  return { provider, state: empty ? "empty" : "error", message };
}

export function unwrapProviderPayload<T extends JsonValue>(value: T): JsonValue {
  const candidate = value?.data;
  return candidate && typeof candidate === "object" ? candidate : value;
}

function mapGenres(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((entry) => (typeof entry === "string" ? entry : String(entry || ""))));
  }
  if (typeof value === "string") {
    return uniqueStrings(value.split(",").map((entry) => entry.trim()));
  }
  return [];
}

function extractEpisodeCount(value: string | null | undefined): number | null {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeBaseAnime(input: {
  provider: ProviderId;
  providerId: string;
  title: string;
  poster?: string | null;
  banner?: string | null;
  description?: string | null;
  genres?: string[];
  type?: string | null;
  rating?: string | null;
  year?: string | null;
  status?: string | null;
  subCount?: number | null;
  dubCount?: number | null;
  episodeCount?: number | null;
  anilistId?: number | null;
  malId?: number | null;
  providerIds?: Partial<Record<ProviderId, string>>;
}): CatalogAnime {
  const providerIds = {
    ...(input.providerIds || {}),
    [input.provider]: input.providerId,
  };

  return {
    id: encodeAnimeId(input.provider, input.providerId),
    provider: input.provider,
    providerId: input.providerId,
    href: `/anime/${encodeAnimeId(input.provider, input.providerId)}`,
    title: input.title,
    subtitle: null,
    description: input.description || null,
    poster: input.poster || null,
    banner: input.banner || null,
    genres: input.genres || [],
    type: input.type || null,
    rating: input.rating || null,
    year: input.year || null,
    status: input.status || null,
    subCount: input.subCount ?? null,
    dubCount: input.dubCount ?? null,
    episodeCount: input.episodeCount ?? null,
    anilistId: input.anilistId ?? null,
    malId: input.malId ?? null,
    providerIds,
  };
}

function cloneCatalogAnime(anime: CatalogAnime, providerIds: Partial<Record<ProviderId, string>>): CatalogAnime {
  return {
    ...anime,
    providerIds: {
      ...anime.providerIds,
      ...providerIds,
    },
  };
}

function parseAnilistPassthroughId(providerId: string): number | null {
  if (!providerId.startsWith("anilist:")) return null;
  return numberOrNull(providerId.slice("anilist:".length));
}

function isResolvedProviderId(provider: ProviderId, providerId: string | null | undefined): boolean {
  if (!providerId) return false;
  if (provider === "animekai" && providerId.startsWith("anilist:")) return false;
  return true;
}

function collectResolvedProviders(providerIds: Partial<Record<ProviderId, string>>): ProviderId[] {
  return Array.from(
    new Set(
      Object.entries(providerIds)
        .filter((entry): entry is [ProviderId, string] => isResolvedProviderId(entry[0] as ProviderId, entry[1]))
        .map(([provider]) => provider as ProviderId),
    ),
  );
}

function providerMappingFreshMs(status: ProviderMappingStatus): number {
  switch (status) {
    case "FOUND":
      return PROVIDER_MAPPING_FOUND_TTL_MS;
    case "NOT_FOUND":
      return PROVIDER_MAPPING_NOT_FOUND_TTL_MS;
    default:
      return PROVIDER_MAPPING_UNKNOWN_TTL_MS;
  }
}

function coerceProviderMappingStatus(value: unknown): ProviderMappingStatus {
  const status = String(value || "").toUpperCase();
  return status === "FOUND" || status === "NOT_FOUND" || status === "UNKNOWN" ? status : "UNKNOWN";
}

function isProviderMappingFresh(status: ProviderMappingStatus, lastCheckedAt: Date | null): boolean {
  if (!lastCheckedAt) return false;
  return Date.now() - lastCheckedAt.getTime() < providerMappingFreshMs(status);
}

async function getPrismaIfAvailable() {
  if (!process.env.DATABASE_URL) return null;

  try {
    const module = await import("../db");
    return module.prisma;
  } catch {
    return null;
  }
}

function isProviderId(value: string): value is ProviderId {
  return value === "hianime" || PROVIDERS.includes(value as any);
}

function parseProviderIdMap(value: unknown): Partial<Record<ProviderId, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const record = value as Record<string, unknown>;
  const providerIds: Partial<Record<ProviderId, string>> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    if (!isProviderId(key) || typeof rawValue !== "string") continue;
    const normalized = rawValue.trim();
    if (normalized) providerIds[key] = normalized;
  }
  return providerIds;
}

function parseProviderIdList(value: unknown): ProviderId[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry): entry is ProviderId => Boolean(entry) && isProviderId(entry)),
    ),
  );
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parseCatalogAnimeSnapshot(value: unknown): CatalogAnime[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const anime = (entry || {}) as CatalogAnime & { providerIds?: unknown };
    return {
      ...anime,
      providerIds: parseProviderIdMap(anime.providerIds),
    };
  });
}

function parseMetadataRowsSnapshot(value: unknown): AnimeMetadataRow[] {
  return Array.isArray(value) ? (value as AnimeMetadataRow[]) : [];
}

function parseSeasonEntriesSnapshot(value: unknown): AnimeSeasonEntry[] {
  return Array.isArray(value) ? (value as AnimeSeasonEntry[]) : [];
}

function isProviderSnapshotFresh(lastFetchedAt: Date | null | undefined): boolean {
  if (!lastFetchedAt) return false;
  return Date.now() - lastFetchedAt.getTime() < PROVIDER_SNAPSHOT_FRESH_MS;
}

async function resolveProviderSnapshotKeys(provider: ProviderId, providerId: string): Promise<string[]> {
  if (provider !== "animekai" || !providerId.startsWith("anilist:")) {
    return [providerId];
  }

  const resolvedId = await resolveAnimeKaiSlug(providerId).catch(() => null);
  return uniqueStrings([resolvedId, providerId]);
}

async function loadStoredProviderMetaSnapshot(
  provider: ProviderId,
  providerId: string,
): Promise<ProviderMetaSnapshotResult | null> {
  const prisma = await getPrismaIfAvailable();
  if (!prisma) return null;

  const candidateIds = await resolveProviderSnapshotKeys(provider, providerId);

  for (const candidateId of candidateIds) {
    try {
      const record = await prisma.animeProviderSnapshot.findUnique({
        where: {
          provider_providerId: {
            provider,
            providerId: candidateId,
          },
        },
      });

      if (!record) continue;

      const bundle: ProviderDetailMetaBundle = {
        provider,
        providerId: record.providerId,
        anime: normalizeBaseAnime({
          provider,
          providerId: record.providerId,
          title: record.title,
          poster: record.poster,
          banner: record.banner,
          description: record.description,
          genres: record.genres,
          type: record.type,
          rating: record.rating,
          year: record.year,
          status: record.status,
          subCount: record.subCount,
          dubCount: record.dubCount,
          episodeCount: record.episodeCount,
          anilistId: record.anilistId,
          malId: record.malId,
          providerIds: parseProviderIdMap(record.providerIds),
        }),
        synopsis: record.synopsis || record.description || "",
        metadata: parseMetadataRowsSnapshot(record.metadata),
        seasons: parseSeasonEntriesSnapshot(record.seasons),
        related: parseCatalogAnimeSnapshot(record.related),
        recommended: parseCatalogAnimeSnapshot(record.recommended),
      };

      return {
        bundle,
        isFresh: isProviderSnapshotFresh(record.lastFetchedAt),
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function loadStoredProviderEpisodesSnapshot(
  provider: ProviderId,
  providerId: string,
): Promise<ProviderEpisodeSnapshotResult | null> {
  const prisma = await getPrismaIfAvailable();
  if (!prisma) return null;

  const candidateIds = await resolveProviderSnapshotKeys(provider, providerId);

  for (const candidateId of candidateIds) {
    try {
      const rows = await prisma.animeEpisodeSnapshot.findMany({
        where: {
          provider,
          providerId: candidateId,
        },
        orderBy: {
          episodeNumber: "asc",
        },
      });

      if (!rows.length) continue;

      return {
        episodes: rows.map((row) => ({
          number: row.episodeNumber,
          title: row.title,
          image: row.image || null,
          isFiller: row.isFiller,
          isSubbed: row.isSubbed ?? undefined,
          isDubbed: row.isDubbed ?? undefined,
          idByProvider: parseProviderIdMap(row.idByProvider),
          availableProviders: parseProviderIdList(row.availableProviders),
        })),
        isFresh: isProviderSnapshotFresh(rows[0]?.lastFetchedAt),
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function storeProviderMetaSnapshot(bundle: ProviderDetailMetaBundle): Promise<void> {
  const prisma = await getPrismaIfAvailable();
  if (!prisma) return;

  try {
    await prisma.animeProviderSnapshot.upsert({
      where: {
        provider_providerId: {
          provider: bundle.provider,
          providerId: bundle.providerId,
        },
      },
      update: {
        title: bundle.anime.title,
        synopsis: bundle.synopsis || null,
        poster: bundle.anime.poster,
        banner: bundle.anime.banner,
        description: bundle.anime.description,
        genres: bundle.anime.genres,
        type: bundle.anime.type,
        rating: bundle.anime.rating,
        year: bundle.anime.year,
        status: bundle.anime.status,
        subCount: bundle.anime.subCount,
        dubCount: bundle.anime.dubCount,
        episodeCount: bundle.anime.episodeCount,
        anilistId: bundle.anime.anilistId,
        malId: bundle.anime.malId,
        providerIds: toInputJson(parseProviderIdMap(bundle.anime.providerIds)),
        metadata: toInputJson(bundle.metadata),
        seasons: toInputJson(bundle.seasons),
        related: toInputJson(bundle.related),
        recommended: toInputJson(bundle.recommended),
        lastFetchedAt: new Date(),
      },
      create: {
        provider: bundle.provider,
        providerId: bundle.providerId,
        title: bundle.anime.title,
        synopsis: bundle.synopsis || null,
        poster: bundle.anime.poster,
        banner: bundle.anime.banner,
        description: bundle.anime.description,
        genres: bundle.anime.genres,
        type: bundle.anime.type,
        rating: bundle.anime.rating,
        year: bundle.anime.year,
        status: bundle.anime.status,
        subCount: bundle.anime.subCount,
        dubCount: bundle.anime.dubCount,
        episodeCount: bundle.anime.episodeCount,
        anilistId: bundle.anime.anilistId,
        malId: bundle.anime.malId,
        providerIds: toInputJson(parseProviderIdMap(bundle.anime.providerIds)),
        metadata: toInputJson(bundle.metadata),
        seasons: toInputJson(bundle.seasons),
        related: toInputJson(bundle.related),
        recommended: toInputJson(bundle.recommended),
        lastFetchedAt: new Date(),
      },
    });
  } catch {
    // Snapshot persistence is best-effort and should not break the watch flow.
  }
}

async function storeProviderEpisodesSnapshot(
  provider: ProviderId,
  providerId: string,
  episodes: EpisodeModel[],
): Promise<void> {
  const prisma = await getPrismaIfAvailable();
  if (!prisma) return;

  const rows = episodes
    .filter((episode) => Number.isFinite(episode.number) && episode.number > 0)
    .map((episode) => ({
      provider,
      providerId,
      episodeNumber: episode.number,
      title: episode.title,
      image: episode.image || null,
      isFiller: Boolean(episode.isFiller),
      isSubbed: episode.isSubbed ?? null,
      isDubbed: episode.isDubbed ?? null,
      idByProvider: toInputJson(parseProviderIdMap(episode.idByProvider)),
      availableProviders: episode.availableProviders,
      lastFetchedAt: new Date(),
    }));

  try {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.animeEpisodeSnapshot.deleteMany({
        where: {
          provider,
          providerId,
        },
      }),
    ];

    if (rows.length > 0) {
      operations.push(
        prisma.animeEpisodeSnapshot.createMany({
          data: rows,
        }),
      );
    }

    await prisma.$transaction(operations);
  } catch {
    // Best-effort snapshot persistence only.
  }
}

async function loadStoredProviderMapping(
  anilistId: number,
  provider: ProviderId,
): Promise<AnimeProviderAvailabilityRecord | null> {
  const prisma = await getPrismaIfAvailable();
  if (!prisma) return null;

  try {
    const record = await prisma.animeProviderMapping.findUnique({
      where: {
        anilistId_provider: {
          anilistId,
          provider,
        },
      },
    });

    if (!record) return null;

    const status = coerceProviderMappingStatus(record.status);
    const providerId = record.providerId ? String(record.providerId) : null;

    return {
      provider,
      status,
      providerId,
      matchedTitle: record.matchedTitle ? String(record.matchedTitle) : null,
      checkedTitles: uniqueStrings(record.checkedTitles || []),
      failureReason: record.failureReason ? String(record.failureReason) : null,
      lastCheckedAt: record.lastCheckedAt ?? null,
      isAvailable: Boolean(providerId && status === "FOUND"),
    };
  } catch {
    return null;
  }
}

async function loadStoredProviderMappingsBatch(
  anilistIds: number[],
  provider: ProviderId,
): Promise<Map<number, AnimeProviderAvailabilityRecord>> {
  const prisma = await getPrismaIfAvailable();
  const ids = Array.from(new Set(anilistIds.filter((value) => Number.isInteger(value) && value > 0)));
  if (!prisma || ids.length === 0) return new Map();

  try {
    const rows = await prisma.animeProviderMapping.findMany({
      where: {
        provider,
        anilistId: {
          in: ids,
        },
      },
    });

    return new Map(
      rows.map((row) => {
        const status = coerceProviderMappingStatus(row.status);
        const providerId = row.providerId ? String(row.providerId) : null;

        return [
          row.anilistId,
          {
            provider,
            status,
            providerId,
            matchedTitle: row.matchedTitle ? String(row.matchedTitle) : null,
            checkedTitles: uniqueStrings(row.checkedTitles || []),
            failureReason: row.failureReason ? String(row.failureReason) : null,
            lastCheckedAt: row.lastCheckedAt ?? null,
            isAvailable: Boolean(providerId && status === "FOUND"),
          } satisfies AnimeProviderAvailabilityRecord,
        ];
      }),
    );
  } catch {
    return new Map();
  }
}

async function storeProviderMapping(
  anilistId: number,
  provider: ProviderId,
  payload: {
    status: ProviderMappingStatus;
    providerId?: string | null;
    matchedTitle?: string | null;
    checkedTitles?: string[];
    failureReason?: string | null;
  },
): Promise<void> {
  const prisma = await getPrismaIfAvailable();
  if (!prisma) return;

  try {
    await prisma.animeProviderMapping.upsert({
      where: {
        anilistId_provider: {
          anilistId,
          provider,
        },
      },
      update: {
        providerId: payload.providerId || null,
        status: payload.status,
        matchedTitle: payload.matchedTitle || null,
        checkedTitles: uniqueStrings(payload.checkedTitles || []),
        failureReason: payload.failureReason || null,
        lastCheckedAt: new Date(),
      },
      create: {
        anilistId,
        provider,
        providerId: payload.providerId || null,
        status: payload.status,
        matchedTitle: payload.matchedTitle || null,
        checkedTitles: uniqueStrings(payload.checkedTitles || []),
        failureReason: payload.failureReason || null,
        lastCheckedAt: new Date(),
      },
    });
  } catch {
    // Best-effort persistence. Failing closed here would make the watch path brittle.
  }
}

const getAnilistSeedAnime = cache(async function getAnilistSeedAnime(anilistId: number): Promise<{
  anime: CatalogAnime;
  candidateTitles: string[];
} | null> {
  try {
    const media = await getAnilistDetail(anilistId);
    const title = anilistTitle(media);
    return {
      anime: normalizeBaseAnime({
        provider: "animekai",
        providerId: `anilist:${anilistId}`,
        title,
        poster: media.coverImage.extraLarge || media.coverImage.large,
        banner: media.bannerImage || media.coverImage.extraLarge || media.coverImage.large,
        description: media.description || null,
        genres: media.genres,
        type: media.format || null,
        year: media.seasonYear ? String(media.seasonYear) : media.startDate?.year ? String(media.startDate.year) : null,
        status: media.status || null,
        episodeCount: media.episodes ?? null,
        anilistId: media.id,
        malId: media.idMal,
      }),
      candidateTitles: uniqueStrings([
        media.title.english,
        media.title.romaji,
        media.title.native,
        ...(media.synonyms || []),
      ]),
    };
  } catch {
    return null;
  }
});

async function resolveAnimeKaiAvailability(
  anilistId: number,
  preferredTitles: Array<string | null | undefined> = [],
): Promise<AnimeProviderAvailabilityRecord> {
  return measureAsync(
    "anime.mapping.resolve",
    {
      provider: "animekai",
    },
    async () => {
      const seed = await getAnilistSeedAnime(anilistId);
      const candidateTitles = uniqueStrings([...preferredTitles, ...(seed?.candidateTitles || [])]);
      const stored = await loadStoredProviderMapping(anilistId, "animekai");

      if (stored && isProviderMappingFresh(stored.status, stored.lastCheckedAt)) {
        recordCounter("anime.mapping.cache_hit", 1, {
          provider: "animekai",
          status: stored.status,
        });
        return {
          ...stored,
          checkedTitles: uniqueStrings([...candidateTitles, ...stored.checkedTitles]),
          isAvailable: Boolean(stored.providerId && stored.status === "FOUND"),
        };
      }

      if (candidateTitles.length === 0) {
        recordCounter("anime.mapping.unresolved", 1, {
          provider: "animekai",
          reason: "missing_titles",
        });
        return stored || {
          provider: "animekai",
          status: "UNKNOWN",
          providerId: null,
          matchedTitle: null,
          checkedTitles: [],
          failureReason: "No AniList titles were available for provider mapping.",
          lastCheckedAt: null,
          isAvailable: false,
        };
      }

      for (const title of candidateTitles) {
        try {
          const slug = await searchAnimeKaiByTitle(title);
          if (!slug) continue;

          const record: AnimeProviderAvailabilityRecord = {
            provider: "animekai",
            status: "FOUND",
            providerId: slug,
            matchedTitle: title,
            checkedTitles: candidateTitles,
            failureReason: null,
            lastCheckedAt: new Date(),
            isAvailable: true,
          };
          await storeProviderMapping(anilistId, "animekai", record);
          recordCounter("anime.mapping.resolved", 1, {
            provider: "animekai",
            status: "FOUND",
          });
          return record;
        } catch {
          // Keep trying alternate titles.
        }
      }

      const notFoundRecord: AnimeProviderAvailabilityRecord = {
        provider: "animekai",
        status: "NOT_FOUND",
        providerId: null,
        matchedTitle: null,
        checkedTitles: candidateTitles,
        failureReason: "No provider mapping available",
        lastCheckedAt: new Date(),
        isAvailable: false,
      };
      await storeProviderMapping(anilistId, "animekai", notFoundRecord);
      recordCounter("anime.mapping.resolved", 1, {
        provider: "animekai",
        status: "NOT_FOUND",
      });
      return notFoundRecord;
    },
  );
}

export async function getAnimeKaiWatchAvailability(
  routeId: string,
  preferredTitles: Array<string | null | undefined> = [],
): Promise<WatchAvailabilitySummary> {
  const decoded = decodeAnimeId(routeId);

  if (decoded.provider !== "animekai") {
    return {
      provider: decoded.provider,
      status: "DIRECT",
      isAvailable: true,
      providerId: decoded.providerId,
      routeId,
      watchHref: `/anime/${routeId}/watch?ep=1&provider=${decoded.provider}`,
      message: "Direct provider route available.",
      checkedTitles: [],
    };
  }

  const anilistId = parseAnilistPassthroughId(decoded.providerId);
  if (!anilistId) {
    return {
      provider: "animekai",
      status: "DIRECT",
      isAvailable: true,
      providerId: decoded.providerId,
      routeId,
      watchHref: `/anime/${routeId}/watch?ep=1&provider=animekai`,
      message: "Direct AnimeKai route available.",
      checkedTitles: [],
    };
  }

  const availability = await resolveAnimeKaiAvailability(anilistId, preferredTitles);
  if (availability.providerId) {
    const resolvedRouteId = encodeAnimeId("animekai", availability.providerId);
    return {
      provider: "animekai",
      status: availability.status,
      isAvailable: true,
      providerId: availability.providerId,
      routeId: resolvedRouteId,
      watchHref: `/anime/${resolvedRouteId}/watch?ep=1&provider=animekai`,
      message: availability.matchedTitle
        ? `Available on AnimeKai via “${availability.matchedTitle}”.`
        : "Available on AnimeKai.",
      checkedTitles: availability.checkedTitles,
    };
  }

  return {
    provider: "animekai",
    status: availability.status,
    isAvailable: false,
    providerId: null,
    routeId: null,
    watchHref: null,
    message: "This anime is not available to watch yet.",
    checkedTitles: availability.checkedTitles,
  };
}

export async function getAnimeKaiCatalogAvailabilityHints(
  entries: Array<{
    anilistId: number;
    titles?: Array<string | null | undefined>;
  }>,
): Promise<Record<number, CatalogAvailabilityHint>> {
  const uniqueEntries = Array.from(
    new Map(
      entries
        .filter((entry) => Number.isInteger(entry.anilistId) && entry.anilistId > 0)
        .map((entry) => [
          entry.anilistId,
          {
            anilistId: entry.anilistId,
            titles: uniqueStrings(entry.titles || []),
          },
        ]),
    ).values(),
  );

  const stored = await loadStoredProviderMappingsBatch(
    uniqueEntries.map((entry) => entry.anilistId),
    "animekai",
  );

  return Object.fromEntries(
    uniqueEntries.map((entry) => {
      const record = stored.get(entry.anilistId) || null;
      const hasFreshNotFound = Boolean(record && record.status === "NOT_FOUND" && isProviderMappingFresh(record.status, record.lastCheckedAt));
      const hasProviderId = Boolean(record?.providerId);
      const routeId = hasProviderId ? encodeAnimeId("animekai", record!.providerId!) : null;

      const hint: CatalogAvailabilityHint = hasProviderId
        ? {
            anilistId: entry.anilistId,
            status: record?.status || "FOUND",
            isAvailable: true,
            routeId,
            watchHref: routeId ? `/anime/${routeId}/watch?ep=1&provider=animekai` : null,
            message: "Watch ready",
          }
        : hasFreshNotFound
          ? {
              anilistId: entry.anilistId,
              status: "NOT_FOUND",
              isAvailable: false,
              routeId: null,
              watchHref: null,
              message: "Not available yet",
            }
          : {
              anilistId: entry.anilistId,
              status: "UNKNOWN",
              isAvailable: false,
              routeId: null,
              watchHref: null,
              message: "Catalog check pending",
            };

      return [entry.anilistId, hint];
    }),
  );
}

export async function warmAnimeKaiCatalog(
  entries: Array<{
    anilistId: number;
    titles?: Array<string | null | undefined>;
  }>,
  options?: {
    episodeNumbers?: number[];
    dubbedModes?: boolean[];
    concurrency?: number;
    skipWarm?: boolean;
  },
): Promise<{
  processed: number;
  available: number;
  mapped: number;
  unavailable: number;
  warmed: number;
}> {
  const uniqueEntries = Array.from(
    new Map(
      entries
        .filter((entry) => Number.isInteger(entry.anilistId) && entry.anilistId > 0)
        .map((entry) => [
          entry.anilistId,
          {
            anilistId: entry.anilistId,
            titles: uniqueStrings(entry.titles || []),
          },
        ]),
    ).values(),
  );

  const concurrency = Math.min(6, Math.max(1, Number(options?.concurrency || 3)));
  let processed = 0;
  let available = 0;
  let mapped = 0;
  let unavailable = 0;
  let warmed = 0;

  await measureAsync(
    "anime.catalog_worker.run",
    {
      provider: "animekai",
      entries: uniqueEntries.length,
    },
    async () => {
      for (let index = 0; index < uniqueEntries.length; index += concurrency) {
        const chunk = uniqueEntries.slice(index, index + concurrency);
        const results = await Promise.allSettled(
          chunk.map(async (entry) => {
            const availability = await resolveAnimeKaiAvailability(entry.anilistId, entry.titles);
            processed += 1;

            if (!availability.providerId) {
              unavailable += 1;
              return;
            }

            mapped += 1;
            available += 1;

            if (!options?.skipWarm) {
              const warmResult = await warmAnimeWatchWindow({
                animeId: encodeAnimeId("animekai", availability.providerId),
                provider: "animekai",
                episodeNumbers: options?.episodeNumbers,
                dubbedModes: options?.dubbedModes,
              });

              warmed += warmResult.warmed;
            }
          }),
        );

        for (const result of results) {
          if (result.status === "rejected") {
            recordLog(
              "warn",
              "anime.catalog_worker.entry_failed",
              { provider: "animekai" },
              result.reason instanceof Error ? result.reason.message : "Unknown warm failure",
            );
          }
        }
      }
    },
  );

  recordCounter("anime.catalog_worker.processed", processed, { provider: "animekai" });
  recordCounter("anime.catalog_worker.available", available, { provider: "animekai" });
  recordCounter("anime.catalog_worker.unavailable", unavailable, { provider: "animekai" });
  if (warmed > 0) {
    recordCounter("anime.catalog_worker.warmed", warmed, { provider: "animekai" });
  }

  return {
    processed,
    available,
    mapped,
    unavailable,
    warmed,
  };
}

function summarizeFailedResponseBody(body: string): string {
  const trimmed = String(body || "").trim();
  if (!trimmed) return "";

  const htmlTitle = trimmed.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  if (htmlTitle) return htmlTitle;

  return trimmed.replace(/\s+/g, " ").slice(0, 220);
}

async function apiJson<T>(path: string, options?: { revalidate?: number; noStore?: boolean }): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "AnimeKAI-Frontend/1.0",
    },
    cache: options?.noStore ? "no-store" : undefined,
    next: options?.noStore ? undefined : { revalidate: options?.revalidate ?? DETAIL_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const summary = summarizeFailedResponseBody(body);
    throw new Error(`${path} -> ${response.status}${summary ? `: ${summary}` : ""}`);
  }

  return (await response.json()) as T;
}

async function apiJsonWithFallback<T>(
  paths: string[],
  options?: { revalidate?: number; noStore?: boolean },
): Promise<T> {
  let lastError: unknown = null;

  for (const path of paths) {
    try {
      return await apiJson<T>(path, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to resolve API payload from ${paths.join(", ")}`);
}

async function postBackendJson(path: string, payload: JsonValue): Promise<void> {
  await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "User-Agent": "AnimeKAI-Frontend/1.0",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
}

const ANIMEKAI_V2_BASE_PATH = "/api/v2/anime/animekai";
const WATCH_SESSION_FRESH_MS = 2 * 60 * 1000;
const WATCH_SESSION_STALE_MS = 10 * 60 * 1000;
const WATCH_SESSION_EXPIRE_MS = 20 * 60 * 1000;

function hasPlayableStreamSource(source: StreamSource | null | undefined): boolean {
  return Boolean(source?.url || source?.iframeUrl || source?.proxiedUrl);
}

function shouldCacheWatchShell(session: WatchSessionModel): boolean {
  return hasPlayableStreamSource(session.source) || session.serverOptions.length > 0;
}

function shouldCacheStreamResolution(result: { source: StreamSource | null }): boolean {
  return hasPlayableStreamSource(result.source);
}

function invalidateAnimeRuntimeCaches(animeId: string): void {
  cacheInvalidatePrefix(`detail-model:${animeId}`);
  cacheInvalidatePrefix(`watch-session:${animeId}`);
  cacheInvalidatePrefix(`stream:${animeId}`);
}

type AnimeKaiResolvedMeta = {
  detail: JsonValue;
  resolvedId: string;
  aniId: string | null;
  flavor: "python" | "v2";
};

type AnimeKaiServerEntry = {
  name: string;
  serverId: string;
  episodeId: string;
  linkId: string;
  category: "sub" | "dub";
};

export function normalizeHianimeCatalogItem(item: JsonValue): CatalogAnime {
  const title = pickFirstNonEmpty(item.name, item.title, humanizeProviderId(String(item.id || "")));
  const poster = pickFirstNonEmpty(item.poster, item.image);
  const episodes = item.episodes || {};
  const otherInfo = mapGenres(item.otherInfo);

  return normalizeBaseAnime({
    provider: "hianime",
    providerId: String(item.id || title),
    title,
    poster,
    description: item.description || null,
    genres: otherInfo,
    type: item.type || null,
    rating: item.rating || item.rank || null,
    year: parseYear(otherInfo.join(" ")),
    subCount: numberOrNull(episodes.sub),
    dubCount: numberOrNull(episodes.dub),
    episodeCount: numberOrNull(episodes.sub) ?? numberOrNull(episodes.dub),
    anilistId: numberOrNull(item.anilistID ?? item.anilist_id),
    malId: numberOrNull(item.malID ?? item.mal_id),
  });
}

export function normalizeAnimeKaiCatalogItem(item: JsonValue): CatalogAnime {
  const genres = mapGenres(item.genres);
  const subCount = numberOrNull(item.subCount ?? item.sub);
  const dubCount = numberOrNull(item.dubCount ?? item.dub);

  let providerId = String(item.id || item.slug || "");
  if (!providerId && item.url) {
    const parts = String(item.url).split("/");
    providerId = parts[parts.length - 1] || "";
  }
  if (!providerId) providerId = String(item.title);

  return normalizeBaseAnime({
    provider: "animekai",
    providerId,
    title: pickFirstNonEmpty(item.title, humanizeProviderId(providerId)),
    poster: pickFirstNonEmpty(item.image, item.poster, item.thumbnail),
    banner: pickFirstNonEmpty(item.banner),
    description: item.description || null,
    genres,
    type: item.type || null,
    rating: item.score || item.rating || null,
    year: parseYear(item.releaseDate || item.year || item.season),
    subCount,
    dubCount,
    episodeCount:
      numberOrNull(item.episodes ?? item.totalEpisodes) ??
      (Math.max(subCount || 0, dubCount || 0) || null),
    anilistId: numberOrNull(item.anilistId),
    malId: numberOrNull(item.malId),
  });
}

function normalizeAnimeKaiSeasonEntries(value: unknown): AnimeSeasonEntry[] {
  return ensureArray<JsonValue>(value)
    .map((entry) => {
      const rawUrl = pickFirstNonEmpty(entry.url);
      const slugMatch = rawUrl.match(/\/watch\/([^/?#]+)/);
      const slug = slugMatch?.[1] ? decodeURIComponent(slugMatch[1]) : "";

      return {
        title: pickFirstNonEmpty(entry.title, humanizeProviderId(slug || rawUrl)),
        href: slug ? `/anime/${encodeAnimeId("animekai", slug)}` : rawUrl || "#",
        poster: pickFirstNonEmpty(entry.poster) || null,
        episodeLabel: pickFirstNonEmpty(entry.episodes) || null,
        episodeCount: extractEpisodeCount(pickFirstNonEmpty(entry.episodes) || null),
        isActive: Boolean(entry.active),
      };
    })
    .filter((entry) => Boolean(entry.title) && Boolean(entry.href));
}

export function normalizeDesidubCatalogItem(item: JsonValue): CatalogAnime {
  const providerId = String(item.slug || item.id || item.title);
  return normalizeBaseAnime({
    provider: "desidub",
    providerId,
    title: pickFirstNonEmpty(item.title, humanizeProviderId(providerId)),
    poster: pickFirstNonEmpty(item.poster, item.thumbnail, item.image),
    description: item.description || null,
    genres: mapGenres(item.genres),
    type: item.type || "Dubbed Anime",
    rating: item.rating || null,
    year: parseYear(item.year || item.description),
  });
}

function toHianimeMetadata(data: JsonValue): AnimeMetadataRow[] {
  const info = data.anime?.info || {};
  const moreInfo = data.anime?.moreInfo || {};
  return [
    { label: "Type", value: pickFirstNonEmpty(info.stats?.type, moreInfo.type) },
    { label: "Status", value: pickFirstNonEmpty(moreInfo.status, info.status) },
    { label: "Studios", value: mapGenres(moreInfo.studios || moreInfo.studio).join(", ") },
    { label: "Aired", value: pickFirstNonEmpty(moreInfo.aired) },
    { label: "Duration", value: pickFirstNonEmpty(info.stats?.duration) },
  ].filter((row) => row.value);
}

function toAnimeKaiMetadata(data: JsonValue): AnimeMetadataRow[] {
  return [
    { label: "Type", value: pickFirstNonEmpty(data.type) },
    { label: "Status", value: pickFirstNonEmpty(data.status) },
    { label: "Season", value: pickFirstNonEmpty(data.season) },
    { label: "Duration", value: pickFirstNonEmpty(data.duration) },
  ].filter((row) => row.value);
}

function toDesidubMetadata(data: JsonValue): AnimeMetadataRow[] {
  return [
    { label: "Type", value: "Dubbed Anime" },
    { label: "Source", value: "DesiDub" },
    { label: "Downloads", value: Array.isArray(data.downloads) ? `${data.downloads.length} options` : "" },
  ].filter((row) => row.value);
}

function mergeEpisodeMaps(
  target: Map<number, EpisodeModel>,
  episodes: EpisodeModel[],
  provider: ProviderId,
  options: { allowNewEntries?: boolean } = {},
): void {
  const allowNewEntries = options.allowNewEntries ?? true;

  for (const episode of episodes) {
    const existing = target.get(episode.number);
    if (!existing) {
      if (!allowNewEntries) {
        continue;
      }

      target.set(episode.number, {
        ...episode,
        availableProviders: episode.availableProviders.length > 0 ? episode.availableProviders : [provider],
      });
      continue;
    }

    existing.title = existing.title || episode.title;
    existing.image = existing.image || episode.image || null;
    existing.isFiller = existing.isFiller || episode.isFiller;
    existing.isSubbed = existing.isSubbed ?? episode.isSubbed;
    existing.isDubbed = existing.isDubbed ?? episode.isDubbed;
    existing.idByProvider = { ...existing.idByProvider, ...episode.idByProvider };
    existing.availableProviders = Array.from(new Set([...existing.availableProviders, ...episode.availableProviders]));
  }
}

export function normalizeHianimeEpisodesPayload(data: JsonValue): EpisodeModel[] {
  return ensureArray(data.episodes).map((episode) => ({
    number: Number(episode.number || 0),
    title: pickFirstNonEmpty(episode.title, `Episode ${episode.number}`),
    isFiller: Boolean(episode.isFiller),
    isSubbed: true,
    isDubbed: false,
    idByProvider: { hianime: String(episode.episodeId) },
    availableProviders: ["hianime"],
  }));
}

export function normalizeAnimeKaiEpisodesPayload(data: JsonValue): EpisodeModel[] {
  const episodes = Array.isArray(data) ? data : ensureArray((data as any)?.episodes);
  return episodes.map((episode) => ({
    number: Number(episode.number || 0),
    title: pickFirstNonEmpty(episode.title, `Episode ${episode.number}`),
    isFiller: Boolean(episode.isFiller),
    isSubbed: episode.has_sub !== undefined ? Boolean(episode.has_sub) : Boolean(episode.isSubbed ?? true),
    isDubbed: episode.has_dub !== undefined ? Boolean(episode.has_dub) : Boolean(episode.isDubbed ?? false),
    idByProvider: { animekai: String(episode.token || episode.id || "") },
    availableProviders: ["animekai"] as ProviderId[],
  }));
}

export function normalizeDesidubEpisodesPayload(data: JsonValue): EpisodeModel[] {
  return ensureArray(data.episodes).map((episode) => ({
    number: Number(episode.number || 0),
    title: pickFirstNonEmpty(episode.title, `Episode ${episode.number}`),
    image: episode.image || null,
    isSubbed: false,
    isDubbed: true,
    idByProvider: { desidub: String(episode.id) },
    availableProviders: ["desidub"],
  }));
}

async function fetchHianimeHome() {
  const response = await apiJson<JsonValue>("/api/v2/hianime/home", {
    revalidate: HOME_REVALIDATE_SECONDS,
  });
  return unwrapProviderPayload(response);
}

async function fetchHianimeSearch(query: string, page: number) {
  const response = await apiJson<JsonValue>(
    `/api/v2/hianime/search?q=${encodeURIComponent(query)}&page=${page}`,
    { revalidate: SEARCH_REVALIDATE_SECONDS },
  );
  return unwrapProviderPayload(response);
}

async function fetchHianimeGenre(genre: string, page: number) {
  const response = await apiJson<JsonValue>(
    `/api/v2/hianime/genre/${encodeURIComponent(genre)}?page=${page}`,
    { revalidate: SEARCH_REVALIDATE_SECONDS },
  );
  return unwrapProviderPayload(response);
}

async function fetchHianimeDetailMeta(providerId: string): Promise<ProviderDetailMetaBundle> {
  const detailResponse = await apiJson<JsonValue>(`/api/v2/hianime/anime/${encodeURIComponent(providerId)}`, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
  });
  const detail = unwrapProviderPayload(detailResponse);
  const info = detail.anime?.info || {};
  const moreInfo = detail.anime?.moreInfo || {};
  const genres = mapGenres(moreInfo.genres || moreInfo.genre);
  const anime = normalizeBaseAnime({
    provider: "hianime",
    providerId,
    title: pickFirstNonEmpty(info.name, info.title, humanizeProviderId(providerId)),
    poster: pickFirstNonEmpty(info.poster),
    banner: pickFirstNonEmpty(info.banner),
    description: pickFirstNonEmpty(info.description),
    genres,
    type: pickFirstNonEmpty(info.stats?.type),
    rating: pickFirstNonEmpty(info.stats?.rating),
    year: parseYear(moreInfo.aired),
    status: pickFirstNonEmpty(moreInfo.status),
    subCount: numberOrNull(info.stats?.episodes?.sub),
    dubCount: numberOrNull(info.stats?.episodes?.dub),
    episodeCount: numberOrNull(info.stats?.episodes?.sub) ?? numberOrNull(info.stats?.episodes?.dub),
    anilistId: numberOrNull(info.anilistId),
    malId: numberOrNull(info.malId),
  });

  return {
    provider: "hianime",
    providerId,
    anime,
    synopsis: pickFirstNonEmpty(info.description),
    metadata: toHianimeMetadata(detail),
    seasons: [],
    related: ensureArray(detail.relatedAnimes).map(normalizeHianimeCatalogItem),
    recommended: ensureArray(detail.recommendedAnimes).map(normalizeHianimeCatalogItem),
  };
}

function resolveEpisodeAvailableProviders(
  episode: EpisodeModel | null | undefined,
  fallback: ProviderId[],
): ProviderId[] {
  if (!episode) return fallback;

  const providers = Array.from(
    new Set([
      ...episode.availableProviders,
      ...Object.entries(episode.idByProvider)
        .filter(([, providerEpisodeId]) => Boolean(providerEpisodeId))
        .map(([provider]) => provider as ProviderId),
    ]),
  );

  return providers.length > 0 ? providers : fallback;
}

async function fetchHianimeEpisodes(providerId: string): Promise<EpisodeModel[]> {
  const episodeResponse = await apiJson<JsonValue>(`/api/v2/hianime/anime/${encodeURIComponent(providerId)}/episodes`, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
  });
  const episodes = unwrapProviderPayload(episodeResponse);
  return normalizeHianimeEpisodesPayload(episodes);
}

async function fetchHianimeDetail(providerId: string): Promise<ProviderDetailBundle> {
  const [meta, episodes] = await Promise.all([
    fetchHianimeDetailMeta(providerId),
    fetchHianimeEpisodes(providerId),
  ]);

  return {
    ...meta,
    episodes,
    anime: {
      ...meta.anime,
      episodeCount: meta.anime.episodeCount ?? episodes.length,
    },
  };
}

async function resolveAnimeKaiSlug(providerId: string): Promise<string | null> {
  const anilistId = parseAnilistPassthroughId(providerId);
  if (!anilistId) {
    return providerId;
  }

  const availability = await resolveAnimeKaiAvailability(anilistId);
  return availability.providerId;
}

async function fetchAnimeKaiResolvedMeta(providerId: string): Promise<AnimeKaiResolvedMeta> {
  const resolvedId = await resolveAnimeKaiSlug(providerId);
  if (!resolvedId) {
    throw new Error("No provider mapping available");
  }

  try {
    const detail = await apiJson<JsonValue>(`/api/anime/${encodeURIComponent(resolvedId)}`, {
      revalidate: DETAIL_REVALIDATE_SECONDS,
    });

    return {
      detail,
      resolvedId,
      aniId: pickFirstNonEmpty(String(detail.ani_id || "")) || null,
      flavor: "python",
    };
  } catch {
    const detail = await apiJsonWithFallback<JsonValue>(
      [
        `${ANIMEKAI_V2_BASE_PATH}/info/${encodeURIComponent(resolvedId)}`,
        `${ANIMEKAI_V2_BASE_PATH}/meta/${encodeURIComponent(resolvedId)}`,
      ],
      {
        revalidate: DETAIL_REVALIDATE_SECONDS,
      },
    );

    return {
      detail,
      resolvedId,
      aniId: null,
      flavor: "v2",
    };
  }
}

async function fetchAnimeKaiDetailMeta(providerId: string): Promise<ProviderDetailMetaBundle> {
  const { detail, resolvedId } = await fetchAnimeKaiResolvedMeta(providerId);
  const subCount = numberOrNull(detail.subCount ?? detail.sub_episodes);
  const dubCount = numberOrNull(detail.dubCount ?? detail.dub_episodes);
  const anime = normalizeBaseAnime({
    provider: "animekai",
    providerId: resolvedId,
    title: pickFirstNonEmpty(detail.title, humanizeProviderId(resolvedId)),
    poster: pickFirstNonEmpty(detail.image, detail.poster),
    description: detail.description || null,
    genres: mapGenres(detail.genres),
    type: detail.type || null,
    year: parseYear(detail.season),
    status: detail.status || null,
    subCount,
    dubCount,
    episodeCount: Math.max(subCount || 0, dubCount || 0) || null,
    anilistId: numberOrNull(detail.anilistId),
    malId: numberOrNull(detail.malId),
  });

  return {
    provider: "animekai",
    providerId: resolvedId,
    anime,
    synopsis: pickFirstNonEmpty(detail.description),
    metadata: toAnimeKaiMetadata(detail),
    seasons: normalizeAnimeKaiSeasonEntries(detail.seasons),
    related: ensureArray(detail.relations).map(normalizeAnimeKaiCatalogItem),
    recommended: ensureArray(detail.recommendations).map(normalizeAnimeKaiCatalogItem),
  };
}

async function fetchAnimeKaiEpisodes(providerId: string): Promise<EpisodeModel[]> {
  const { detail, resolvedId, aniId, flavor } = await fetchAnimeKaiResolvedMeta(providerId);

  if (flavor === "python" && aniId) {
    try {
      const episodes = await apiJson<JsonValue>(`/api/episodes/${encodeURIComponent(aniId)}`, {
        revalidate: DETAIL_REVALIDATE_SECONDS,
      });
      const arr = Array.isArray(episodes) ? episodes : ensureArray((episodes as any)?.episodes);
      if (arr.length > 0) {
        return normalizeAnimeKaiEpisodesPayload(arr);
      }
    } catch {
      // Fall through to v2/embedded episode recovery below.
    }
  }

  const embeddedEpisodes = ensureArray((detail as any)?.episodes);
  if (embeddedEpisodes.length > 0) {
    return normalizeAnimeKaiEpisodesPayload(embeddedEpisodes);
  }

  const episodes = await apiJson<JsonValue>(`${ANIMEKAI_V2_BASE_PATH}/episodes/${encodeURIComponent(resolvedId)}`, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
  });
  return normalizeAnimeKaiEpisodesPayload(episodes);
}

async function fetchAnimeKaiDetail(providerId: string): Promise<ProviderDetailBundle> {
  const [meta, episodes] = await Promise.all([
    fetchAnimeKaiDetailMeta(providerId),
    fetchAnimeKaiEpisodes(providerId),
  ]);

  return {
    ...meta,
    episodes,
    anime: {
      ...meta.anime,
      episodeCount: meta.anime.episodeCount ?? episodes.length,
      subCount: meta.anime.subCount ?? episodes.filter((episode) => episode.isSubbed).length,
      dubCount: meta.anime.dubCount ?? episodes.filter((episode) => episode.isDubbed).length,
    },
  };
}

async function fetchDesidubDetailMeta(providerId: string): Promise<ProviderDetailMetaBundle> {
  const detail = await apiJson<JsonValue>(`/api/desidub/anime/${encodeURIComponent(providerId)}`, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
  });

  const anime = normalizeBaseAnime({
    provider: "desidub",
    providerId,
    title: pickFirstNonEmpty(detail.title, humanizeProviderId(providerId)),
    poster: pickFirstNonEmpty(detail.poster, detail.thumbnail),
    description: detail.description || null,
    genres: mapGenres(detail.genres),
    type: "Dubbed Anime",
    year: parseYear(detail.description),
  });

  return {
    provider: "desidub",
    providerId,
    anime,
    synopsis: pickFirstNonEmpty(detail.description),
    metadata: toDesidubMetadata(detail),
    seasons: [],
    related: [],
    recommended: [],
  };
}

async function fetchDesidubEpisodes(providerId: string): Promise<EpisodeModel[]> {
  const detail = await apiJson<JsonValue>(`/api/desidub/anime/${encodeURIComponent(providerId)}`, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
  });
  return normalizeDesidubEpisodesPayload(detail);
}

async function fetchDesidubDetail(providerId: string): Promise<ProviderDetailBundle> {
  const [meta, episodes] = await Promise.all([
    fetchDesidubDetailMeta(providerId),
    fetchDesidubEpisodes(providerId),
  ]);

  return {
    ...meta,
    episodes,
    anime: {
      ...meta.anime,
      episodeCount: meta.anime.episodeCount ?? episodes.length,
    },
  };
}

async function fetchProviderDetailMetaRemote(provider: ProviderId, providerId: string): Promise<ProviderDetailMetaBundle> {
  switch (provider) {
    case "hianime":
      return fetchHianimeDetailMeta(providerId);
    case "animekai":
      return fetchAnimeKaiDetailMeta(providerId);
    case "desidub":
      return fetchDesidubDetailMeta(providerId);
    default:
      throw new Error(`Provider ${provider} is not supported`);
  }
}

async function fetchProviderEpisodesRemote(provider: ProviderId, providerId: string): Promise<EpisodeModel[]> {
  switch (provider) {
    case "hianime":
      return fetchHianimeEpisodes(providerId);
    case "animekai":
      return fetchAnimeKaiEpisodes(providerId);
    case "desidub":
      return fetchDesidubEpisodes(providerId);
    default:
      throw new Error(`Provider ${provider} is not supported`);
  }
}

async function fetchProviderDetailMeta(provider: ProviderId, providerId: string): Promise<ProviderDetailMetaBundle> {
  const stored = await loadStoredProviderMetaSnapshot(provider, providerId);
  if (stored?.isFresh) {
    return stored.bundle;
  }

  try {
    const bundle = await fetchProviderDetailMetaRemote(provider, providerId);
    await storeProviderMetaSnapshot(bundle);
    return bundle;
  } catch (error) {
    if (stored?.bundle) {
      return stored.bundle;
    }
    throw error;
  }
}

async function fetchProviderEpisodes(provider: ProviderId, providerId: string): Promise<EpisodeModel[]> {
  const stored = await loadStoredProviderEpisodesSnapshot(provider, providerId);
  if (stored?.isFresh) {
    return stored.episodes;
  }

  const snapshotKeys = await resolveProviderSnapshotKeys(provider, providerId);
  const snapshotProviderId = snapshotKeys[0] || providerId;

  try {
    const episodes = await fetchProviderEpisodesRemote(provider, providerId);
    await storeProviderEpisodesSnapshot(provider, snapshotProviderId, episodes);
    return episodes;
  } catch (error) {
    if (stored?.episodes) {
      return stored.episodes;
    }
    throw error;
  }
}

async function fetchProviderDetail(provider: ProviderId, providerId: string): Promise<ProviderDetailBundle> {
  const [meta, episodes] = await Promise.all([
    fetchProviderDetailMeta(provider, providerId),
    fetchProviderEpisodes(provider, providerId),
  ]);

  return {
    ...meta,
    episodes,
    anime: {
      ...meta.anime,
      episodeCount: meta.anime.episodeCount ?? episodes.length,
      subCount: meta.anime.subCount ?? episodes.filter((episode) => episode.isSubbed).length,
      dubCount: meta.anime.dubCount ?? episodes.filter((episode) => episode.isDubbed).length,
    },
  };
}

async function searchHianimeByTitle(title: string): Promise<string | null> {
  const response = await fetchHianimeSearch(title, 1);
  const match = bestTitleMatch(title, ensureArray(response.animes));
  return match?.id ? String(match.id) : null;
}

async function searchAnimeKaiByTitle(title: string): Promise<string | null> {
  const response = await apiJsonWithFallback<JsonValue>(
    [
      `/api/search?keyword=${encodeURIComponent(title)}`,
      `${ANIMEKAI_V2_BASE_PATH}/search/${encodeURIComponent(title)}?page=1`,
    ],
    { revalidate: SEARCH_REVALIDATE_SECONDS },
  );
  const match = bestTitleMatch(title, ensureArray(response.results));
  if (!match) return null;
  // AnimeKai search items have a `slug` field, e.g. "jujutsu-kaisen-4gm6"
  // Fall back to extracting from `url` if slug is missing
  const slug =
    match.slug ||
    match.id ||
    (match.url ? String(match.url).split("/").filter(Boolean).pop() : null);
  return slug ? String(slug) : null;
}

export const resolveAnimeKaiWatchHref = cache(async function resolveAnimeKaiWatchHref(
  routeId: string,
  title?: string | null,
): Promise<string> {
  const defaultHref = `/anime/${routeId}`;
  const decoded = decodeAnimeId(routeId);

  if (decoded.provider !== "animekai" || !decoded.providerId.startsWith("anilist:")) {
    return `/anime/${routeId}/watch?ep=1&provider=animekai`;
  }

  try {
    const availability = await getAnimeKaiWatchAvailability(routeId, [title]);
    return availability.watchHref || defaultHref;
  } catch {
    return defaultHref;
  }
});

export async function warmAnimeWatchWindow(input: {
  animeId: string;
  provider?: ProviderId | null;
  episodeNumbers?: number[];
  dubbedModes?: boolean[];
}): Promise<{
  available: boolean;
  animeId: string;
  resolvedAnimeId: string | null;
  activeProvider: ProviderId | null;
  warmed: number;
  attempted: number;
}> {
  return measureAsync(
    "anime.warm.window",
    {
      requestedProvider: input.provider || "auto",
    },
    async () => {
      let resolvedAnimeId = input.animeId;
      const decoded = decodeAnimeId(input.animeId);

      if (decoded.provider === "animekai" && decoded.providerId.startsWith("anilist:")) {
        const availability = await getAnimeKaiWatchAvailability(input.animeId);
        if (!availability.routeId) {
          recordCounter("anime.warm.unavailable", 1, {
            requestedProvider: input.provider || "animekai",
          });
          return {
            available: false,
            animeId: input.animeId,
            resolvedAnimeId: null,
            activeProvider: null,
            warmed: 0,
            attempted: 0,
          };
        }
        resolvedAnimeId = availability.routeId;
      }

      const detail = await getAnimeDetailModel(resolvedAnimeId, input.provider || null, {
        resolveProviderFallbacks: true,
        mergeEpisodeProviders: true,
      });

      const episodeNumbers = uniqueStrings(
        (input.episodeNumbers?.length
          ? input.episodeNumbers.map((episodeNumber) => String(Number(episodeNumber || 0)))
          : detail.episodes.slice(0, 3).map((episode) => String(episode.number))),
      )
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .slice(0, 6);

      const dubbedModes =
        input.dubbedModes && input.dubbedModes.length > 0
          ? Array.from(new Set(input.dubbedModes.map(Boolean)))
          : [false];

      const tasks = episodeNumbers.flatMap((episodeNumber) =>
        dubbedModes.map((dubbed) =>
          getFastWatchSession({
            animeId: resolvedAnimeId,
            episodeNumber,
            provider: input.provider || detail.activeProvider,
            dubbed,
            server: null,
          }),
        ),
      );

      const results = await Promise.allSettled(tasks);
      const warmed = results.filter((result) => result.status === "fulfilled").length;

      const animeKaiProviderId =
        detail.anime.providerIds.animekai ||
        (decodeAnimeId(resolvedAnimeId).provider === "animekai" ? decodeAnimeId(resolvedAnimeId).providerId : null);

      if (animeKaiProviderId) {
        const animeKaiEpisodeIds = detail.episodes
          .filter((episode) => episodeNumbers.includes(episode.number))
          .map((episode) => episode.idByProvider.animekai)
          .filter((episodeId): episodeId is string => Boolean(episodeId))
          .slice(0, 3);

        const sampledDubbedMode = dubbedModes[0] ?? false;
        const sampledLinkIds = (
          await Promise.all(
            animeKaiEpisodeIds.map(async (episodeId) => {
              try {
                const entries = await fetchAnimeKaiServerEntries(episodeId, sampledDubbedMode);
                return entries[0]?.linkId || null;
              } catch {
                return null;
              }
            }),
          )
        ).filter((linkId): linkId is string => Boolean(linkId));

        if (animeKaiEpisodeIds.length > 0 || sampledLinkIds.length > 0) {
          void postBackendJson("/api/cache/warm", {
            slug: animeKaiProviderId,
            episode_ids: animeKaiEpisodeIds,
            link_ids: sampledLinkIds,
          }).catch(() => undefined);

          recordCounter("anime.warm.backend_requested", 1, {
            provider: "animekai",
            episodes: animeKaiEpisodeIds.length,
            links: sampledLinkIds.length,
          });
        }
      }

      recordCounter("anime.warm.attempted", tasks.length, {
        provider: input.provider || detail.activeProvider,
      });
      if (warmed > 0) {
        recordCounter("anime.warm.completed", warmed, {
          provider: input.provider || detail.activeProvider,
        });
      }

      return {
        available: true,
        animeId: input.animeId,
        resolvedAnimeId,
        activeProvider: input.provider || detail.activeProvider,
        warmed,
        attempted: tasks.length,
      };
    },
  );
}

async function searchDesidubByTitle(title: string): Promise<string | null> {
  const response = await apiJson<JsonValue>(`/api/desidub/search?keyword=${encodeURIComponent(title)}`, {
    revalidate: SEARCH_REVALIDATE_SECONDS,
  });
  const match = bestTitleMatch(title, ensureArray(response.results));
  return match?.slug ? String(match.slug) : null;
}

async function resolveFallbackProviderIds(
  seedAnime: CatalogAnime,
  preferredTitle?: string,
  providersToResolve?: ProviderId[],
): Promise<Partial<Record<ProviderId, string>>> {
  const providerIds: Partial<Record<ProviderId, string>> = { ...seedAnime.providerIds };
  const title = preferredTitle || seedAnime.title;
  const targets = providersToResolve?.length ? Array.from(new Set(providersToResolve)) : [...PROVIDERS];

  const tasks: Array<Promise<void>> = [];

  for (const provider of targets) {
    if (providerIds[provider]) continue;

    if (provider === "hianime") {
      tasks.push(
        searchHianimeByTitle(title)
          .then((value) => {
            if (value) providerIds.hianime = value;
          })
          .catch(() => undefined),
      );
      continue;
    }

    if (provider === "animekai") {
      tasks.push(
        searchAnimeKaiByTitle(title)
          .then((value) => {
            if (value) providerIds.animekai = value;
          })
          .catch(() => undefined),
      );
      continue;
    }

    if (provider === "desidub") {
      tasks.push(
        searchDesidubByTitle(title)
          .then((value) => {
            if (value) providerIds.desidub = value;
          })
          .catch(() => undefined),
      );
    }
  }

  await Promise.all(tasks);

  if (seedAnime.anilistId && providerIds.animekai) {
    await storeProviderMapping(seedAnime.anilistId, "animekai", {
      status: "FOUND",
      providerId: providerIds.animekai,
      matchedTitle: title,
      checkedTitles: [title],
      failureReason: null,
    });
  }

  return providerIds;
}

function withProviderIds(anime: CatalogAnime, providerIds: Partial<Record<ProviderId, string>>, routeId?: string): CatalogAnime {
  const next = cloneCatalogAnime(anime, providerIds);
  return routeId ? { ...next, id: routeId, href: `/anime/${routeId}` } : next;
}

const getHomePageModelUncached = async (): Promise<HomePageModel> => {
  const attempts: ProviderAttemptStatus[] = [];
  let activeProvider: ProviderId = "animekai";
  let hero: CatalogAnime | null = null;
  let trending: CatalogAnime[] = [];
  let newReleases: CatalogAnime[] = [];
  let topAiring: CatalogAnime[] = [];
  let genres: string[] = [];
  const sectionProviders: HomePageModel["sectionProviders"] = {};

  if (!hero || trending.length === 0 || newReleases.length === 0 || topAiring.length === 0) {
    try {
      const [home, releases, recent, genreRes] = await Promise.all([
        apiJson<JsonValue>("/api/home", { revalidate: HOME_REVALIDATE_SECONDS }),
        apiJson<JsonValue>("/api/category/new-releases?page=1", { revalidate: HOME_REVALIDATE_SECONDS }),
        apiJson<JsonValue>("/api/category/updates?page=1", { revalidate: HOME_REVALIDATE_SECONDS }),
        apiJson<JsonValue>("/api/genres", { revalidate: HOME_REVALIDATE_SECONDS }),
      ]);
      attempts.push(providerSuccess("animekai", "Loaded straight from Python API"));

      if (!hero) {
        const heroItem = normalizeAnimeKaiCatalogItem(ensureArray(home.banner)[0] || {});
        if (heroItem.providerId) {
          hero = heroItem;
          sectionProviders.hero = "animekai";
        }
      }

      if (trending.length === 0) {
        trending = ensureArray(home.trending?.NOW || []).slice(0, 10).map(normalizeAnimeKaiCatalogItem);
        if (trending.length > 0) sectionProviders.trending = "animekai";
      }

      if (newReleases.length === 0) {
        newReleases = ensureArray(releases.results).slice(0, 8).map(normalizeAnimeKaiCatalogItem);
        if (newReleases.length > 0) sectionProviders.newReleases = "animekai";
      }

      if (topAiring.length === 0) {
        topAiring = ensureArray(recent.results).slice(0, 6).map(normalizeAnimeKaiCatalogItem);
        if (topAiring.length > 0) sectionProviders.topAiring = "animekai";
      }

      if (genres.length === 0) {
        genres = uniqueStrings(ensureArray(genreRes.genres).map(String));
      }

      if (!sectionProviders.hero || sectionProviders.hero !== "animekai") {
        activeProvider = "animekai";
      }
    } catch (error) {
      attempts.push(providerFailure("animekai", error instanceof Error ? error.message : "Failed to load Python home"));
    }
  }

  if (!hero || trending.length === 0) {
    try {
      const desidub = await apiJson<JsonValue>("/api/desidub/home", {
        revalidate: HOME_REVALIDATE_SECONDS,
      });
      attempts.push(providerSuccess("desidub", "Used as final home fallback"));
      const fallbackItems = ensureArray(desidub.featured).map(normalizeDesidubCatalogItem);
      if (!hero && fallbackItems[0]) {
        hero = fallbackItems[0];
        sectionProviders.hero = "desidub";
      }
      if (trending.length === 0) {
        trending = fallbackItems.slice(0, 10);
        if (trending.length > 0) sectionProviders.trending = "desidub";
      }
      if (newReleases.length === 0) {
        newReleases = fallbackItems.slice(0, 8);
        if (newReleases.length > 0) sectionProviders.newReleases = "desidub";
      }
      if (topAiring.length === 0) {
        topAiring = fallbackItems.slice(0, 6);
        if (topAiring.length > 0) sectionProviders.topAiring = "desidub";
      }
      activeProvider = sectionProviders.hero || activeProvider;
    } catch (error) {
      attempts.push(providerFailure("desidub", error instanceof Error ? error.message : "Failed to load final fallback"));
    }
  }

  return {
    hero,
    trending,
    newReleases,
    topAiring,
    genres,
    activeProvider,
    attempts,
    sectionProviders,
  };
};

export const getHomePageModel = cache(getHomePageModelUncached);

export async function getHindiDubbedAnimes(): Promise<CatalogAnime[]> {
  try {
    const desidub = await apiJson<JsonValue>("/api/v2/anime/desidub/home", {
      revalidate: 300,
    });
    return (desidub.featured as any[] || []).map(normalizeDesidubCatalogItem);
  } catch {
    return [];
  }
}

export async function getGenresPageModel(): Promise<GenresPageModel> {
  const home = await getHomePageModel();
  const featuredGenres = uniqueStrings([
    "Action",
    "Adventure",
    "Fantasy",
    "Sci-Fi",
    "Drama",
    "Romance",
    "Comedy",
    "Thriller",
    ...home.genres,
  ]).slice(0, 12);

  return {
    genres: home.genres,
    featuredGenres,
    activeProvider: home.activeProvider,
    attempts: home.attempts,
  };
}

export async function getSearchPageModel(options: {
  query?: string;
  genre?: string;
  page?: number;
  dubbed?: boolean;
  provider?: ProviderId | null;
}): Promise<SearchPageModel> {
  const query = String(options.query || "").trim();
  const genre = String(options.genre || "").trim();
  const page = Math.max(1, Number(options.page || 1));
  const dubbed = Boolean(options.dubbed);
  const lockedProvider = options.provider || null;
  const attempts: ProviderAttemptStatus[] = [];
  const providerOrder = lockedProvider ? [lockedProvider] : buildProviderOrder("animekai");

  const genresFromHome = (await getHomePageModel()).genres;
  const browsingLabel = query
    ? `Results for "${query}"`
    : genre
      ? `${genre} anime`
      : "Trending anime";

  for (const provider of providerOrder) {
    try {
      let results: CatalogAnime[] = [];
      let totalPages: number | null = null;
      let hasNextPage = false;

      if (provider === "animekai") {
        if (query) {
          const response = await apiJson<JsonValue>(
            `/api/search?keyword=${encodeURIComponent(query)}`,
            { revalidate: SEARCH_REVALIDATE_SECONDS },
          );
          results = ensureArray(response.results).map(normalizeAnimeKaiCatalogItem);
        } else if (genre) {
          const response = await apiJson<JsonValue>(
            `/api/genres/${encodeURIComponent(genre.toLowerCase())}?page=${page}`,
            { revalidate: SEARCH_REVALIDATE_SECONDS },
          );
          results = ensureArray(response.results).map(normalizeAnimeKaiCatalogItem);
        } else {
          const response = await apiJson<JsonValue>(`/api/category/updates?page=${page}`, {
            revalidate: SEARCH_REVALIDATE_SECONDS,
          });
          results = ensureArray(response.results).map(normalizeAnimeKaiCatalogItem);
        }
      }

      if (provider === "desidub") {
        if (query) {
          const response = await apiJson<JsonValue>(`/api/v2/anime/desidub/search?q=${encodeURIComponent(query)}`, {
            revalidate: SEARCH_REVALIDATE_SECONDS,
          });
          results = ensureArray(response.results).map(normalizeDesidubCatalogItem);
        } else {
          const response = await apiJson<JsonValue>("/api/v2/anime/desidub/home", {
            revalidate: SEARCH_REVALIDATE_SECONDS,
          });
          results = ensureArray(response.featured).map(normalizeDesidubCatalogItem);
        }
      }

      if (genre && query) {
        const normalizedGenre = normalizeText(genre);
        results = results.filter((anime) => anime.genres.some((entry) => normalizeText(entry).includes(normalizedGenre)));
      }

      if (dubbed) {
        results = results.filter((anime) => (anime.dubCount || 0) > 0 || anime.provider === "desidub");
      }

      if (results.length === 0) {
        attempts.push(providerFailure(provider, "No results returned", true));
        continue;
      }

      attempts.push(providerSuccess(provider, query || genre ? "Search resolved" : "Browse results loaded"));

      return {
        query,
        genre,
        page,
        dubbed,
        lockedProvider,
        results,
        genres: genresFromHome,
        activeProvider: provider,
        attempts,
        totalPages,
        hasNextPage,
        browsingLabel,
      };
    } catch (error) {
      attempts.push(providerFailure(provider, error instanceof Error ? error.message : "Search failed"));
    }
  }

  return {
    query,
    genre,
    page,
    dubbed,
    lockedProvider,
    results: [],
    genres: genresFromHome,
    activeProvider: lockedProvider || "animekai",
    attempts,
    totalPages: null,
    hasNextPage: false,
    browsingLabel,
  };
}

async function tryBaseProviderDetail(routeId: string): Promise<ProviderDetailBundle | null> {
  const decoded = decodeAnimeId(routeId);
  try {
    return await fetchProviderDetail(decoded.provider, decoded.providerId);
  } catch {
    return null;
  }
}

const tryBaseProviderDetailMeta = cache(async function tryBaseProviderDetailMeta(routeId: string): Promise<ProviderDetailLoadResult<ProviderDetailMetaBundle>> {
  const decoded = decodeAnimeId(routeId);
  try {
    return {
      bundle: await fetchProviderDetailMeta(decoded.provider, decoded.providerId),
      error: null,
    };
  } catch (error) {
    return {
      bundle: null,
      error: error instanceof Error ? error.message : "Base provider detail lookup failed",
    };
  }
});

export async function getAnimeDetailOverviewModel(
  routeId: string,
  preferredProvider?: ProviderId | null,
  options: AnimeDetailModelOptions = {},
): Promise<AnimeDetailOverviewModel> {
  const decoded = decodeAnimeId(routeId);
  const attempts: ProviderAttemptStatus[] = [];
  const baseDetail = await tryBaseProviderDetailMeta(routeId);
  const baseBundle = baseDetail.bundle;
  const anilistSeed =
    !baseBundle && decoded.provider === "animekai" && parseAnilistPassthroughId(decoded.providerId)
      ? await getAnilistSeedAnime(parseAnilistPassthroughId(decoded.providerId)!)
      : null;

  if (baseBundle) {
    attempts.push(providerSuccess(baseBundle.provider, "Resolved base provider metadata"));
  } else {
    attempts.push(providerFailure(decoded.provider, baseDetail.error || "Base provider detail lookup failed"));
  }

  const seedAnime = baseBundle?.anime || anilistSeed?.anime || normalizeBaseAnime({
    provider: decoded.provider,
    providerId: decoded.providerId,
    title: humanizeProviderId(decoded.providerId),
    description: null,
    genres: [],
  });

  const shouldResolveFallbacks = options.resolveProviderFallbacks ?? true;
  const shouldMergeEpisodeProviders = options.mergeEpisodeProviders ?? true;
  const providerTargets = shouldResolveFallbacks
    ? PROVIDERS.filter((provider) => provider !== seedAnime.provider)
    : preferredProvider && preferredProvider !== decoded.provider
      ? [preferredProvider]
      : [];
  const providerIds =
    providerTargets.length > 0
      ? await resolveFallbackProviderIds(
          seedAnime,
          baseBundle?.anime.title || anilistSeed?.anime.title || humanizeProviderId(decoded.providerId),
          providerTargets,
        )
      : { ...seedAnime.providerIds };
  providerIds[decoded.provider] = providerIds[decoded.provider] || decoded.providerId;
  const order = buildProviderOrder(preferredProvider || decoded.provider, decoded.provider);
  const bundleCache = new Map<ProviderId, ProviderDetailMetaBundle>();
  if (baseBundle) {
    bundleCache.set(baseBundle.provider, baseBundle);
  }

  let activeBundle: ProviderDetailMetaBundle | null = null;

  for (const provider of order) {
    const providerId = providerIds[provider];
    if (!providerId) {
      attempts.push(providerFailure(provider, "No provider mapping available", true));
      continue;
    }

    try {
      const bundle = bundleCache.get(provider) || (await fetchProviderDetailMeta(provider, providerId));
      bundleCache.set(provider, bundle);
      providerIds[provider] = bundle.providerId;
      attempts.push(providerSuccess(provider, provider === decoded.provider ? "Primary detail loaded" : "Fallback detail loaded"));
      activeBundle = bundle;
      break;
    } catch (error) {
      attempts.push(providerFailure(provider, error instanceof Error ? error.message : "Failed to load detail"));
    }
  }

  if (!activeBundle) {
    const anime = withProviderIds(seedAnime, providerIds, routeId);
    return {
      anime,
      synopsis: anime.description || "No synopsis available right now.",
      metadata: [],
      seasons: [],
      related: [],
      recommended: [],
      activeProvider: decoded.provider,
      availableProviders: collectResolvedProviders(providerIds),
      attempts,
    };
  }

  const mergedAnime = withProviderIds(activeBundle.anime, providerIds, routeId);
  const availableProviders = collectResolvedProviders(providerIds);

  return {
    anime: mergedAnime,
    synopsis: activeBundle.synopsis || mergedAnime.description || "No synopsis available right now.",
    metadata: activeBundle.metadata,
    seasons: activeBundle.seasons,
    related: activeBundle.related.map((anime) => withProviderIds(anime, anime.providerIds)),
    recommended: activeBundle.recommended.map((anime) => withProviderIds(anime, anime.providerIds)),
    activeProvider: activeBundle.provider,
    availableProviders,
    attempts,
  };
}

export async function getAnimeEpisodeListModel(
  routeId: string,
  preferredProvider?: ProviderId | null,
): Promise<AnimeEpisodeListModel> {
  const detail = await getAnimeDetailOverviewModel(routeId, preferredProvider, {
    resolveProviderFallbacks: false,
    mergeEpisodeProviders: false,
  });
  const providerId = detail.anime.providerIds[detail.activeProvider] || detail.anime.providerId;

  if (!providerId) {
    return {
      anime: detail.anime,
      episodes: [],
      episodeCoverageMode: "active-provider",
      activeProvider: detail.activeProvider,
      availableProviders: detail.availableProviders,
    };
  }

  try {
    const episodes = await fetchProviderEpisodes(detail.activeProvider, providerId);
    return {
      anime: detail.anime,
      episodes,
      episodeCoverageMode: "active-provider",
      activeProvider: detail.activeProvider,
      availableProviders: detail.availableProviders,
    };
  } catch {
    return {
      anime: detail.anime,
      episodes: [],
      episodeCoverageMode: "active-provider",
      activeProvider: detail.activeProvider,
      availableProviders: detail.availableProviders,
    };
  }
}

/**
 * Lightweight episode fetch — skips the full overview resolution.
 * Use when the caller already knows the active provider and provider ID.
 */
export async function getEpisodesForProvider(
  provider: ProviderId,
  providerId: string,
): Promise<EpisodeModel[]> {
  try {
    return await fetchProviderEpisodes(provider, providerId);
  } catch {
    return [];
  }
}

async function _getAnimeDetailModelRaw(
  routeId: string,
  preferredProvider?: ProviderId | null,
  options: AnimeDetailModelOptions = {},
): Promise<AnimeDetailModel> {
  const detail = await getAnimeDetailOverviewModel(routeId, preferredProvider, options);
  const shouldMergeEpisodeProviders = options.mergeEpisodeProviders ?? true;

  if (!shouldMergeEpisodeProviders) {
    const activeProviderId =
      detail.anime.providerIds[detail.activeProvider] || detail.anime.providerId;
    const episodes = activeProviderId
      ? await fetchProviderEpisodes(detail.activeProvider, activeProviderId).catch(() => [])
      : [];

    return {
      ...detail,
      episodes,
      episodeCoverageMode: "active-provider",
    };
  }

  const episodeMap = new Map<number, EpisodeModel>();
  const providerOrder = [detail.activeProvider, ...PROVIDERS.filter((provider) => provider !== detail.activeProvider)];

  for (const provider of providerOrder) {
    const providerId = detail.anime.providerIds[provider];
    if (!providerId) continue;
    try {
      const episodes = await fetchProviderEpisodes(provider, providerId);
      mergeEpisodeMaps(episodeMap, episodes, provider, { allowNewEntries: episodeMap.size === 0 });
    } catch {
      // Keep detail page resilient; overview already captured primary selection attempts.
    }
  }

  return {
    ...detail,
    episodes: Array.from(episodeMap.values()).sort((a, b) => a.number - b.number),
    episodeCoverageMode: "merged-providers",
  };
}


/**
 * Cached wrapper for getAnimeDetailModel.
 * Detail data is stable - cache for 10 min, serve stale for 1 hour while refreshing.
 */
export async function getAnimeDetailModel(
  routeId: string,
  preferredProvider?: ProviderId | null,
  options: AnimeDetailModelOptions = {},
): Promise<AnimeDetailModel> {
  const cacheKey = `detail-model:${routeId}:${preferredProvider || "auto"}:${options.mergeEpisodeProviders ?? true}`;
  return cacheFetch(
    cacheKey,
    () => _getAnimeDetailModelRaw(routeId, preferredProvider, options),
    { freshMs: 10 * 60 * 1000, staleMs: 60 * 60 * 1000, expireMs: 2 * 60 * 60 * 1000 },
  );
}

export function normalizeStreamSourceFromUrl(input: {
  label: string;
  url: string | null;
  iframeUrl?: string | null;
  referer?: string | null;
  forceProxy?: boolean;
  preferEmbed?: boolean;
}): StreamSource {
  const url = input.url || null;
  const isM3U8 = Boolean(url && url.includes(".m3u8"));
  const requiresProxy = Boolean(input.forceProxy || input.referer || isM3U8);
  const preferEmbed = Boolean(input.preferEmbed && input.iframeUrl);

  return {
    kind: preferEmbed || !url ? "iframe" : "video",
    label: input.label,
    url,
    proxiedUrl: url
      ? requiresProxy
        ? buildProxyUrl(API_BASE_URL, url, input.referer || undefined, isM3U8 ? "playlist" : "video")
        : url
      : null,
    iframeUrl: input.iframeUrl || null,
    isM3U8,
    requiresProxy,
  };
}

async function fetchHianimeWatchSession(
  episodeId: string,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  const serverName = requestedServer || "HD-1";
  const response = await apiJson<JsonValue>(
    `/api/v2/hianime/episode/stream?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(serverName)}&category=${dubbed ? "dub" : "sub"}`,
    { noStore: true },
  );
  const data = response.data || response;
  const current = ensureArray(data.streamingLink)[0] || {};
  const source = normalizeStreamSourceFromUrl({
    label: current.server || serverName,
    url: current.link || null,
    iframeUrl: current.iframe || null,
    referer: current.iframe || null,
    // Only prefer iframe if no direct stream URL
    preferEmbed: !current.link && Boolean(current.iframe),
  });

  return {
    source: source.url || source.iframeUrl ? source : null,
    subtitles: ensureArray(data.tracks || data.subtitles).map((track) => ({
      label: track.label || track.lang || "Subtitle",
      lang: track.label || track.lang || "Unknown",
      url: track.file || track.url,
      isDefault: Boolean(track.default),
    })),
    serverOptions: ensureArray(data.servers).map((server) => ({
      id: String(server.serverName || server.server || "HD-1"),
      label: `${server.serverName} ${server.type ? `(${String(server.type).toUpperCase()})` : ""}`.trim(),
      provider: "hianime",
      category: server.type || undefined,
    })),
    activeServerId:
      ensureArray(data.servers).find((server) => String(server.serverName || server.server) === serverName)?.serverName ||
      serverName,
    intro: data.intro || null,
    outro: data.outro || null,
  };
}

async function fetchAnimeKaiWatchSession(
  episodeId: string,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  const watchPaths = episodeId.includes("$token=")
    ? [
        `${ANIMEKAI_V2_BASE_PATH}/watch/${encodeURIComponent(episodeId)}?dub=${dubbed ? "1" : "0"}`,
        `/api/watch/${encodeURIComponent(episodeId)}?dub=${dubbed ? "1" : "0"}`,
      ]
    : [
        `/api/watch/${encodeURIComponent(episodeId)}?dub=${dubbed ? "1" : "0"}`,
        `${ANIMEKAI_V2_BASE_PATH}/watch/${encodeURIComponent(episodeId)}?dub=${dubbed ? "1" : "0"}`,
      ];

  let response: JsonValue | null = null;
  let entries: JsonValue[] = [];
  let lastError: unknown = null;

  for (const path of watchPaths) {
    try {
      const payload = await apiJson<JsonValue>(path, { noStore: true });
      const candidateEntries = ensureArray(payload.results);

      response = payload;
      entries = candidateEntries;
      if (candidateEntries.length > 0) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response && lastError) {
    throw lastError instanceof Error ? lastError : new Error("Failed to resolve AnimeKai watch session");
  }

  const selected =
    entries.find((entry) => String(entry.name || "").toLowerCase() === String(requestedServer || "").toLowerCase()) ||
    entries[0] ||
    {};

  // Python API returns sources[].file (not .url) and embed URL in selected.url
  const stream = ensureArray(selected.sources)[0] || {};
  const streamUrl = stream.file || stream.url || null;
  const embedUrl = selected.url || null;

  const source = normalizeStreamSourceFromUrl({
    label: selected.name || "AnimeKai",
    url: streamUrl,
    iframeUrl: embedUrl || null,
    referer: embedUrl || null,
    // Prefer direct M3U8 stream over iframe — embed sites use Cloudflare bot
    // protection which blocks streams in cross-origin iframes. Only use iframe
    // when there is no direct stream URL available.
    preferEmbed: !streamUrl && Boolean(embedUrl),
  });

  // Normalize subtitles — Python returns tracks with .file field
  const subtitles = ensureArray(selected.subtitles ?? selected.tracks)
    .filter((t: JsonValue) => t.kind !== "thumbnails")
    .map((subtitle: JsonValue) => ({
      label: String(subtitle.lang || subtitle.label || subtitle.kind || "Subtitle"),
      lang: String(subtitle.lang || subtitle.label || subtitle.kind || "Unknown"),
      url: String(subtitle.file || subtitle.url || ""),
    }))
    .filter((s) => s.url);

  return {
    source: source.url || source.iframeUrl ? source : null,
    subtitles,
    serverOptions: entries.map((entry) => ({
      id: String(entry.name || "animekai"),
      label: String(entry.name || "AnimeKai"),
      provider: "animekai",
      category: entry.isDub ? "dub" : "sub",
    })),
    activeServerId: String(selected.name || entries[0]?.name || ""),
    intro: selected.intro
      ? { start: Number(selected.intro[0] ?? selected.intro.start ?? 0), end: Number(selected.intro[1] ?? selected.intro.end ?? 0) }
      : null,
    outro: selected.outro
      ? { start: Number(selected.outro[0] ?? selected.outro.start ?? 0), end: Number(selected.outro[1] ?? selected.outro.end ?? 0) }
      : null,
  };
}

async function fetchAnimeKaiServerEntries(
  episodeId: string,
  dubbed: boolean,
): Promise<AnimeKaiServerEntry[]> {
  return cacheFetch(
    `animekai:servers:${episodeId}:${dubbed ? "dub" : "sub"}`,
    async () => {
      const response = await apiJson<JsonValue>(`/api/servers/${encodeURIComponent(episodeId)}`, {
        noStore: true,
      });
      const serversByGroup = (response.servers || {}) as Record<string, JsonValue[]>;
      const primaryGroup = dubbed ? "dub" : "sub";
      const secondaryGroup = dubbed ? "sub" : "dub";
      const selectedGroup =
        ensureArray(serversByGroup[primaryGroup]).length > 0 ? primaryGroup : secondaryGroup;
      const selectedCategory: AnimeKaiServerEntry["category"] = selectedGroup === "dub" ? "dub" : "sub";
      return ensureArray(serversByGroup[selectedGroup]).map((entry) => ({
        name: String(entry.name || entry.server_name || "AnimeKai"),
        serverId: String(entry.server_id || entry.serverId || ""),
        episodeId: String(entry.episode_id || entry.episodeId || episodeId),
        linkId: String(entry.link_id || entry.linkId || ""),
        category: selectedCategory,
      })).filter((entry) => entry.linkId);
    },
    {
      freshMs: WATCH_SESSION_FRESH_MS,
      staleMs: WATCH_SESSION_STALE_MS,
      expireMs: WATCH_SESSION_EXPIRE_MS,
      shouldCache: (entries) => Array.isArray(entries) && entries.length > 0,
    },
  );
}

async function fetchAnimeKaiEmbedSource(linkId: string): Promise<JsonValue> {
  return cacheFetch(
    `animekai:embed:${linkId}`,
    async () => apiJson<JsonValue>(`/api/embed/${encodeURIComponent(linkId)}`, { noStore: true }),
    {
      freshMs: WATCH_SESSION_FRESH_MS,
      staleMs: WATCH_SESSION_STALE_MS,
      expireMs: WATCH_SESSION_EXPIRE_MS,
      shouldCache: (payload) => Boolean((payload as JsonValue)?.embed_url),
    },
  );
}

async function fetchAnimeKaiEmbedWatchSession(
  episodeId: string,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  const entries = await fetchAnimeKaiServerEntries(episodeId, dubbed);
  const selected =
    entries.find((entry) => entry.name.toLowerCase() === String(requestedServer || "").toLowerCase()) ||
    entries[0];

  if (!selected) {
    return {
      source: null,
      subtitles: [],
      serverOptions: [],
      activeServerId: null,
      intro: null,
      outro: null,
    };
  }

  const embed = await fetchAnimeKaiEmbedSource(selected.linkId);
  const embedUrl = String(embed.embed_url || "");
  const skip = embed.skip || {};
  const source = normalizeStreamSourceFromUrl({
    label: selected.name || "AnimeKai",
    url: null,
    iframeUrl: embedUrl || null,
    referer: embedUrl || null,
    preferEmbed: Boolean(embedUrl),
  });

  return {
    source: source.iframeUrl ? source : null,
    subtitles: [],
    serverOptions: entries.map((entry) => ({
      id: entry.name,
      label: entry.name,
      provider: "animekai",
      category: entry.category,
    })),
    activeServerId: selected.name,
    intro: skip.intro
      ? { start: Number(skip.intro[0] ?? skip.intro.start ?? 0), end: Number(skip.intro[1] ?? skip.intro.end ?? 0) }
      : null,
    outro: skip.outro
      ? { start: Number(skip.outro[0] ?? skip.outro.start ?? 0), end: Number(skip.outro[1] ?? skip.outro.end ?? 0) }
      : null,
  };
}


async function fetchDesidubWatchSession(
  episodeId: string,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  const response = await apiJson<JsonValue>(`/api/desidub/watch/${encodeURIComponent(episodeId)}`, {
    noStore: true,
  });
  const sources = ensureArray(response.sources);
  const selected =
    sources.find((entry) => String(entry.name || "").toLowerCase() === String(requestedServer || "").toLowerCase()) ||
    sources[0] ||
    {};
  const referer = response.headers?.Referer || response.headers?.referer || null;
  const source = normalizeStreamSourceFromUrl({
    label: selected.name || "DesiDub",
    url: selected.isEmbed ? null : selected.url || null,
    iframeUrl: selected.isEmbed ? selected.url || null : null,
    referer,
    forceProxy: Boolean(selected.isM3U8),
  });

  return {
    source: source.url || source.iframeUrl ? source : null,
    subtitles: [],
    serverOptions: sources.map((entry) => ({
      id: String(entry.name || "desidub"),
      label: String(entry.name || "DesiDub"),
      provider: "desidub",
      category: entry.category || "dub",
    })),
    activeServerId: String(selected.name || sources[0]?.name || ""),
  };
}

async function fetchProviderWatch(
  provider: ProviderId,
  episodeId: string,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  return measureAsync(
    "anime.provider.watch",
    {
      provider,
      dubbed: dubbed ? "dub" : "sub",
      server: requestedServer || "auto",
    },
    async () => {
      switch (provider) {
        case "animekai":
          return fetchAnimeKaiWatchSession(episodeId, dubbed, requestedServer);
        case "desidub":
          return fetchDesidubWatchSession(episodeId, requestedServer);
        default:
          throw new Error(`Provider ${provider} is not supported for streaming`);
      }
    },
  );
}

async function fetchProviderFastWatch(
  provider: ProviderId,
  episodeId: string,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  return measureAsync(
    "anime.provider.fast_watch",
    {
      provider,
      dubbed: dubbed ? "dub" : "sub",
      server: requestedServer || "auto",
    },
    async () => {
      switch (provider) {
        case "animekai":
          return fetchAnimeKaiEmbedWatchSession(episodeId, dubbed, requestedServer);
        case "desidub":
          return fetchDesidubWatchSession(episodeId, requestedServer);
        default:
          throw new Error(`Provider ${provider} is not supported for streaming`);
      }
    },
  );
}

export async function getWatchSession(input: {
  animeId: string;
  episodeNumber?: number;
  provider?: ProviderId | null;
  episodeId?: string | null;
  dubbed?: boolean;
  server?: string | null;
}): Promise<WatchSessionModel> {
  return measureAsync(
    "anime.watch_session.full",
    {
      requestedProvider: input.provider || "auto",
      dubbed: input.dubbed ? "dub" : "sub",
      server: input.server || "auto",
    },
    async () => {
      const detail = await getAnimeDetailModel(input.animeId, input.provider || null, {
        resolveProviderFallbacks: true,
        mergeEpisodeProviders: true,
      });
      const preferredProvider = input.provider || detail.activeProvider;
      const order = buildProviderOrder(preferredProvider, detail.activeProvider);
      const targetEpisode =
        detail.episodes.find((episode) => episode.number === Number(input.episodeNumber || 1)) ||
        detail.episodes[0];
      const episodeAvailableProviders = resolveEpisodeAvailableProviders(targetEpisode, detail.availableProviders);

      const watchAttempts: WatchAttempt[] = [];

      if (!targetEpisode) {
        recordCounter("anime.watch_session.failure", 1, { mode: "full", reason: "episode_missing" });
        return {
          anime: detail.anime,
          episode: {
            number: Number(input.episodeNumber || 1),
            title: `Episode ${input.episodeNumber || 1}`,
            idByProvider: {},
            availableProviders: [],
          },
          episodes: detail.episodes,
          provider: preferredProvider,
          availableProviders: episodeAvailableProviders,
          attempts: detail.attempts,
          watchAttempts: [{ provider: preferredProvider, ok: false, reason: "Episode not found" }],
          source: null,
          subtitles: [],
          serverOptions: [],
          activeServerId: null,
          seasons: detail.seasons,
          dubbed: Boolean(input.dubbed),
          fallbackHistory: ["Episode not found in current provider map"],
        };
      }

      for (const provider of order) {
        const providerEpisodeId =
          (provider === preferredProvider && input.episodeId) || targetEpisode.idByProvider[provider];
        if (!providerEpisodeId) {
          watchAttempts.push({ provider, ok: false, reason: "Episode unavailable in provider" });
          recordCounter("anime.provider.failure", 1, { mode: "full", provider, reason: "episode_unavailable" });
          continue;
        }

        try {
          const session = await fetchProviderWatch(provider, providerEpisodeId, Boolean(input.dubbed), input.server || null);
          if (!session.source) {
            watchAttempts.push({ provider, server: input.server || undefined, ok: false, reason: "No playable source returned" });
            recordCounter("anime.provider.failure", 1, { mode: "full", provider, reason: "no_source" });
            continue;
          }

          if (provider !== preferredProvider) {
            recordCounter("anime.fallback.used", 1, {
              mode: "full",
              preferredProvider,
              provider,
            });
          }

          recordCounter("anime.watch_session.success", 1, {
            mode: "full",
            provider,
          });

          return {
            anime: detail.anime,
            episode: targetEpisode,
            episodes: detail.episodes,
            seasons: detail.seasons,
            provider,
            availableProviders: episodeAvailableProviders,
            attempts: detail.attempts,
            watchAttempts: [...watchAttempts, { provider, server: input.server || undefined, ok: true, reason: "Playback ready" }],
            source: session.source,
            subtitles: session.subtitles,
            serverOptions: session.serverOptions,
            activeServerId: session.activeServerId,
            dubbed: Boolean(input.dubbed),
            intro: session.intro || null,
            outro: session.outro || null,
            fallbackHistory: watchAttempts.map((attempt) => `${attempt.provider}: ${attempt.reason}`),
          };
        } catch (error) {
          recordCounter("anime.provider.failure", 1, { mode: "full", provider, reason: "exception" });
          watchAttempts.push({
            provider,
            server: input.server || undefined,
            ok: false,
            reason: error instanceof Error ? error.message : "Failed to resolve watch session",
          });
        }
      }

      invalidateAnimeRuntimeCaches(input.animeId);
      recordCounter("anime.watch_session.failure", 1, { mode: "full", reason: "all_providers_failed" });
      recordLog(
        "warn",
        "anime.watch_session.exhausted",
        {
          mode: "full",
          requestedProvider: preferredProvider,
          episodeNumber: input.episodeNumber || 1,
        },
        watchAttempts.map((attempt) => `${attempt.provider}:${attempt.reason}`).join(" | "),
      );

      return {
        anime: detail.anime,
        episode: targetEpisode,
        episodes: detail.episodes,
        seasons: detail.seasons,
        provider: preferredProvider,
        availableProviders: episodeAvailableProviders,
        attempts: detail.attempts,
        watchAttempts,
        source: null,
        subtitles: [],
        serverOptions: [],
        activeServerId: null,
        dubbed: Boolean(input.dubbed),
        fallbackHistory: watchAttempts.map((attempt) => `${attempt.provider}: ${attempt.reason}`),
      };
    },
  );
}

export async function getFastWatchSession(input: {
  animeId: string;
  episodeNumber?: number;
  provider?: ProviderId | null;
  episodeId?: string | null;
  dubbed?: boolean;
  server?: string | null;
}): Promise<WatchSessionModel> {
  const cacheKey = `watch-session:${input.animeId}:ep${input.episodeNumber || 1}:${input.dubbed ? "dub" : "sub"}:${input.server || "auto"}:${input.provider || "auto"}`;

  return cacheFetch(
    cacheKey,
    async () =>
      measureAsync(
        "anime.watch_session.fast",
        {
          requestedProvider: input.provider || "auto",
          dubbed: input.dubbed ? "dub" : "sub",
          server: input.server || "auto",
        },
        async () => {
          const detail = await getAnimeDetailModel(input.animeId, input.provider || null, {
            resolveProviderFallbacks: true,
            mergeEpisodeProviders: true,
          });
          const preferredProvider = input.provider || detail.activeProvider;
          const order = buildProviderOrder(preferredProvider, detail.activeProvider);
          const targetEpisode =
            detail.episodes.find((episode) => episode.number === Number(input.episodeNumber || 1)) ||
            detail.episodes[0];
          const episodeAvailableProviders = resolveEpisodeAvailableProviders(targetEpisode, detail.availableProviders);

          const watchAttempts: WatchAttempt[] = [];

          if (!targetEpisode) {
            recordCounter("anime.watch_session.failure", 1, { mode: "fast", reason: "episode_missing" });
            return {
              anime: detail.anime,
              episode: {
                number: Number(input.episodeNumber || 1),
                title: `Episode ${input.episodeNumber || 1}`,
                idByProvider: {},
                availableProviders: [],
              },
              episodes: detail.episodes,
              seasons: detail.seasons,
              provider: preferredProvider,
              availableProviders: episodeAvailableProviders,
              attempts: detail.attempts,
              watchAttempts: [{ provider: preferredProvider, ok: false, reason: "Episode not found" }],
              source: null,
              subtitles: [],
              serverOptions: [],
              activeServerId: null,
              dubbed: Boolean(input.dubbed),
              fallbackHistory: ["Episode not found in current provider map"],
            };
          }

          for (const provider of order) {
            const providerEpisodeId =
              (provider === preferredProvider && input.episodeId) || targetEpisode.idByProvider[provider];
            if (!providerEpisodeId) {
              watchAttempts.push({ provider, ok: false, reason: "Episode unavailable in provider" });
              recordCounter("anime.provider.failure", 1, { mode: "fast", provider, reason: "episode_unavailable" });
              continue;
            }

            try {
              const session = await fetchProviderFastWatch(provider, providerEpisodeId, Boolean(input.dubbed), input.server || null);
              if (!session.source) {
                watchAttempts.push({ provider, server: input.server || undefined, ok: false, reason: "No fast session available" });
                recordCounter("anime.provider.failure", 1, { mode: "fast", provider, reason: "no_source" });
                continue;
              }

              if (provider !== preferredProvider) {
                recordCounter("anime.fallback.used", 1, {
                  mode: "fast",
                  preferredProvider,
                  provider,
                });
              }

              recordCounter("anime.watch_session.success", 1, {
                mode: "fast",
                provider,
              });

              return {
                anime: detail.anime,
                episode: targetEpisode,
                episodes: detail.episodes,
                seasons: detail.seasons,
                provider,
                availableProviders: episodeAvailableProviders,
                attempts: detail.attempts,
                watchAttempts: [...watchAttempts, { provider, server: input.server || undefined, ok: true, reason: "Embed session ready" }],
                source: session.source,
                subtitles: session.subtitles,
                serverOptions: session.serverOptions,
                activeServerId: session.activeServerId,
                dubbed: Boolean(input.dubbed),
                intro: session.intro || null,
                outro: session.outro || null,
                fallbackHistory: watchAttempts.map((attempt) => `${attempt.provider}: ${attempt.reason}`),
              };
            } catch (error) {
              recordCounter("anime.provider.failure", 1, { mode: "fast", provider, reason: "exception" });
              watchAttempts.push({
                provider,
                server: input.server || undefined,
                ok: false,
                reason: error instanceof Error ? error.message : "Failed to build fast watch session",
              });
            }
          }

          invalidateAnimeRuntimeCaches(input.animeId);
          recordCounter("anime.watch_session.failure", 1, { mode: "fast", reason: "all_providers_failed" });
          return {
            anime: detail.anime,
            episode: targetEpisode,
            episodes: detail.episodes,
            seasons: detail.seasons,
            provider: preferredProvider,
            availableProviders: episodeAvailableProviders,
            attempts: detail.attempts,
            watchAttempts,
            source: null,
            subtitles: [],
            serverOptions: [],
            activeServerId: null,
            dubbed: Boolean(input.dubbed),
            fallbackHistory: watchAttempts.map((attempt) => `${attempt.provider}: ${attempt.reason}`),
          };
        },
      ),
    {
      freshMs: WATCH_SESSION_FRESH_MS,
      staleMs: WATCH_SESSION_STALE_MS,
      expireMs: WATCH_SESSION_EXPIRE_MS,
      shouldCache: (value) => shouldCacheWatchShell(value as WatchSessionModel),
    },
  );
}

/**
 * FAST path: Returns everything needed to render the watch page shell
 * (anime info, episodes, metadata) WITHOUT resolving the stream source.
 * Uses the cached getAnimeDetailModel, so repeat visits are instant.
 */
export async function getQuickWatchSession(input: {
  animeId: string;
  episodeNumber?: number;
  provider?: ProviderId | null;
  episodeId?: string | null;
  dubbed?: boolean;
}): Promise<WatchSessionModel> {
  const session = await getFastWatchSession({
    ...input,
    server: null,
  });

  if (session.source) {
    return session;
  }

  return {
    ...session,
    fallbackHistory: session.fallbackHistory.length > 0 ? session.fallbackHistory : ["Stream pending — resolving on client"],
  };
}

/**
 * SLOW path: Resolves the actual stream source + subtitles + server options.
 * Called from the client via /api/resolve-source after the page renders.
 * Results are cached for 5 minutes.
 */
export async function resolveStreamSource(input: {
  animeId: string;
  episodeNumber?: number;
  provider?: ProviderId | null;
  episodeId?: string | null;
  dubbed?: boolean;
  server?: string | null;
}): Promise<{
  source: StreamSource | null;
  subtitles: SubtitleTrack[];
  serverOptions: ServerOption[];
  activeServerId: string | null;
  provider: ProviderId;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  watchAttempts: WatchAttempt[];
}> {
  const cacheKey = `stream:${input.animeId}:ep${input.episodeNumber || 1}:${input.dubbed ? "dub" : "sub"}:${input.server || "auto"}:${input.provider || "auto"}`;

  return cacheFetch(cacheKey, async () => measureAsync(
    "anime.stream.resolve",
    {
      requestedProvider: input.provider || "auto",
      dubbed: input.dubbed ? "dub" : "sub",
      server: input.server || "auto",
    },
    async () => {
      const detail = await getAnimeDetailModel(input.animeId, input.provider || null, {
        resolveProviderFallbacks: true,
        mergeEpisodeProviders: true,
      });
      const preferredProvider = input.provider || detail.activeProvider;
      const order = buildProviderOrder(preferredProvider, detail.activeProvider);
      const targetEpisode =
        detail.episodes.find((ep) => ep.number === Number(input.episodeNumber || 1)) ||
        detail.episodes[0];

      if (!targetEpisode) {
        recordCounter("anime.stream.failure", 1, { reason: "episode_missing" });
        return {
          source: null, subtitles: [], serverOptions: [], activeServerId: null,
          provider: preferredProvider,
          watchAttempts: [{ provider: preferredProvider, ok: false, reason: "Episode not found" }],
        };
      }

      const watchAttempts: WatchAttempt[] = [];
      for (const provider of order) {
        const providerEpisodeId =
          (provider === preferredProvider && input.episodeId) || targetEpisode.idByProvider[provider];
        if (!providerEpisodeId) {
          watchAttempts.push({ provider, ok: false, reason: "Episode unavailable in provider" });
          recordCounter("anime.provider.failure", 1, { mode: "resolve", provider, reason: "episode_unavailable" });
          continue;
        }
        try {
          const session = await fetchProviderWatch(provider, providerEpisodeId, Boolean(input.dubbed), input.server || null);
          if (!session.source) {
            watchAttempts.push({ provider, server: input.server || undefined, ok: false, reason: "No playable source" });
            recordCounter("anime.provider.failure", 1, { mode: "resolve", provider, reason: "no_source" });
            continue;
          }

          if (provider !== preferredProvider) {
            recordCounter("anime.fallback.used", 1, {
              mode: "resolve",
              preferredProvider,
              provider,
            });
          }

          recordCounter("anime.stream.success", 1, { provider });
          return {
            source: session.source,
            subtitles: session.subtitles,
            serverOptions: session.serverOptions,
            activeServerId: session.activeServerId,
            provider,
            intro: session.intro || null,
            outro: session.outro || null,
            watchAttempts: [...watchAttempts, { provider, ok: true, reason: "Playback ready" }],
          };
        } catch (error) {
          recordCounter("anime.provider.failure", 1, { mode: "resolve", provider, reason: "exception" });
          watchAttempts.push({ provider, ok: false, reason: error instanceof Error ? error.message : "Failed" });
        }
      }

      invalidateAnimeRuntimeCaches(input.animeId);
      recordCounter("anime.stream.failure", 1, { reason: "all_providers_failed" });
      recordLog(
        "warn",
        "anime.stream.exhausted",
        {
          requestedProvider: preferredProvider,
          episodeNumber: input.episodeNumber || 1,
        },
        watchAttempts.map((attempt) => `${attempt.provider}:${attempt.reason}`).join(" | "),
      );
      return {
        source: null, subtitles: [], serverOptions: [], activeServerId: null,
        provider: preferredProvider, watchAttempts,
      };
    },
  ), {
    freshMs: 5 * 60 * 1000,      // 5 min fresh
    staleMs: 15 * 60 * 1000,     // 15 min stale-while-revalidate
    expireMs: 30 * 60 * 1000,    // 30 min hard expire
    shouldCache: (value) => shouldCacheStreamResolution(value as { source: StreamSource | null }),
  });
}
