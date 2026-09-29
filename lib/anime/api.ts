import { cache } from "react";
import { Prisma } from "@prisma/client";
import { cacheFetch, cacheInvalidatePrefix, runAfterResponse } from "@/lib/cache";
import { measureAsync, recordCounter, recordLog } from "@/lib/observability";
import { anilistTitle, getAnilistDetail, type AnilistMedia } from "@/lib/anilist/api";
import { decryptEmbed } from "./reanime-decrypt";
import { buildDashProxyUrl, createDashProxyToken } from "./dash-proxy";
import { probeStreamHealth } from "./stream-health";
import { normalizeEpisodeDescription, type EpisodeDisplayMetadata } from "./episode-metadata";
import {
  ANIVEXA_DISCOVERY_PROVIDERS,
  ANIVEXA_STREAM_PROVIDERS,
  PROVIDERS,
  type AnivexaWorkerProvider,
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
  type ServerHealthResult,
  type StreamSource,
  type SubtitleTrack,
  type WatchAttempt,
  type WatchSessionModel,
} from "./types";
import {
  bestTitleMatch,
  buildProviderOrder,
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
import { buildProxyUrl } from "@/lib/proxy/build";

export const LOCAL_ANIME_API_BASE_URL = "http://localhost:5000";
export const PRODUCTION_ANIME_API_BASE_URL = "https://animekai-api-production-a143.up.railway.app";

// Anivexa streaming aggregator, hosted on Render or Cloudflare Workers.
export const DEFAULT_ANIVEXA_WORKER_URL = "https://tatakai-anivexa.tatakai-anime.workers.dev";

export function resolveAnivexaWorkerUrl(
  env?: { ANIVEXA_API_BASE_URL?: string; NEXT_PUBLIC_ANIVEXA_WORKER_URL?: string },
): string {
  const configuredUrl = env
    ? env.ANIVEXA_API_BASE_URL || env.NEXT_PUBLIC_ANIVEXA_WORKER_URL
    : process.env.ANIVEXA_API_BASE_URL || process.env.NEXT_PUBLIC_ANIVEXA_WORKER_URL;
  return (configuredUrl || DEFAULT_ANIVEXA_WORKER_URL).replace(/\/+$/, "");
}

export const ANIVEXA_WORKER_URL = resolveAnivexaWorkerUrl();

type AniviexaProvider = "reanime" | "anikoto" | "animegg" | "anineko";
const ANIVEXA_PROVIDERS: AniviexaProvider[] = ["reanime", "anikoto", "animegg", "anineko"];
const ANIVEXA_PROVIDER_SET = new Set<ProviderId>(ANIVEXA_PROVIDERS);
const ANIVEXA_WORKER_PROVIDERS: AnivexaWorkerProvider[] = [...ANIVEXA_STREAM_PROVIDERS];
const ANIVEXA_AUTO_SUB_PROVIDERS: AnivexaWorkerProvider[] = ["aniwaves", "anikoto"];
const ANIVEXA_AUTO_DUB_PROVIDERS: AnivexaWorkerProvider[] = ["aniwaves", "anikoto"];
const ANIVEXA_AVAILABILITY_PROVIDERS: AnivexaWorkerProvider[] = [
  "anikoto", "anineko",
];
const ANIVEXA_WORKER_WATCH_ALIAS: Partial<Record<AnivexaWorkerProvider, AnivexaWorkerProvider>> = {
  anikoto: "anikoto",
};
const ANIVEXA_DISPLAY_NAMES: Record<AnivexaWorkerProvider, string> = {
  animegg: "Nexus",
  anineko: "Prism",
  anikoto: "Solaris",
  reanime: "Frost",
  anidbapp: "Atlas",
  anizone: "Zone",
  animenosub: "Mori",
  anibd: "Nova",
  senshi: "Kage",
  aniwaves: "Waves",
  kaa: "Kick",
  animedunya: "Dunya",
  mkissa: "Kissa",
  animeonsen: "Onsen",
};
const ANIVEXA_HARD_SUB_PROVIDERS = new Set<AnivexaWorkerProvider>(["animegg"]);
const ANIVEXA_TRANSPORT_PRIORITY: Record<NonNullable<ServerOption["transport"]>, number> = {
  hls: 0,
  mp4: 1,
  dash: 2,
  embed: 3,
};

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
const EPISODE_ARTWORK_REVALIDATE_SECONDS = 24 * 60 * 60;
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

type AnivexaAggregateBucket = {
  provider: AnivexaWorkerProvider;
  label: string;
  internal: any[];
  embed: any[];
  subtitles: any[];
  payload: any;
  download: string | null;
  subType: "soft" | "hard" | "unknown";
};

type AnivexaAggregateData = {
  buckets: AnivexaAggregateBucket[];
  serverOptions: ServerOption[];
  fetchedAt: number;
};

type AnivexaServerEntry = {
  bucket: AnivexaAggregateBucket;
  stream: any;
  option: ServerOption;
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
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
  } | null;
  anilistId?: number | null;
  malId?: number | null;
  color?: string | null;
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
    nextAiringEpisode: input.nextAiringEpisode ?? null,
    anilistId: input.anilistId ?? null,
    malId: input.malId ?? null,
    color: input.color ?? null,
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

/**
 * Presentation fields for which the AniList-derived seed is the authority.
 * Everything else (episode data, provider ids, stream/server/playback fields)
 * stays with the provider bundle that actually serves playback.
 */
const SEED_PRESENTATION_FIELDS = ["poster", "banner", "title", "description"] as const;

/**
 * Field-wise merge of a provider bundle's anime with the AniList-derived seed.
 *
 * The provider bundle remains the base (so playback/episode fields are
 * untouched), but for the presentation fields above the seed wins whenever it
 * actually has a non-empty value. If the seed value is absent or blank we keep
 * the provider value, so a field that used to render never goes blank.
 */
function mergePresentationFields(
  providerAnime: CatalogAnime,
  seedAnime: CatalogAnime | null | undefined,
  providerIds: Partial<Record<ProviderId, string>>,
  routeId?: string,
): CatalogAnime {
  const merged = withProviderIds(providerAnime, providerIds, routeId);
  if (!seedAnime || seedAnime === providerAnime) return merged;

  for (const field of SEED_PRESENTATION_FIELDS) {
    const seedValue = seedAnime[field];
    if (typeof seedValue === "string" && seedValue.trim().length > 0) {
      merged[field] = seedValue;
    }
  }

  return merged;
}

function parseAnilistPassthroughId(providerId: string): number | null {
  if (providerId.startsWith("anilist:")) {
    return numberOrNull(providerId.slice("anilist:".length));
  }
  if (providerId.startsWith("anilist~")) {
    return numberOrNull(providerId.slice("anilist~".length));
  }
  return null;
}

/**
 * Returns true if this routeId is an anilist~ passthrough route
 * and the anime has an anilistId or malId we can use for embed URLs.
 */
function canUseDirectEmbed(anime: CatalogAnime): boolean {
  return Boolean(anime.anilistId || anime.malId);
}

function isAnimeEpisodeReleased(anime: CatalogAnime, episodeNumber: number): boolean {
  const status = String(anime.status || "").toUpperCase().replace(/[ -]+/g, "_");
  if (status.includes("NOT_YET_RELEASED") || status.includes("UPCOMING")) return false;
  if (status.includes("RELEASING") && anime.subCount != null && episodeNumber > anime.subCount) return false;
  if (status.includes("FINISHED") && anime.episodeCount != null && episodeNumber > anime.episodeCount) return false;
  return true;
}

/**
 * Build a synthetic episode for anilist passthrough routes where
 * no scraped episode list exists. Allows custom embed (MegaPlay etc.)
 * to serve via AniList ID + episode number.
 */
function makeSyntheticEpisode(episodeNumber: number): EpisodeModel {
  return {
    number: episodeNumber,
    title: `Episode ${episodeNumber}`,
    idByProvider: {},
    availableProviders: [],
  };
}

export function knownEpisodeCountForNavigation(
  anime: Pick<CatalogAnime, "episodeCount" | "subCount" | "dubCount">,
): number {
  return Math.min(2000, Math.max(
    anime.episodeCount || 0,
    anime.subCount || 0,
    anime.dubCount || 0,
  ));
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
    const airedEpisodeCount = await resolveAiredEpisodeCount(media);
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
        subCount: airedEpisodeCount ?? null,
        dubCount: null,
        episodeCount: media.episodes ?? null,
        nextAiringEpisode: media.nextAiringEpisode
          ? {
              episode: media.nextAiringEpisode.episode,
              airingAt: media.nextAiringEpisode.airingAt,
            }
          : null,
        anilistId: media.id,
        malId: media.idMal,
        color: media.coverImage.color,
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
      watchHref: `/anime/${routeId}/watch?ep=1`,
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
      watchHref: `/anime/${routeId}/watch?ep=1`,
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
      watchHref: `/anime/${resolvedRouteId}/watch?ep=1`,
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
            watchHref: routeId ? `/anime/${routeId}/watch?ep=1` : null,
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
const WATCH_SESSION_FRESH_MS = 5 * 60 * 1000;
const WATCH_SESSION_STALE_MS = 20 * 60 * 1000;
const WATCH_SESSION_EXPIRE_MS = 30 * 60 * 1000;

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
  cacheInvalidatePrefix(`watch-session:${animeId}`, { persistent: false });
  cacheInvalidatePrefix(`stream:${animeId}`, { persistent: false });
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

    const existingTitleIsGeneric = /^episode\s+\d+(?:\.\d+)?$/i.test(existing.title.trim());
    const incomingTitleIsSpecific = episode.title && !/^episode\s+\d+(?:\.\d+)?$/i.test(episode.title.trim());
    if (!existing.title || (existingTitleIsGeneric && incomingTitleIsSpecific)) {
      existing.title = episode.title;
    }
    existing.image = existing.image || episode.image || null;
    existing.description = existing.description || normalizeEpisodeDescription(episode.description);
    existing.airDate = existing.airDate || episode.airDate || null;
    existing.isFiller = existing.isFiller || episode.isFiller;
    existing.isSubbed = existing.isSubbed ?? episode.isSubbed;
    existing.isDubbed = existing.isDubbed ?? episode.isDubbed;
    existing.idByProvider = { ...existing.idByProvider, ...episode.idByProvider };
    existing.availableProviders = Array.from(new Set([...existing.availableProviders, ...episode.availableProviders]));
  }
}

export function normalizeAniZipEpisodesPayload(data: JsonValue): EpisodeModel[] {
  if (typeof data === "string") {
    try {
      return normalizeAniZipEpisodesPayload(JSON.parse(data) as JsonValue);
    } catch {
      return [];
    }
  }
  const rawEpisodes = data?.episodes;
  if (!rawEpisodes || typeof rawEpisodes !== "object" || Array.isArray(rawEpisodes)) return [];

  return Object.entries(rawEpisodes)
    .map<EpisodeModel | null>(([key, rawEpisode]) => {
      const episode = rawEpisode && typeof rawEpisode === "object"
        ? rawEpisode as JsonValue
        : {};
      const number = Number(episode.episode ?? episode.number ?? key);
      if (!Number.isFinite(number) || number <= 0) return null;

      const title = episode.title && typeof episode.title === "object"
        ? episode.title as JsonValue
        : {};

      return {
        number,
        title: pickFirstNonEmpty(
          title.en,
          title["x-jat"],
          title.ja,
          typeof episode.title === "string" ? episode.title : "",
          `Episode ${number}`,
        ),
        image: pickFirstNonEmpty(episode.image, episode.thumbnail) || null,
        description: normalizeEpisodeDescription(pickFirstNonEmpty(episode.overview, episode.description)),
        airDate: pickFirstNonEmpty(episode.airDate, episode.airdate) || null,
        isFiller: Boolean(episode.filler),
        idByProvider: {},
        availableProviders: [],
      } satisfies EpisodeModel;
    })
    .filter((episode): episode is EpisodeModel => episode !== null)
    .sort((left, right) => left.number - right.number);
}

interface AniZipEpisodeBundle {
  episodes: EpisodeModel[];
  kitsuId: number | null;
  tvdbShowId: number | null;
  title: string | null;
  premiereYear: string | null;
  premiereDate: string | null;
}

async function fetchAniZipEpisodeArtwork(anilistId: number): Promise<AniZipEpisodeBundle> {
  try {
    const response = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Tatakai-Frontend/1.0",
      },
      // Only the validated normalized result below is cached. A transient 200
      // with an empty body, timeout, or upstream error must be retried rather
      // than being stored by Next's data cache for a full day.
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return { episodes: [], kitsuId: null, tvdbShowId: null, title: null, premiereYear: null, premiereDate: null };
    const payload = await response.json() as JsonValue;
    const normalizedPayload = typeof payload === "string"
      ? (() => {
          try {
            return JSON.parse(payload) as JsonValue;
          } catch {
            return {} as JsonValue;
          }
        })()
      : payload;
    const kitsuId = Number(normalizedPayload?.mappings?.kitsu_id);
    const title = pickFirstNonEmpty(
      normalizedPayload?.titles?.en,
      normalizedPayload?.titles?.["x-jat"],
      normalizedPayload?.titles?.ja,
    ) || null;
    const firstEpisode = normalizedPayload?.episodes?.["1"] || normalizedPayload?.episodes?.[1];
    const tvdbShowId = Number(firstEpisode?.tvdbShowId);
    const premiereDate = pickFirstNonEmpty(firstEpisode?.airDate, firstEpisode?.airdate) || null;
    const premiereYear = parseYear(premiereDate);
    return {
      episodes: normalizeAniZipEpisodesPayload(normalizedPayload),
      kitsuId: Number.isInteger(kitsuId) && kitsuId > 0 ? kitsuId : null,
      tvdbShowId: Number.isInteger(tvdbShowId) && tvdbShowId > 0 ? tvdbShowId : null,
      title,
      premiereYear,
      premiereDate,
    };
  } catch {
    return { episodes: [], kitsuId: null, tvdbShowId: null, title: null, premiereYear: null, premiereDate: null };
  }
}

async function getAniZipEpisodeBundle(anilistId: number): Promise<AniZipEpisodeBundle> {
  return cacheFetch(
    `anizip-episode-bundle:${anilistId}`,
    () => fetchAniZipEpisodeArtwork(anilistId),
    {
      freshMs: EPISODE_ARTWORK_REVALIDATE_SECONDS * 1000,
      expireMs: EPISODE_ARTWORK_REVALIDATE_SECONDS * 1000,
      shouldCache: (value) => Boolean(
        value &&
        typeof value === "object" &&
        "episodes" in value &&
        Array.isArray(value.episodes) &&
        value.episodes.length > 0
      ),
    },
  );
}

/**
 * Best-effort episode display metadata for the deferred watch-page request.
 * The initial watch shell never awaits this loader. Non-empty normalized
 * responses are cached, while transient misses remain retryable.
 */
export async function getAniZipEpisodeMetadata(
  anilistId: number,
): Promise<EpisodeDisplayMetadata[]> {
  if (!Number.isInteger(anilistId) || anilistId <= 0) return [];

  const { episodes } = await getAniZipEpisodeBundle(anilistId);
  return episodes.map((episode) => ({
    number: episode.number,
    title: episode.title || null,
    image: episode.image || null,
    description: episode.description || null,
    airDate: episode.airDate || null,
  }));
}

const KITSU_EPISODE_PAGE_SIZE = 20;
const KITSU_EPISODE_RANGE_SIZE = 100;

function normalizeKitsuEpisodePayload(payload: JsonValue): EpisodeDisplayMetadata[] {
  return ensureArray(payload?.data).flatMap((entry) => {
    const attributes = entry?.attributes || {};
    const number = Number(attributes.number);
    if (!Number.isFinite(number) || number <= 0) return [];

    return [{
      number,
      title: pickFirstNonEmpty(attributes.canonicalTitle, attributes.titles?.en_jp, attributes.titles?.en_us) || null,
      image: pickFirstNonEmpty(
        attributes.thumbnail?.original,
        attributes.thumbnail?.large,
        attributes.thumbnail?.medium,
      ) || null,
      thumbnail: pickFirstNonEmpty(
        attributes.thumbnail?.small,
        attributes.thumbnail?.medium,
        attributes.thumbnail?.large,
        attributes.thumbnail?.original,
      ) || null,
      description: normalizeEpisodeDescription(pickFirstNonEmpty(attributes.synopsis, attributes.description)),
      airDate: pickFirstNonEmpty(attributes.airdate) || null,
    } satisfies EpisodeDisplayMetadata];
  });
}

/**
 * Loads only the visible 100-episode range from Kitsu. This fills artwork gaps
 * for long-running shows without issuing dozens of requests for the full run.
 */
export async function getKitsuEpisodeMetadataRange(
  anilistId: number,
  rangeStart = 0,
): Promise<EpisodeDisplayMetadata[]> {
  if (!Number.isInteger(anilistId) || anilistId <= 0) return [];
  const normalizedStart = Math.max(0, Math.floor(rangeStart / KITSU_EPISODE_RANGE_SIZE) * KITSU_EPISODE_RANGE_SIZE);

  return cacheFetch(
    `kitsu-episode-metadata:${anilistId}:${normalizedStart}`,
    async () => {
      const { kitsuId } = await getAniZipEpisodeBundle(anilistId);
      if (!kitsuId) return [];

      const requests = Array.from(
        { length: KITSU_EPISODE_RANGE_SIZE / KITSU_EPISODE_PAGE_SIZE },
        (_, index) => {
          const offset = normalizedStart + index * KITSU_EPISODE_PAGE_SIZE;
          const url = `https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page%5Blimit%5D=${KITSU_EPISODE_PAGE_SIZE}&page%5Boffset%5D=${offset}`;
          return fetch(url, {
            headers: {
              Accept: "application/vnd.api+json",
              "User-Agent": "Tatakai-Frontend/1.0",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
          })
            .then(async (response) => response.ok
              ? normalizeKitsuEpisodePayload(await response.json() as JsonValue)
              : [] as EpisodeDisplayMetadata[])
            .catch(() => [] as EpisodeDisplayMetadata[]);
        },
      );

      const pages = await Promise.all(requests);
      return pages
        .flat()
        .filter((episode) => episode.number > normalizedStart && episode.number <= normalizedStart + KITSU_EPISODE_RANGE_SIZE)
        .sort((left, right) => left.number - right.number);
    },
    {
      freshMs: 24 * 60 * 60 * 1000,
      staleMs: 24 * 60 * 60 * 1000,
      expireMs: 24 * 60 * 60 * 1000,
      shouldCache: (value) => Array.isArray(value) && value.some((episode) => Boolean(episode?.image)),
    },
  );
}

const TVMAZE_EPISODE_RANGE_SIZE = 100;

function getTvMazeSearchTitles(title: string): string[] {
  const baseTitle = title
    .replace(/\s+(?:season|part|cour)\s*\d+\s*$/i, "")
    .replace(/\s+\d+(?:st|nd|rd|th)\s+season\s*$/i, "")
    .trim();
  return baseTitle && baseTitle !== title ? [title, baseTitle] : [title];
}

function normalizeTvMazeEpisodePayload(
  payload: unknown,
  premiereDate: string | null,
): EpisodeDisplayMetadata[] {
  const episodes = ensureArray(payload)
    .filter((entry) => entry?.type === "regular" && Number.isFinite(Number(entry?.number)))
    .sort((left, right) => {
      const airDateComparison = String(left?.airdate || "").localeCompare(String(right?.airdate || ""));
      return airDateComparison || Number(left?.id || 0) - Number(right?.id || 0);
    });
  // AniList models sequels and split cours as separate anime while TVMaze
  // commonly stores them as later seasons of one show. Align episode 1 using
  // its air date, then renumber that chronological slice for the AniList entry.
  const expectedPremiereTime = premiereDate ? Date.parse(premiereDate) : Number.NaN;
  let premiereIndex = -1;
  let smallestPremiereDifference = Number.POSITIVE_INFINITY;
  if (Number.isFinite(expectedPremiereTime)) {
    episodes.forEach((entry, index) => {
      const candidateTime = Date.parse(String(entry?.airdate || ""));
      const difference = Math.abs(candidateTime - expectedPremiereTime);
      if (Number.isFinite(candidateTime) && difference <= 14 * 24 * 60 * 60 * 1000 && difference < smallestPremiereDifference) {
        premiereIndex = index;
        smallestPremiereDifference = difference;
      }
    });

    // TVMaze commonly groups an entire franchise under one show ID. If it has
    // not indexed the AniList entry's actual premiere yet, returning episode 1
    // from the franchise would attach an older season's title, artwork and air
    // date to a new anime (for example, 2012 JoJo metadata on 2026 Steel Ball
    // Run). A missing matching premiere is a metadata miss, not permission to
    // fall back to the beginning of the linked TVMaze show.
    if (premiereIndex < 0) return [];
  }

  return episodes
    .slice(premiereIndex >= 0 ? premiereIndex : 0)
    .map((entry, index) => ({
      // TVMaze resets `number` each broadcast year for long-running anime.
      // Chronological regular episodes correspond to the absolute episode run.
      number: index + 1,
      title: pickFirstNonEmpty(entry?.name) || null,
      image: pickFirstNonEmpty(entry?.image?.original, entry?.image?.medium) || null,
      thumbnail: pickFirstNonEmpty(entry?.image?.medium, entry?.image?.original) || null,
      description: normalizeEpisodeDescription(
        String(entry?.summary || "").replace(/<[^>]*>/g, " "),
      ),
      airDate: pickFirstNonEmpty(entry?.airdate) || null,
      preferArtwork: Boolean(entry?.image?.original),
    }));
}

/**
 * Artwork fallback for long-running shows whose AniZip/Kitsu records are
 * incomplete. The full upstream response is cached, then only the requested
 * 100-episode range is returned to the watch UI.
 */
export async function getTvMazeEpisodeMetadataRange(
  anilistId: number,
  rangeStart = 0,
): Promise<EpisodeDisplayMetadata[]> {
  if (!Number.isInteger(anilistId) || anilistId <= 0) return [];
  const normalizedStart = Math.max(0, Math.floor(rangeStart / TVMAZE_EPISODE_RANGE_SIZE) * TVMAZE_EPISODE_RANGE_SIZE);
  const aniZipBundle = await getAniZipEpisodeBundle(anilistId);

  const allEpisodes = await cacheFetch(
    // v5 invalidates TVMaze records cached before the premiere-alignment
    // guard. Those v4 entries can contain an older franchise season (for
    // example 2012 JoJo metadata for 2026 Steel Ball Run) and must never be
    // served from memory or persistent KV after the validator was fixed.
    `tvmaze-episode-metadata:v5:${anilistId}`,
    async () => {
      const { title, premiereYear, premiereDate, tvdbShowId } = aniZipBundle;
      if (!title) return [];

      const requestOptions = {
        headers: { Accept: "application/json", "User-Agent": "Tatakai-Frontend/1.0" },
        cache: "no-store" as const,
        signal: AbortSignal.timeout(5_000),
      };

      const linkedShow = tvdbShowId
        ? await fetch(`https://api.tvmaze.com/lookup/shows?thetvdb=${tvdbShowId}`, requestOptions)
            .then((response) => response.ok ? response.json() as Promise<JsonValue> : null)
            .catch(() => null)
        : null;

      const expectedTitle = normalizeText(title);
      let candidates = linkedShow ? [{ score: 10, show: linkedShow }] : [];
      for (const searchTitle of getTvMazeSearchTitles(title)) {
        if (candidates.length > 0) break;
        const searchResponse = await fetch(
          `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(searchTitle)}`,
          requestOptions,
        );
        if (searchResponse.ok) candidates = ensureArray(await searchResponse.json() as JsonValue);
      }
      const ranked = candidates
        .map((candidate) => {
          const show = candidate?.show || {};
          const candidateYear = parseYear(show?.premiered);
          let score = Number(candidate?.score || 0);
          if (normalizeText(String(show?.name || "")) === expectedTitle) score += 5;
          if (premiereYear && candidateYear === premiereYear) score += 4;
          if (String(show?.type || "").toLowerCase() === "animation") score += 2;
          if (String(show?.language || "").toLowerCase() === "japanese") score += 1;
          return { id: Number(show?.id), score };
        })
        .filter((candidate) => Number.isInteger(candidate.id) && candidate.id > 0)
        .sort((left, right) => right.score - left.score);
      if (!ranked[0]) return [];

      const episodesResponse = await fetch(`https://api.tvmaze.com/shows/${ranked[0].id}/episodes?specials=0`, {
        headers: { Accept: "application/json", "User-Agent": "Tatakai-Frontend/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      return episodesResponse.ok
        ? normalizeTvMazeEpisodePayload(await episodesResponse.json(), premiereDate)
        : [];
    },
    {
      freshMs: 24 * 60 * 60 * 1000,
      staleMs: 24 * 60 * 60 * 1000,
      expireMs: 24 * 60 * 60 * 1000,
      shouldCache: (value) => Array.isArray(value) && value.some((episode) => Boolean(episode?.image)),
    },
  );

  return allEpisodes.filter(
    (episode) => episode.number > normalizedStart && episode.number <= normalizedStart + TVMAZE_EPISODE_RANGE_SIZE,
  );
}

const FANDOM_EPISODE_RANGE_SIZE = 100;
const FANDOM_API_PAGE_LIMIT = 50;

/** Final artwork fallback for One Piece gaps that no catalog API currently
 * fills. MediaWiki returns resized episode artwork, so these URLs are also
 * appropriate for the compact episode rail. */
export async function getFandomEpisodeMetadataRange(
  anilistId: number,
  rangeStart = 0,
): Promise<EpisodeDisplayMetadata[]> {
  if (!Number.isInteger(anilistId) || anilistId <= 0) return [];
  const normalizedStart = Math.max(0, Math.floor(rangeStart / FANDOM_EPISODE_RANGE_SIZE) * FANDOM_EPISODE_RANGE_SIZE);

  return cacheFetch(
    `fandom-episode-artwork:v2:${anilistId}:${normalizedStart}`,
    async () => {
      const { title } = await getAniZipEpisodeBundle(anilistId);
      if (normalizeText(title || "") !== "one piece") return [];

      const episodeNumbers = Array.from({ length: FANDOM_EPISODE_RANGE_SIZE }, (_, index) => normalizedStart + index + 1);
      const chunks = Array.from(
        { length: Math.ceil(episodeNumbers.length / FANDOM_API_PAGE_LIMIT) },
        (_, index) => episodeNumbers.slice(index * FANDOM_API_PAGE_LIMIT, (index + 1) * FANDOM_API_PAGE_LIMIT),
      );
      const pages = await Promise.all(chunks.map(async (numbers) => {
        const titles = numbers.map((number) => `Episode ${number}`).join("|");
        const url = new URL("https://onepiece.fandom.com/api.php");
        url.searchParams.set("action", "query");
        url.searchParams.set("prop", "pageimages");
        url.searchParams.set("titles", titles);
        url.searchParams.set("piprop", "thumbnail|original");
        url.searchParams.set("pithumbsize", "360");
        url.searchParams.set("format", "json");
        url.searchParams.set("origin", "*");
        try {
          const response = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "Tatakai-Frontend/1.0" },
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
          });
          if (!response.ok) return [];
          const payload = await response.json() as JsonValue;
          return Object.values(payload?.query?.pages || {}).flatMap((page: any) => {
            const match = String(page?.title || "").match(/^Episode\s+(\d+)$/i);
            const number = Number(match?.[1]);
            const image = pickFirstNonEmpty(page?.original?.source, page?.thumbnail?.source) || null;
            const thumbnail = pickFirstNonEmpty(page?.thumbnail?.source, page?.original?.source) || null;
            return Number.isFinite(number) && image
              ? [{ number, title: null, image, thumbnail } satisfies EpisodeDisplayMetadata]
              : [];
          });
        } catch {
          return [];
        }
      }));
      return pages.flat().sort((left, right) => left.number - right.number);
    },
    {
      freshMs: 7 * 24 * 60 * 60 * 1000,
      expireMs: 30 * 24 * 60 * 60 * 1000,
      shouldCache: (value) => Array.isArray(value) && value.some((episode) => Boolean(episode?.image)),
    },
  );
}

export function normalizeHianimeEpisodesPayload(data: JsonValue): EpisodeModel[] {
  return ensureArray(data.episodes).map((episode) => ({
    number: Number(episode.number || 0),
    title: pickFirstNonEmpty(episode.title, `Episode ${episode.number}`),
    image: pickFirstNonEmpty(episode.image, episode.thumbnail) || null,
    description: normalizeEpisodeDescription(pickFirstNonEmpty(episode.description, episode.overview)),
    airDate: pickFirstNonEmpty(episode.airDate, episode.airdate, episode.aired) || null,
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
    image: pickFirstNonEmpty(episode.image, episode.thumbnail, episode.poster) || null,
    description: normalizeEpisodeDescription(pickFirstNonEmpty(episode.description, episode.overview)),
    airDate: pickFirstNonEmpty(episode.airDate, episode.airdate, episode.aired) || null,
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

const hianimeMetaCache = new Map<string, Promise<ProviderDetailMetaBundle>>();

async function fetchHianimeDetailMeta(providerId: string): Promise<ProviderDetailMetaBundle> {
  const existing = hianimeMetaCache.get(providerId);
  if (existing) return existing;

  const promise = (async () => {
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
      provider: "hianime" as ProviderId,
      providerId,
      anime,
      synopsis: pickFirstNonEmpty(info.description),
      metadata: toHianimeMetadata(detail),
      seasons: [],
      related: ensureArray(detail.relatedAnimes).map(normalizeHianimeCatalogItem),
      recommended: ensureArray(detail.recommendedAnimes).map(normalizeHianimeCatalogItem),
    };
  })();

  hianimeMetaCache.set(providerId, promise);
  setTimeout(() => hianimeMetaCache.delete(providerId), 5000);

  return promise;
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
  const rawEpisodes = normalizeHianimeEpisodesPayload(episodes);

  try {
    const meta = await fetchHianimeDetailMeta(providerId);
    const subCount = meta.anime.subCount ?? rawEpisodes.length;
    const dubCount = meta.anime.dubCount ?? 0;
    return rawEpisodes.map((ep) => ({
      ...ep,
      isSubbed: ep.number <= subCount,
      isDubbed: ep.number <= dubCount,
    }));
  } catch {
    return rawEpisodes;
  }
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
      subCount: meta.anime.subCount ?? episodes.filter((ep) => ep.isSubbed).length,
      dubCount: meta.anime.dubCount ?? episodes.filter((ep) => ep.isDubbed).length,
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
    case "reanime":
    case "anikoto":
    case "animegg":
    case "anineko":
      // Anivexa providers don't expose a fast episode-list endpoint (cold cache can take minutes).
      // Watch sessions use anilistId::episodeNumber synthesis instead — no episode list needed.
      return [];
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
    return `/anime/${routeId}/watch?ep=1`;
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
        .slice(0, 3);

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

        // OPTIMIZATION: Only warm metadata + embed URL paths on the backend.
        // We intentionally do NOT resolve link_ids here because:
        // 1. Link IDs trigger direct stream source resolution (CPU + network heavy)
        // 2. The platform uses embed-only playback — direct sources are unused
        // 3. Embed URLs are already warmed by getFastWatchSession above
        if (animeKaiEpisodeIds.length > 0) {
          void postBackendJson("/api/cache/warm", {
            slug: animeKaiProviderId,
            episode_ids: animeKaiEpisodeIds,
          }).catch(() => undefined);

          recordCounter("anime.warm.backend_requested", 1, {
            provider: "animekai",
            episodes: animeKaiEpisodeIds.length,
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

    // Anivexa providers use anilistId directly (no title search needed)
    if (ANIVEXA_PROVIDERS.includes(provider as AniviexaProvider)) {
      if (seedAnime.anilistId) {
        providerIds[provider] = String(seedAnime.anilistId);
      }
      continue;
    }

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

  // ── FAST PATH for anilist~ routes ──────────────────────────────────────────
  // When the route is `anilist~{id}`, the Python backend will never have this
  // ID in its database. Skip all scraper calls entirely and fetch from AniList
  // directly — this is instant vs. the 2–5s backend timeout.
  const anilistPassthroughId = decoded.provider === "animekai"
    ? parseAnilistPassthroughId(decoded.providerId)
    : null;

  if (anilistPassthroughId !== null) {
    const anilistSeedFast = await getAnilistSeedAnime(anilistPassthroughId);
    const seedAnime = anilistSeedFast?.anime || normalizeBaseAnime({
      provider: "animekai",
      providerId: decoded.providerId,
      title: humanizeProviderId(decoded.providerId),
      description: null,
      genres: [],
    });
    const attempts: ProviderAttemptStatus[] = [
      anilistSeedFast
        ? providerSuccess("animekai", "AniList direct lookup — no scraper needed")
        : providerFailure("animekai", "AniList lookup failed"),
    ];

    // Anivexa providers use the anilistId directly — populate them instantly (zero latency)
    const aniviexaProviderIds: Partial<Record<ProviderId, string>> = {};
    for (const p of ANIVEXA_PROVIDERS) {
      aniviexaProviderIds[p] = String(anilistPassthroughId);
    }
    const anivexa_merged = { ...seedAnime.providerIds, ...aniviexaProviderIds };
    const mergedSeedAnime = { ...seedAnime, providerIds: anivexa_merged } as typeof seedAnime;
    const availableProvidersWithAnivexa: ProviderId[] = ["animekai", ...ANIVEXA_PROVIDERS];

    return {
      anime: withProviderIds(mergedSeedAnime, anivexa_merged, routeId),
      synopsis: seedAnime.description || "No synopsis available right now.",
      metadata: [],
      seasons: [],
      related: [],
      recommended: [],
      activeProvider: preferredProvider && ANIVEXA_PROVIDER_SET.has(preferredProvider)
        ? preferredProvider
        : "anikoto",
      availableProviders: availableProvidersWithAnivexa,
      attempts,
    };
  }

  // ── END FAST PATH ──────────────────────────────────────────────────────────

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

  // Field-wise merge: the active provider bundle stays the authority for
  // playback/episode data, but presentation fields (poster/banner/title/
  // description) come from the seed — the route's own base bundle or the
  // AniList seed — so a fallback scraper's low-res art and raw title string
  // never clobber richer metadata we already resolved.
  const mergedAnime = mergePresentationFields(
    activeBundle.anime,
    // Only a genuinely resolved seed — never the humanized-provider-id stub,
    // whose placeholder title would clobber the provider's real one.
    anilistSeed?.anime || baseBundle?.anime || null,
    providerIds,
    routeId,
  );
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

/**
 * Generates synthetic episode stubs for AniList passthrough anime.
 *
 * For a RELEASING (currently airing) anime:
 *   - AniList provides nextAiringEpisode.episode = the NEXT episode to air
 *   - Episodes aired so far = nextAiringEpisode.episode - 1
 *   - e.g. nextAiringEpisode.episode = 5 → episodes 1, 2, 3, 4 have aired
 *
 * For a FINISHED anime:
 *   - Use media.episodes (total episode count)
 *
 * This allows the episode list to show correctly for new/current-season anime
 * that aren't yet in the scraper's database.
 */
async function buildSyntheticEpisodesFromAnilist(anilistId: number): Promise<EpisodeModel[]> {
  try {
    const media = await getAnilistDetail(anilistId);
    let episodeCount = await resolveAiredEpisodeCount(media);

    // Unknown metadata must not manufacture an unaired episode.
    if (episodeCount === null || episodeCount <= 0) {
      return [];
    }

    // Cap at 2000 for safety
    episodeCount = Math.min(episodeCount, 2000);

    return Array.from({ length: episodeCount }, (_, i) => makeSyntheticEpisode(i + 1));
  } catch {
    return [];
  }
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

  // For anilist: passthrough IDs, the scraper has no episode data.
  // Build synthetic episodes from AniList metadata instead.
  const anilistPassId = parseAnilistPassthroughId(providerId);
  if (anilistPassId !== null) {
    const syntheticEpisodes = await buildSyntheticEpisodesFromAnilist(anilistPassId);
    return {
      anime: detail.anime,
      episodes: syntheticEpisodes,
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

    // The overview fast path maps AniList routes to direct worker provider IDs,
    // so inspect the route itself before the mapped provider ID. This keeps the
    // lightweight path synthetic and avoids a cold provider episode scrape.
    const anilistPassId = parseAnilistPassthroughId(routeId)
      ?? (activeProviderId ? parseAnilistPassthroughId(activeProviderId) : null);
    const episodes = anilistPassId !== null
      ? await buildSyntheticEpisodesFromAnilist(anilistPassId)
      : activeProviderId
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

  // Fetch episodes from all providers in parallel for speed
  const episodeFetchTargets = providerOrder
    .map((provider) => ({ provider, providerId: detail.anime.providerIds[provider] }))
    .filter((target): target is { provider: ProviderId; providerId: string } => Boolean(target.providerId));

  const episodeResults = await Promise.allSettled(
    episodeFetchTargets.map(async ({ provider, providerId }) => ({
      provider,
      episodes: await fetchProviderEpisodes(provider, providerId),
    })),
  );

  // Merge in original provider order for deterministic results
  for (const target of episodeFetchTargets) {
    const result = episodeResults[episodeFetchTargets.indexOf(target)];
    if (result.status === "fulfilled") {
      mergeEpisodeMaps(episodeMap, result.value.episodes, result.value.provider, { allowNewEntries: episodeMap.size === 0 });
    }
  }

  const mergedEpisodes = Array.from(episodeMap.values()).sort((a, b) => a.number - b.number);

  // For anilist passthrough routes: if no scraped episodes, generate synthetic episodes.
  // Use nextAiringEpisode data so RELEASING anime only shows episodes that have actually aired.
  let finalEpisodes = mergedEpisodes;
  if (mergedEpisodes.length === 0) {
    const activeProviderId = detail.anime.providerIds[detail.activeProvider] || detail.anime.providerId;
    const anilistPassId = activeProviderId ? parseAnilistPassthroughId(activeProviderId) : null;

    if (anilistPassId !== null) {
      finalEpisodes = await buildSyntheticEpisodesFromAnilist(anilistPassId);
    } else {
      // Some long-running AniList routes resolve to a provider mapping without
      // returning provider episodes. The aired sub/dub totals are still enough
      // to build navigation stubs (for example One Piece).
      const knownEpisodeCount = knownEpisodeCountForNavigation(detail.anime);
      if (knownEpisodeCount > 0) finalEpisodes = Array.from({ length: knownEpisodeCount }, (_, i) => ({
        number: i + 1,
        title: `Episode ${i + 1}`,
        idByProvider: {} as Partial<Record<ProviderId, string>>,
        availableProviders: [] as ProviderId[],
      }));
    }
  }

  finalEpisodes = finalEpisodes.filter((episode) =>
    isAnimeEpisodeReleased(detail.anime, episode.number));

  return {
    ...detail,
    episodes: finalEpisodes,
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
  const cacheKey = `detail-model:v2:${routeId}:${preferredProvider || "auto"}:${options.mergeEpisodeProviders ?? true}`;
  return cacheFetch(
    cacheKey,
    () => _getAnimeDetailModelRaw(routeId, preferredProvider, options),
    { freshMs: 60 * 60 * 1000, staleMs: 6 * 60 * 60 * 1000, expireMs: 6 * 60 * 60 * 1000 },
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

function isAnimeKaiWrapperUrl(value: string | null | undefined): boolean {
  return String(value || "").includes("anikai.to/iframe/");
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
  // Treat the provider's Cloudflare wrapper as non-playable so fallback can kick in.
  const playableEmbedUrl = isAnimeKaiWrapperUrl(embedUrl) ? null : embedUrl;

  const source = normalizeStreamSourceFromUrl({
    label: selected.name || "AnimeKai",
    url: streamUrl,
    iframeUrl: playableEmbedUrl || null,
    referer: playableEmbedUrl || null,
    // Prefer direct M3U8 stream over iframe — embed sites use Cloudflare bot
    // protection which blocks streams in cross-origin iframes. Only use iframe
    // when there is no direct stream URL available.
    preferEmbed: !streamUrl && Boolean(playableEmbedUrl),
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
      persistent: false,
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
      persistent: false,
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
  // Fast watch sessions should only expose embeds the browser can actually load.
  const playableEmbedUrl = isAnimeKaiWrapperUrl(embedUrl) ? "" : embedUrl;
  const skip = embed.skip || {};

  // Pre-warm embed cache for sibling servers (fire-and-forget)
  for (const entry of entries) {
    if (entry.linkId !== selected.linkId) {
      void fetchAnimeKaiEmbedSource(entry.linkId).catch(() => undefined);
    }
  }
  const source = normalizeStreamSourceFromUrl({
    label: selected.name || "AnimeKai",
    url: null,
    iframeUrl: playableEmbedUrl || null,
    referer: playableEmbedUrl || null,
    preferEmbed: Boolean(playableEmbedUrl),
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


async function fetchGogoAnimeWatchSession(
  compositeId: string,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  // compositeId format: "title|subtitle::episodeNumber"
  const [titlesPart, episodeStr] = compositeId.split("::");
  if (!titlesPart || !episodeStr) {
    return {
      source: null,
      subtitles: [],
      serverOptions: [],
      activeServerId: null,
    };
  }

  const [title, subtitle] = titlesPart.split("|");

  const response = await apiJson<JsonValue>(
    `/api/gogoanime/watch?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(subtitle || "")}&episode=${encodeURIComponent(episodeStr)}`,
    { noStore: true },
  );

  const results = ensureArray(response.results);
  const selected = results[0] || {};
  const embedUrl = String(selected.url || "");

  if (!embedUrl) {
    return {
      source: null,
      subtitles: [],
      serverOptions: [],
      activeServerId: null,
    };
  }

  const source = normalizeStreamSourceFromUrl({
    label: "GogoAnime",
    url: null,
    iframeUrl: embedUrl,
    referer: null,
    preferEmbed: true,
  });

  return {
    source: source.iframeUrl ? source : null,
    subtitles: [],
    serverOptions: [
      {
        id: "gogoanime-default",
        label: "GogoAnime",
        provider: "gogoanime" as any,
        category: dubbed ? "dub" : "sub",
      },
    ],
    activeServerId: "gogoanime-default",
  };
}

async function fetchAniviexaEpisodes(anilistId: number): Promise<EpisodeModel[]> {
  const base = ANIVEXA_WORKER_URL;
  if (!base) return [];

  let response: Response | null = null;
  try {
    response = await fetch(`${base}/episodes/${ANIVEXA_PROVIDERS.join("/")}/${anilistId}?map=false`, {
      headers: { Accept: "application/json", "User-Agent": "AnimeKAI-Frontend/1.0" },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    console.error("fetchAniviexaEpisodes failed for ID:", anilistId, err);
    return [];
  }

  if (!response.ok) {
    console.error("fetchAniviexaEpisodes non-ok for ID:", anilistId, response.status);
    return [];
  }

  const data = (await response.json()) as Record<string, any>;
  const episodeMap = new Map<number, EpisodeModel>();

  for (const provider of ANIVEXA_PROVIDERS) {
    const providerData = data[provider] as any;
    if (!providerData || providerData.error) continue;

    const subEps: any[] = ensureArray(providerData?.episodes?.sub);
    const dubEps: any[] = ensureArray(providerData?.episodes?.dub);

    for (const ep of [...subEps, ...dubEps]) {
      const num = Number(ep.number);
      if (!Number.isFinite(num) || num <= 0) continue;

      const existing = episodeMap.get(num) ?? {
        number: num,
        title: ep.title || `Episode ${num}`,
        image: ep.image || null,
        description: normalizeEpisodeDescription(ep.description || ep.overview),
        airDate: ep.airDate || ep.airdate || ep.aired || null,
        isFiller: Boolean(ep.filler),
        idByProvider: {} as Partial<Record<ProviderId, string>>,
        availableProviders: [] as ProviderId[],
      };

      if (/^episode\s+\d+(?:\.\d+)?$/i.test(existing.title) && ep.title && !/^episode\s+\d+(?:\.\d+)?$/i.test(ep.title)) {
        existing.title = ep.title;
      }
      existing.description = existing.description || normalizeEpisodeDescription(ep.description || ep.overview);
      existing.airDate = existing.airDate || ep.airDate || ep.airdate || ep.aired || null;

      // Episode ID format: "anilistId::episodeNumber" — decoded by fetchReanimeDirectWatchSession / fetchAniviexaWatchSession
      if (!existing.idByProvider[provider]) {
        existing.idByProvider[provider] = `${anilistId}::${num}`;
        if (!existing.availableProviders.includes(provider)) {
          existing.availableProviders.push(provider);
        }
      }
      episodeMap.set(num, existing);
    }
  }

  return Array.from(episodeMap.values()).sort((a, b) => a.number - b.number);
}

/** Fetch a watch session from the Anivexa Cloudflare Worker for non-Reanime providers. */
async function fetchAniviexaWatchSession(
  provider: AniviexaProvider,
  anilistId: string,
  episodeNum: number,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  const base = ANIVEXA_WORKER_URL;
  if (!base) throw new Error("NEXT_PUBLIC_ANIVEXA_WORKER_URL is not configured");

  const audio = dubbed ? "dub" : "sub";
  const preferredMode = requestedGatewayMode(requestedServer);
  const url = `${base}/watch/${provider}/${anilistId}/${audio}/${provider}-${episodeNum}`;

  recordLog("info", "anime.anivexa.watch.request", {
    provider,
    anilistId,
    episodeNumber: episodeNum,
    audio,
    requestedServer: requestedServer || "auto",
    preferredMode: preferredMode || "auto",
    workerPath: `/watch/${provider}/${anilistId}/${audio}/${provider}-${episodeNum}`,
  });

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "AnimeKAI-Frontend/1.0" },
    signal: AbortSignal.timeout(22_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    recordLog("warn", "anime.anivexa.watch.http_error", {
      provider,
      anilistId,
      episodeNumber: episodeNum,
      audio,
      status: response.status,
    }, body.slice(0, 180));
    throw new Error(`Anivexa/${provider} ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = (await response.json()) as Record<string, any>;

  const envelopeCandidates = (dubbed
    ? [
        { key: "sdub", payload: data.sdub, subType: undefined as "soft" | "hard" | undefined },
        { key: "hdub", payload: data.hdub, subType: undefined as "soft" | "hard" | undefined },
        { key: "dub", payload: data.dub, subType: undefined as "soft" | "hard" | undefined },
      ]
    : [
        { key: "ssub", payload: data.ssub, subType: "soft" as const },
        { key: "hsub", payload: data.hsub, subType: "hard" as const },
        { key: "sub", payload: data.sub, subType: undefined as "soft" | "hard" | undefined },
      ])
    .filter((entry) => entry.payload && typeof entry.payload === "object");
  const fallbackPayload = data.result || data.data || data;
  const selectedEnvelopeCandidates = envelopeCandidates.length
    ? envelopeCandidates
    : [{ key: "root", payload: fallbackPayload, subType: undefined as "soft" | "hard" | undefined }];

  const rawStreams: any[] = selectedEnvelopeCandidates.flatMap((entry) =>
    ensureArray(entry.payload.streams || []).map((stream: any) => ({
      ...stream,
      __payload: entry.payload,
      __envelopeKey: entry.key,
      __subType: entry.subType,
      __subtitles: extractAnivexaStreamSubtitles(stream),
    })),
  );
  const fallbackStreams = rawStreams.length > 0 ? rawStreams : ensureArray(data.streams).map((stream: any) => ({
    ...stream,
    __payload: fallbackPayload,
    __envelopeKey: "root",
    __subType: undefined,
    __subtitles: extractAnivexaStreamSubtitles(stream),
  }));
  const streams = fallbackStreams.filter((s) => !s.audio || s.audio === audio);
  const activeStreams = streams.length > 0 ? streams : fallbackStreams;
  recordLog("info", "anime.anivexa.watch.payload", {
    provider,
    anilistId,
    episodeNumber: episodeNum,
    audio,
    rawStreamCount: rawStreams.length,
    activeStreamCount: activeStreams.length,
    rawSubtitleCount: selectedEnvelopeCandidates.reduce((count, entry) => count + ensureArray(entry.payload.subtitles).length, 0),
    envelope: selectedEnvelopeCandidates.map((entry) => entry.key).join(","),
  });

  const provLabel = compactProviderLabel(provider as ProviderId);
  const serverOptions: ServerOption[] = [];
  const seenIds = new Set<string>();

  activeStreams.forEach((s: any, i: number) => {
    const typeStr = s.type || "embed";
    const serverName = s.server || "HD";
    const suffix = s.quality || (s.url?.length > 10 ? s.url.slice(-6) : String(i));
    const sType: ServerOption["subType"] = dubbed
      ? undefined
      : anivexaSubTypeForProvider(provider, s, ensureArray(s.__payload?.subtitles || data.subtitles));
    const transport = anivexaStreamTransport(s) || "embed";
    const typePart = sType || audio;
    const serverId = `${provider}-${typePart}-${serverName.toLowerCase().replace(/\s+/g, "-")}-${transport}-${suffix}`.replace(/[^a-z0-9-]/g, "");
    if (!seenIds.has(serverId)) {
      serverOptions.push({
        id: serverId,
        label: compactStreamServerLabel(provider as ProviderId, serverName, transport, s.quality),
        provider: provider as ProviderId,
        category: audio,
        subType: sType,
        transport,
      });
      seenIds.add(serverId);
    }
  });

  if (serverOptions.length === 0) {
    serverOptions.push({
      id: `${provider}-default`,
      label: `${provLabel} Default`,
      provider: provider as ProviderId,
      category: audio,
      subType: dubbed ? undefined : "soft",
    });
  }

  let activeId = serverOptions[0].id;
  let selectedStream: any = activeStreams[0] || null;
  if (requestedServer) {
    const matchIdx = serverOptions.findIndex((opt) => opt.id === requestedServer);
    if (matchIdx >= 0) {
      selectedStream = activeStreams[matchIdx] ?? selectedStream;
      activeId = serverOptions[matchIdx].id;
    } else if (preferredMode === "hard" || preferredMode === "soft") {
      const modeIdx = serverOptions.findIndex((opt) => opt.subType === preferredMode);
      const modeStream = modeIdx >= 0 ? activeStreams[modeIdx] : null;
      if (modeStream) {
        selectedStream = modeStream;
        activeId = serverOptions[modeIdx].id;
      } else {
        selectedStream = null;
        activeId = requestedServer;
      }
    } else {
      recordLog("warn", "anime.anivexa.watch.server_not_found", {
        provider,
        anilistId,
        episodeNumber: episodeNum,
        requestedServer,
        availableServers: serverOptions.map((opt) => opt.id).join(",").slice(0, 180),
      });
    }
  }

  const selectedReferer = selectedStream?.referer || selectedStream?.referrer || null;
  const streamProxyUrl = (assetUrl: string, referer?: string | null) =>
    buildProxyUrl(API_BASE_URL, assetUrl, referer);

  const selectedPayload = selectedStream?.__payload || selectedEnvelopeCandidates[0]?.payload || fallbackPayload;
  const rawSubtitles = dedupeAnivexaSubtitles([
    ...ensureArray(selectedPayload.subtitles),
    ...ensureArray(selectedStream?.__subtitles),
    ...ensureArray(data.subtitles),
  ]);
  const subtitleLangCounts = new Map<string, number>();
  const subtitles = preferEnglishSubtitleDefault(rawSubtitles
    .filter((s: any) => {
      const fmt = String(s.format || "").toLowerCase();
      if (fmt === "ass" || fmt === "ssa") return false;
      return Boolean(s.file || s.url);
    })
    .map((s: any) => {
      const rawUrl = String(s.file || s.url || "");
      const label = String(s.label || s.language || s.lang || s.srclang || "Subtitle");
      const baseLang = String(s.language || s.lang || s.srclang || s.label || "Unknown");
      const seen = subtitleLangCounts.get(baseLang) || 0;
      subtitleLangCounts.set(baseLang, seen + 1);
      return {
        label: seen > 0 ? `${label} ${seen + 1}` : label,
        lang: seen > 0 ? `${baseLang}-${seen + 1}` : baseLang,
        url: rawUrl ? streamProxyUrl(rawUrl, s.referer || s.referrer || selectedReferer) : "",
        isDefault: false,
      };

    })
    .filter((s) => s.url));

  let source: StreamSource | null = null;
  if (selectedStream?.url) {
    const streamUrl = selectedStream.url;
    const selectedTransport = anivexaStreamTransport(selectedStream);
    const isM3U8 = selectedTransport === "hls";
    const isEmbed = selectedTransport === "embed" || streamUrl.includes("/e/") || streamUrl.includes("/embed/");
    const selectedLabel = serverOptions.find((opt) => opt.id === activeId)?.label || `${provLabel} HD`;
    const requiresProxy = Boolean(isM3U8 || selectedReferer);
    source = {
      kind: isEmbed ? "iframe" : (isM3U8 ? "hls" : "video"),
      label: selectedLabel,
      url: streamUrl,
      proxiedUrl: requiresProxy ? buildProxyUrl(API_BASE_URL, streamUrl, selectedReferer, isM3U8 ? "playlist" : "video", selectedStream.playlist_key || selectedStream.key) : streamUrl,
      iframeUrl: isEmbed ? streamUrl : null,
      isM3U8,
      requiresProxy,
    };
  }

  recordLog("info", "anime.anivexa.watch.selected", {
    provider,
    anilistId,
    episodeNumber: episodeNum,
    audio,
    activeServerId: activeId,
    selectedType: selectedStream?.type || "none",
    selectedServer: selectedStream?.server || "unknown",
    sourceKind: source?.kind || "none",
    isM3U8: Boolean(source?.isM3U8),
    requiresProxy: Boolean(source?.requiresProxy),
    subtitleCount: subtitles.length,
    serverCount: serverOptions.length,
  });

  const introStart = selectedPayload.intro_start ?? selectedPayload.intro?.start ?? data.intro_start ?? null;
  const introEnd = selectedPayload.intro_end ?? selectedPayload.intro?.end ?? data.intro_end ?? null;
  const outroStart = selectedPayload.outro_start ?? selectedPayload.outro?.start ?? data.outro_start ?? null;
  const outroEnd = selectedPayload.outro_end ?? selectedPayload.outro?.end ?? data.outro_end ?? null;

  return {
    source,
    subtitles,
    serverOptions,
    activeServerId: activeId,
    intro: introStart != null ? { start: Number(introStart), end: Number(introEnd ?? (Number(introStart) + 90)) } : null,
    outro: outroStart != null ? { start: Number(outroStart), end: Number(outroEnd ?? (Number(outroStart) + 90)) } : null,
  };
}

async function fetchAnivexaAggregateData(
  anilistId: string,
  episodeNum: number,
  dubbed: boolean,
  uiProvider: ProviderId,
  providers: AnivexaWorkerProvider[] = ANIVEXA_WORKER_PROVIDERS,
): Promise<AnivexaAggregateData> {
  const base = ANIVEXA_WORKER_URL;
  if (!base) throw new Error("NEXT_PUBLIC_ANIVEXA_WORKER_URL is not configured");

  const audio = dubbed ? "dub" : "sub";
  const providerScope = providers.join(",");
  const cacheKey = `anivexa-aggregate:${anilistId}:ep${episodeNum}:${audio}:${providerScope}:${uiProvider}`;

  // Set by the loader when any provider in this scope failed. The partial
  // aggregate is still served to the current request, but caching it under the
  // full-provider-scope key would mask the healthy providers for 90s.
  let anyProviderErrored = false;

  return cacheFetch(cacheKey, async () => {
    anyProviderErrored = false;
    recordLog("info", "anime.anivexa.aggregate.fetch", {
      anilistId,
      episodeNumber: episodeNum,
      audio,
      providers: providerScope,
    });

    const providerResults = await Promise.allSettled(
      providers.map((provider) => fetchAnivexaProviderBucket(
        base,
        anilistId,
        episodeNum,
        dubbed,
        provider,
        provider === "mkissa" ? 30_000 : 12_000,
      )),
    );

    anyProviderErrored = providerResults.some(
      (result) => result.status !== "fulfilled" || !result.value,
    );

    const buckets = providerResults
      .map((result) => result.status === "fulfilled" ? result.value : null)
      .filter((bucket): bucket is AnivexaAggregateBucket => Boolean(bucket))
      .sort((left, right) => {
        const leftTransport = anivexaStreamTransport(left.internal[0]) || (left.embed.length > 0 ? "embed" : "mp4");
        const rightTransport = anivexaStreamTransport(right.internal[0]) || (right.embed.length > 0 ? "embed" : "mp4");
        return ANIVEXA_TRANSPORT_PRIORITY[leftTransport] - ANIVEXA_TRANSPORT_PRIORITY[rightTransport];
      });

    const serverOptions = buckets.flatMap((bucket) =>
      buildAnivexaServerEntries(bucket, uiProvider, dubbed).map((entry) => entry.option));

    recordLog("info", "anime.anivexa.aggregate.fetch.complete", {
      anilistId,
      episodeNumber: episodeNum,
      audio,
      serverCount: serverOptions.length,
      providers: buckets.map((bucket) => `${bucket.provider}:${bucket.subType}:${bucket.internal.length}/${bucket.embed.length}`).join(","),
    });

    return {
      buckets,
      serverOptions,
      fetchedAt: Date.now(),
    };
  }, {
    // Deliberately memory-only and short-lived: the buckets held here carry
    // resolved stream URLs, which expire. The durable, KV-backed cache is the
    // derived server-option list in `discoverAnivexaProviderServerOptions`,
    // which holds no URLs.
    freshMs: 45 * 1000,
    staleMs: 45 * 1000,
    expireMs: 90 * 1000,
    persistent: false,
    // A partially-failed aggregate is fine to serve but must not be cached
    // under this provider-scope key, or the providers that did work stay
    // hidden for the full 90s expiry.
    shouldCache: (value) => {
      if (anyProviderErrored) return false;
      const aggregate = value as AnivexaAggregateData;
      return Array.isArray(aggregate?.buckets) &&
        aggregate.buckets.some((bucket) => bucket.internal.length > 0 || bucket.embed.length > 0);
    },
  });
}

/*
 * Server-option lists are cheap, stable metadata: ids, labels, transport and
 * sub type. They contain no stream URL, so unlike `anivexa-aggregate` and
 * `anivexa-first` (which carry resolved, expiring stream URLs and therefore
 * stay memory-only) they are safe to persist to Cloudflare KV and share
 * between instances.
 *
 * The upstream API caches a watch response for 3 hours in Upstash Redis, so a
 * provider's variant list barely moves inside a 30 minute window. 15 minutes
 * fresh keeps the SSR picker warm across cold isolates; the stale window to 30
 * minutes revalidates in the background so a server render never waits on a
 * refresh, and a variant that genuinely disappears upstream is gone from the
 * picker within 30 minutes at worst. Anything shorter than that and every new
 * Cloudflare instance pays the 3-5s cold upstream miss again.
 */
const SERVER_OPTIONS_FRESH_MS = 15 * 60 * 1000;
const SERVER_OPTIONS_EXPIRE_MS = 30 * 60 * 1000;

/**
 * Overall budget for resolving the focused picker during SSR.
 *
 * A warm upstream response is ~140ms and these lookups run concurrently with
 * `getQuickWatchSession` (~600ms warm), so in the warm case they add nothing
 * to TTFB at all. 800ms leaves roughly 5x headroom over the warm path for a KV
 * read plus a slow-ish upstream, while capping the worst case at ~200ms over
 * the session resolve that is already in flight. A cold upstream miss is 3-5s
 * and is cut off well before it can reach the response.
 */
export const SSR_SERVER_OPTIONS_TIMEOUT_MS = 800;

export async function discoverAnivexaProviderServerOptions(input: {
  anilistId: number;
  episodeNumber: number;
  dubbed: boolean;
  uiProvider: ProviderId;
  workerProvider: AnivexaWorkerProvider;
}): Promise<ServerOption[]> {
  if (input.workerProvider !== "mkissa") {
    const audio = input.dubbed ? "dub" : "sub";
    // The UI provider is deliberately absent from the key. It affects only the
    // `provider` field, which is re-stamped below, never the server ids - so
    // keying on it would fragment the shared cache for no gain and leave the
    // SSR path cold whenever the route's provider param differs.
    const cacheKey = `anivexa-server-options:v1:${input.anilistId}:ep${input.episodeNumber}:${audio}:${input.workerProvider}`;
    const cached = await cacheFetch(cacheKey, async () => {
      const aggregate = await fetchAnivexaAggregateData(
        String(input.anilistId),
        input.episodeNumber,
        input.dubbed,
        input.uiProvider,
        [input.workerProvider],
      );
      return aggregate.serverOptions;
    }, {
      freshMs: SERVER_OPTIONS_FRESH_MS,
      staleMs: SERVER_OPTIONS_FRESH_MS,
      expireMs: SERVER_OPTIONS_EXPIRE_MS,
      persistent: true,
      refreshStale: true,
      // An empty list means this provider failed or returned nothing for the
      // episode. Caching that would hide a healthy provider for 30 minutes,
      // mirroring the partial-result guard on the aggregate itself.
      shouldCache: (value) => Array.isArray(value) && value.length > 0,
    });
    return cached.map((option) => ({ ...option, provider: input.uiProvider }));
  }

  const aggregate = await fetchAnivexaAggregateData(
    String(input.anilistId),
    input.episodeNumber,
    input.dubbed,
    input.uiProvider,
    [input.workerProvider],
  );

  const entries = aggregate.buckets.flatMap((bucket) =>
    buildAnivexaServerEntries(bucket, input.uiProvider, input.dubbed));
  const checked = await Promise.all(entries.map(async (entry) => {
    if (entry.option.transport === "embed") return entry.option;
    const stream = entry.stream;
    const referer = String(stream.referer || stream.referrer || "");
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
    };
    if (referer) {
      headers.Referer = referer;
      try { headers.Origin = new URL(referer).origin; } catch {}
    }
    if (entry.option.transport === "mp4") headers.Range = "bytes=0-511";
    try {
      const response = await fetch(stream.url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return null;
      if (entry.option.transport === "hls") {
        return (await response.text()).trimStart().startsWith("#EXTM3U") ? entry.option : null;
      }
      await response.body?.cancel();
      return response.status === 206 || /video|octet-stream/i.test(response.headers.get("content-type") || "")
        ? entry.option
        : null;
    } catch {
      return null;
    }
  }));
  return checked.filter((option): option is ServerOption => Boolean(option));
}

export interface FocusedServerOptionsResult {
  serverOptions: ServerOption[];
  /**
   * True when every lookup produced a definitive answer inside the budget, so
   * the picker rendered from this result is the final one. False means at
   * least one lookup was still in flight when the budget ran out and the
   * client must finish discovery - the UI keeps its placeholders until then.
   */
  complete: boolean;
}

/**
 * Resolve the focused Waves/Solaris picker for the initial server render.
 *
 * Both discovery providers are asked for both audio modes at once, each with
 * its own catch so a single failing provider cannot break the page, and the
 * whole batch is capped by `SSR_SERVER_OPTIONS_TIMEOUT_MS`. Lookups that miss
 * the budget keep running: their `cacheFetch` entry still lands in KV, so the
 * next render of the same episode is warm.
 *
 * Ranking and the Waves/Solaris narrowing are not done here - callers hand the
 * raw options to `lib/anime/server-selection.ts`, which owns that decision.
 */
export async function resolveFocusedServerOptions(input: {
  anilistId: number | null | undefined;
  episodeNumber: number;
  uiProvider: ProviderId;
  dubbed: boolean;
  timeoutMs?: number;
}): Promise<FocusedServerOptionsResult> {
  const anilistId = input.anilistId;
  if (!anilistId || !ANIVEXA_WORKER_URL) {
    // Nothing to discover on this route, so the empty picker is already final
    // and must not be reported as "still loading".
    return { serverOptions: [], complete: true };
  }

  const combinations = ANIVEXA_DISCOVERY_PROVIDERS.flatMap((workerProvider) => [
    { workerProvider, dubbed: input.dubbed },
    { workerProvider, dubbed: !input.dubbed },
  ]);

  const collected: ServerOption[] = [];
  const seen = new Set<string>();
  let lookupFailed = false;
  const lookups = combinations.map((combination) =>
    discoverAnivexaProviderServerOptions({
      anilistId,
      episodeNumber: input.episodeNumber,
      dubbed: combination.dubbed,
      uiProvider: input.uiProvider,
      workerProvider: combination.workerProvider,
    })
      .then((options) => {
        for (const option of options) {
          if (seen.has(option.id)) continue;
          seen.add(option.id);
          collected.push({ ...option, provider: input.uiProvider });
        }
      })
      .catch(() => {
        // One provider failing is a missing row, never a failed page render -
        // but it is also not an answer, so the client keeps discovery running.
        lookupFailed = true;
      }));

  let timer: ReturnType<typeof setTimeout> | null = null;
  const budget = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), input.timeoutMs ?? SSR_SERVER_OPTIONS_TIMEOUT_MS);
  });
  const outcome = await Promise.race([
    Promise.all(lookups).then(() => "complete" as const),
    budget,
  ]);
  if (timer) clearTimeout(timer);

  if (outcome === "timeout") {
    // The lookups that missed the budget are what warm the shared cache for the next
    // visitor. On Workers they are cancelled with the response unless registered here.
    runAfterResponse(Promise.allSettled(lookups));
    recordCounter("anime.anivexa.ssr_server_options.timeout", 1, {
      uiProvider: input.uiProvider,
      partial: collected.length > 0 ? "partial" : "empty",
    });
  }

  return { serverOptions: collected, complete: outcome === "complete" && !lookupFailed };
}

export async function checkAnivexaServerHealth(input: {
  anilistId: number;
  episodeNumber: number;
  dubbed: boolean;
  uiProvider: ProviderId;
  workerProvider: AnivexaWorkerProvider;
  serverId: string;
}): Promise<ServerHealthResult> {
  const cacheKey = `anivexa-health:v1:${input.anilistId}:ep${input.episodeNumber}:${input.dubbed ? "dub" : "sub"}:${input.serverId}`;
  return cacheFetch(cacheKey, async () => {
    const aggregate = await fetchAnivexaAggregateData(
      String(input.anilistId), input.episodeNumber, input.dubbed,
      input.uiProvider, [input.workerProvider],
    );
    const entry = aggregate.buckets.flatMap((bucket) =>
      buildAnivexaServerEntries(bucket, input.uiProvider, input.dubbed))
      .find((candidate) => candidate.option.id === input.serverId);
    if (!entry?.stream?.url) {
      return { status: "unverified", reason: "Source is unavailable right now", checkedAt: Date.now() };
    }
    const stream = entry.stream;
    const ownSubtitles = ensureArray(stream.__subtitles);
    const result = await probeStreamHealth({
      url: stream.url,
      transport: entry.option.transport || "embed",
      subType: entry.option.subType,
      referer: String(stream.referer || stream.referrer || ""),
      authorization: String(stream.headers?.Authorization || stream.headers?.authorization || ""),
      playlistKey: stream.playlist_key || stream.key,
      subtitles: ownSubtitles.length > 0 ? ownSubtitles : entry.bucket.subtitles,
    });
    recordLog("info", "anime.anivexa.health.checked", {
      anilistId: input.anilistId,
      episodeNumber: input.episodeNumber,
      provider: input.workerProvider,
      server: input.serverId,
      status: result.status,
      reason: result.reason,
    });
    return result;
  }, {
    freshMs: 60_000,
    staleMs: 60_000,
    expireMs: 60_000,
    persistent: false,
  });
}

async function fetchAnivexaProviderBucket(
  base: string,
  anilistId: string,
  episodeNum: number,
  dubbed: boolean,
  provider: AnivexaWorkerProvider,
  timeoutMs = 8_000,
): Promise<AnivexaAggregateBucket | null> {
  const audio = dubbed ? "dub" : "sub";
  const watchProvider = ANIVEXA_WORKER_WATCH_ALIAS[provider] || provider;
  const url = `${base}/watch/${watchProvider}/${anilistId}/${audio}/${watchProvider}-${episodeNum}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Tatakai-Frontend/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      recordLog("warn", "anime.anivexa.aggregate.provider_error", {
        provider,
        status: response.status,
      }, body.slice(0, 160));
      return null;
    }

    const data = await response.json() as Record<string, any>;
    const normalized = normalizeAnivexaWatchPayload(data, provider, dubbed);
    const activeStreams = normalized.streams
      .filter((stream) => !stream.audio || stream.audio === audio)
      .map((stream) => normalizeAnivexaStreamUrl(stream, base));
    const internal = sortAnivexaInternalStreams(activeStreams.filter(isAnivexaInternalStream));
    const embed = activeStreams.filter(isAnivexaEmbedStream);
    if (internal.length === 0 && embed.length === 0) return null;

    const firstPlayable = internal[0] || embed[0];
    const subType = dubbed ? "hard" : anivexaSubTypeForProvider(provider, firstPlayable, normalized.subtitles);
    return {
      provider,
      label: ANIVEXA_DISPLAY_NAMES[provider],
      internal,
      embed,
      subtitles: provider === "anineko"
        ? dedupeAnivexaSubtitles(ensureArray(firstPlayable?.__subtitles))
        : normalized.subtitles,
      payload: firstPlayable?.__payload || normalized.payloads[0]?.payload || normalized.fallbackPayload,
      download: normalized.download || null,
      subType,
    };
  } catch (error) {
    recordLog(
      "warn",
      "anime.anivexa.aggregate.provider_error",
      { provider, status: "network" },
      error instanceof Error ? error.message : "Provider request failed",
    );
    return null;
  }
}

async function fetchFirstAnivexaAggregateData(
  anilistId: string,
  episodeNum: number,
  dubbed: boolean,
  uiProvider: ProviderId,
): Promise<AnivexaAggregateData> {
  const base = ANIVEXA_WORKER_URL;
  if (!base) throw new Error("NEXT_PUBLIC_ANIVEXA_WORKER_URL is not configured");

  const audio = dubbed ? "dub" : "sub";
  const autoProviders = dubbed ? ANIVEXA_AUTO_DUB_PROVIDERS : ANIVEXA_AUTO_SUB_PROVIDERS;
  const cacheKey = `anivexa-first:v4:${anilistId}:ep${episodeNum}:${audio}`;

  return cacheFetch(cacheKey, async () => {
    recordLog("info", "anime.anivexa.aggregate.race", {
      anilistId,
      episodeNumber: episodeNum,
      audio,
      providers: autoProviders.join(","),
    });

    const pending = new Map<number, Promise<{ index: number; bucket: AnivexaAggregateBucket | null }>>();
    autoProviders.forEach((provider, index) => {
      pending.set(
        index,
        fetchAnivexaProviderBucket(base, anilistId, episodeNum, dubbed, provider)
          .then((bucket) => ({ index, bucket })),
      );
    });

    const embedFallbacks: AnivexaAggregateBucket[] = [];
    let fallbackInternal: AnivexaAggregateBucket | null = null;
    let fallbackDeadline = 0;
    while (pending.size > 0) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const completed: { index: number; bucket: AnivexaAggregateBucket | null } | null = fallbackInternal
        ? await Promise.race([
            Promise.race(pending.values()),
            new Promise<null>((resolve) => {
              timeoutId = setTimeout(() => resolve(null), Math.max(0, fallbackDeadline - Date.now()));
            }),
          ]).finally(() => { if (timeoutId) clearTimeout(timeoutId); })
        : await Promise.race(pending.values());
      if (!completed) break;
      pending.delete(completed.index);
      const bucket: AnivexaAggregateBucket | null = completed.bucket;
      if (!bucket) continue;

      if (bucket.internal.length > 0) {
        if (anivexaStreamTransport(bucket.internal[0]) === "hls") {
          return createAnivexaAggregateData([bucket], uiProvider, dubbed);
        }
        if (!fallbackInternal) {
          fallbackInternal = bucket;
          fallbackDeadline = Date.now() + 700;
        }
      } else if (bucket.embed.length > 0) {
        embedFallbacks.push(bucket);
      }
    }

    return createAnivexaAggregateData(
      fallbackInternal ? [fallbackInternal] : embedFallbacks.slice(0, 1),
      uiProvider,
      dubbed,
    );
  }, {
    // Same reasoning as the aggregate cache: this is stream *source*
    // resolution, so it stays in memory and expires quickly.
    freshMs: 45 * 1000,
    staleMs: 45 * 1000,
    expireMs: 90 * 1000,
    persistent: false,
    shouldCache: (value) => {
      const aggregate = value as AnivexaAggregateData;
      return aggregate.buckets.some((bucket) => bucket.internal.length > 0 || bucket.embed.length > 0);
    },
  });
}

async function resolveAiredEpisodeCount(media: AnilistMedia): Promise<number | null> {
  const status = String(media.status || "").toUpperCase().replace(/[ -]+/g, "_");
  if (status === "NOT_YET_RELEASED" || status === "UPCOMING") return 0;
  if (status !== "RELEASING") return media.episodes;

  if (media.nextAiringEpisode?.episode && media.nextAiringEpisode.episode > 1) {
    return media.nextAiringEpisode.episode - 1;
  }

  try {
    const { episodes } = await getAniZipEpisodeBundle(media.id);
    const now = Date.now() + 12 * 60 * 60 * 1000;
    const latestDatedEpisode = episodes.reduce((latest, episode) => {
      const airDate = episode.airDate ? Date.parse(episode.airDate) : Number.NaN;
      return Number.isFinite(airDate) && airDate <= now ? Math.max(latest, episode.number) : latest;
    }, 0);
    if (latestDatedEpisode > 0) return latestDatedEpisode;
  } catch {
    // Continue to the bounded weekly estimate below.
  }

  const { year, month, day } = media.startDate || {};
  if (!year || !month || !day) return 0;
  const premiere = Date.UTC(year, month - 1, day);
  if (premiere > Date.now()) return 0;
  const weeklyEstimate = Math.floor((Date.now() - premiere) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return media.episodes && media.episodes > 0
    ? Math.min(media.episodes, weeklyEstimate)
    : weeklyEstimate;
}

export async function getAnivexaEpisodeAvailabilityMetadata(
  anilistId: number,
): Promise<EpisodeDisplayMetadata[]> {
  if (!ANIVEXA_WORKER_URL || !Number.isInteger(anilistId) || anilistId <= 0) return [];

  // Set by the loader when any provider group failed. The partial result is
  // still returned to the caller (a degraded page beats an empty one), but it
  // must not be written to the 6h/24h cache.
  let anyGroupErrored = false;

  return cacheFetch(
    `anivexa-episode-availability:confirmed-audio-v2:${anilistId}`,
    async () => {
      // Keep each Worker invocation below its subrequest budget. Both groups
      // run concurrently and their results are merged into one catalogue.
      const providerGroups = [
        ANIVEXA_AVAILABILITY_PROVIDERS.slice(0, 2),
        ANIVEXA_AVAILABILITY_PROVIDERS.slice(2),
      ].filter((group) => group.length > 0);
      // A group that fails must not be silently collapsed to `{}` — that would
      // make every episode it alone knows about look unavailable, and the
      // partial map would then be cached for six hours.
      const groupResults = await Promise.all(providerGroups.map(async (providers): Promise<{
        payload: JsonValue;
        errored: boolean;
      }> => {
        const response = await fetch(
          `${ANIVEXA_WORKER_URL}/episodes/${providers.join("/")}/${anilistId}?map=false`,
          {
            headers: { Accept: "application/json", "User-Agent": "Tatakai-Frontend/1.0" },
            // cacheFetch already provides memory + Cloudflare KV caching. Do
            // not let Next's separate fetch cache preserve an obsolete
            // provider response after the availability rules change.
            cache: "no-store",
            signal: AbortSignal.timeout(12_000),
          },
        ).catch(() => null);
        if (!response?.ok) return { payload: {} as JsonValue, errored: true };
        try {
          return { payload: await response.json() as JsonValue, errored: false };
        } catch {
          return { payload: {} as JsonValue, errored: true };
        }
      }));
      const payloads: JsonValue[] = groupResults.map((result) => result.payload);
      anyGroupErrored = groupResults.some((result) => result.errored);
      if (anyGroupErrored) {
        recordLog("warn", "anime.anivexa.availability.partial", {
          anilistId,
          failedGroups: groupResults.filter((result) => result.errored).length,
          totalGroups: groupResults.length,
        });
      }
      const entriesByNumber = new Map<number, EpisodeDisplayMetadata>();

      for (const providerName of ANIVEXA_AVAILABILITY_PROVIDERS) {
        const provider = payloads.find((payload) => payload?.[providerName])?.[providerName] || {};
        for (const audio of ["sub", "dub"] as const) {
          for (const rawEpisode of ensureArray(provider?.episodes?.[audio])) {
            const number = Number(rawEpisode.number || rawEpisode.episode);
            if (!Number.isFinite(number) || number <= 0) continue;

            const existing = entriesByNumber.get(number) || {
              number,
              title: null,
              image: null,
              isSubbed: false,
              isDubbed: false,
              subAvailabilityKnown: true,
              dubAvailabilityKnown: true,
            };
            const candidateTitle = pickFirstNonEmpty(rawEpisode.title);
            if (!existing.title && candidateTitle && !/^episode\s+\d+(?:\.\d+)?$/i.test(candidateTitle)) {
              existing.title = candidateTitle;
            }
            existing.image ||= pickFirstNonEmpty(rawEpisode.image, rawEpisode.thumbnail) || null;
            existing.description ||= normalizeEpisodeDescription(
              pickFirstNonEmpty(rawEpisode.description, rawEpisode.overview),
            );
            existing.airDate ||= pickFirstNonEmpty(rawEpisode.airDate, rawEpisode.airdate, rawEpisode.aired) || null;
            if (audio === "sub") existing.isSubbed = true;
            if (audio === "dub") existing.isDubbed = true;
            existing.subAvailabilityKnown = true;
            existing.dubAvailabilityKnown = true;
            entriesByNumber.set(number, existing);
          }
        }
      }

      return Array.from(entriesByNumber.values()).sort((left, right) => left.number - right.number);
    },
    {
      freshMs: 6 * 60 * 60 * 1000,
      expireMs: 24 * 60 * 60 * 1000,
      // Never persist a partial availability map: it would hide every episode
      // that only the failed group knows about for the next six hours.
      shouldCache: (value) => !anyGroupErrored && Array.isArray(value) && value.length > 0,
    },
  );
}

function buildAnivexaServerEntries(
  bucket: AnivexaAggregateBucket,
  uiProvider: ProviderId,
  dubbed: boolean,
): AnivexaServerEntry[] {
  const seenByMode = new Map<string, number>();
  return [...bucket.internal, ...bucket.embed].flatMap((stream) => {
    const transport = anivexaStreamTransport(stream);
    if (!transport) return [];
    const subType = dubbed ? undefined : anivexaSubTypeForProvider(bucket.provider, stream, bucket.subtitles);
    const mode = dubbed ? "dub" : subType || "unknown";
    const modeKey = `${transport}:${mode}`;
    const variantIndex = seenByMode.get(modeKey) || 0;
    seenByMode.set(modeKey, variantIndex + 1);
    const variant = String(stream.quality || stream.server || "").trim();
    const showVariant = variant &&
      normalizeText(variant) !== normalizeText(bucket.provider) &&
      normalizeText(variant) !== normalizeText(bucket.label);
    return [{
      bucket,
      stream,
      option: {
        id: `anivexa2-${bucket.provider}-${transport}-${variantIndex ? `s${variantIndex}-` : ""}${mode}`,
        label: showVariant ? `${bucket.label} ${variant}` : bucket.label,
        provider: uiProvider,
        category: dubbed ? "dub" : "sub",
        subType,
        transport,
      },
    }];
  });
}

function createAnivexaAggregateData(
  buckets: AnivexaAggregateBucket[],
  uiProvider: ProviderId,
  dubbed: boolean,
): AnivexaAggregateData {
  const sortedBuckets = [...buckets].sort((left, right) => {
    const leftTransport = anivexaStreamTransport(left.internal[0]) || (left.embed.length > 0 ? "embed" : "mp4");
    const rightTransport = anivexaStreamTransport(right.internal[0]) || (right.embed.length > 0 ? "embed" : "mp4");
    return ANIVEXA_TRANSPORT_PRIORITY[leftTransport] - ANIVEXA_TRANSPORT_PRIORITY[rightTransport];
  });
  const serverOptions = sortedBuckets.flatMap((bucket) =>
    buildAnivexaServerEntries(bucket, uiProvider, dubbed).map((entry) => entry.option));

  return { buckets: sortedBuckets, serverOptions, fetchedAt: Date.now() };
}

async function fetchAnivexaAggregateWatchSession(
  anilistId: string,
  episodeNum: number,
  dubbed: boolean,
  requestedServer: string | null | undefined,
  uiProvider: ProviderId,
): Promise<ProviderWatchPayload> {
  const base = ANIVEXA_WORKER_URL;
  if (!base) throw new Error("NEXT_PUBLIC_ANIVEXA_WORKER_URL is not configured");

  const audio = dubbed ? "dub" : "sub";
  const requestedMode = requestedAnivexaAggregateMode(requestedServer);
  const requestedWorkerProvider = requestedAnivexaAggregateProvider(requestedServer);
  const requestedTransport = requestedAnivexaAggregateTransport(requestedServer);

  recordLog("info", "anime.anivexa.aggregate.request", {
    anilistId,
    episodeNumber: episodeNum,
    audio,
    requestedServer: requestedServer || "auto",
    requestedMode: requestedMode || "auto",
    requestedWorkerProvider: requestedWorkerProvider || "auto",
    requestedTransport: requestedTransport || "auto",
  });

  const aggregate = requestedWorkerProvider
    ? await fetchAnivexaAggregateData(
        anilistId,
        episodeNum,
        dubbed,
        uiProvider,
        [requestedWorkerProvider],
      )
    : await fetchFirstAnivexaAggregateData(
        anilistId,
        episodeNum,
        dubbed,
        uiProvider,
      );
  const buckets = aggregate.buckets;
  const serverOptions = aggregate.serverOptions.map((option) => ({ ...option, provider: uiProvider }));

  const explicitAggregateServer = Boolean(
    requestedServer?.startsWith("anivexa2-") ||
    requestedServer?.startsWith("anivexa-")
  );
  const entries = buckets.flatMap((bucket) => buildAnivexaServerEntries(bucket, uiProvider, dubbed));
  const exactEntry = requestedServer
    ? entries.find((entry) => entry.option.id === requestedServer)
    : null;
  const legacyEntry = requestedServer?.startsWith("anivexa-") && requestedWorkerProvider
    ? entries.find((entry) =>
        entry.bucket.provider === requestedWorkerProvider &&
        (!requestedTransport || entry.option.transport === requestedTransport) &&
        (dubbed || !requestedMode || entry.option.subType === requestedMode))
    : null;

  if (explicitAggregateServer && requestedWorkerProvider && !exactEntry && !legacyEntry) {
    recordLog("warn", "anime.anivexa.aggregate.requested_server_unavailable", {
      anilistId,
      episodeNumber: episodeNum,
      audio,
      requestedServer: requestedServer || "auto",
      requestedWorkerProvider,
      requestedMode: requestedMode || "auto",
      requestedTransport: requestedTransport || "auto",
      providers: buckets.map((bucket) => `${bucket.provider}:${bucket.subType}:${bucket.internal.length}/${bucket.embed.length}`).join(","),
    });
    return {
      source: null,
      subtitles: [],
      serverOptions,
      activeServerId: requestedServer || null,
      intro: null,
      outro: null,
    };
  }

  // DASH playback needs an encrypted proxy token, which needs AUTH_SECRET. If
  // that secret is missing, DASH simply is not a usable transport — skip it in
  // auto-selection rather than letting the whole session fall over.
  const dashProxyAvailable = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  const transportUsable = (entry: AnivexaServerEntry) =>
    dashProxyAvailable || entry.option.transport !== "dash";

  const selectedEntry = exactEntry || legacyEntry ||
    entries.find((entry) =>
      entry.option.transport !== "embed" &&
      transportUsable(entry) &&
      (!requestedTransport || entry.option.transport === requestedTransport) &&
      (dubbed || !requestedMode || entry.option.subType === requestedMode)) ||
    entries.find((entry) => entry.option.transport !== "embed" && transportUsable(entry)) ||
    entries.find(transportUsable) ||
    entries[0] || null;
  const selectedBucket = selectedEntry?.bucket || null;
  const selectedStream = selectedEntry?.stream || null;
  const selectedType = selectedEntry?.option.transport || "embed";
  const activeId = selectedEntry?.option.id || requestedServer || null;

  const selectedReferer = selectedStream?.referer || selectedStream?.referrer ||
    (selectedBucket?.provider === "reanime" ? "https://flixcloud.cc/" : null);
  // createDashProxyToken throws when AUTH_SECRET/NEXTAUTH_SECRET is unset.
  // Degrade to "no DASH stream" instead of taking down the whole session.
  let dashProxyToken: string | null = null;
  if (selectedType === "dash" && selectedStream?.url) {
    try {
      dashProxyToken = createDashProxyToken(
        selectedStream.url,
        String(selectedStream.headers?.Authorization || selectedStream.headers?.authorization || ""),
        String(selectedReferer || ""),
      );
    } catch (error) {
      recordLog("warn", "anime.anivexa.dash_proxy_token_failed", {
        anilistId,
        episodeNumber: episodeNum,
        reason: error instanceof Error ? error.message : "DASH proxy token creation failed",
      });
      dashProxyToken = null;
    }
  }
  const streamProxyUrl = (assetUrl: string, referer?: string | null) =>
    dashProxyToken
      ? buildDashProxyUrl(assetUrl, dashProxyToken)
      : buildProxyUrl(API_BASE_URL, assetUrl, referer);
  const streamSubtitles = ensureArray(selectedStream?.__subtitles);
  const rawSubtitles = streamSubtitles.length > 0
    ? streamSubtitles
    : selectedEntry?.option.subType === "soft" ? selectedBucket?.subtitles || [] : [];
  const subtitleLangCounts = new Map<string, number>();
  const subtitles = preferEnglishSubtitleDefault(rawSubtitles
    .filter((s: any) => {
      const fmt = String(s.format || "").toLowerCase();
      return fmt !== "ass" && fmt !== "ssa" && Boolean(s.file || s.url);
    })
    .map((s: any) => {
      const rawUrl = String(s.file || s.url || "");
      const label = String(s.label || s.language || s.lang || s.srclang || "Subtitle");
      const baseLang = String(s.language || s.lang || s.srclang || s.label || "und");
      const seen = subtitleLangCounts.get(baseLang) || 0;
      subtitleLangCounts.set(baseLang, seen + 1);
      return {
        label: seen > 0 ? `${label} ${seen + 1}` : label,
        lang: seen > 0 ? `${baseLang}-${seen + 1}` : baseLang,
        url: rawUrl ? streamProxyUrl(rawUrl, s.referer || s.referrer || selectedReferer) : "",
        isDefault: false,
      };
    })
    .filter((s) => s.url));

  let source: StreamSource | null = null;
  if (selectedStream?.url) {
    const streamUrl = selectedStream.url;
    const isM3U8 = selectedType === "hls";
    const isDash = selectedType === "dash";
    const isEmbed = selectedType === "embed" || selectedStream.type === "embed";
    const embeddedFallbackCandidate =
      (typeof selectedStream.embed === "string" ? selectedStream.embed : null) ||
      selectedBucket?.embed[0]?.url ||
      null;
    const fallbackEmbedUrl =
      embeddedFallbackCandidate && /^https?:\/\//i.test(embeddedFallbackCandidate)
        ? embeddedFallbackCandidate
        : null;
    const requiresProxy = isDash ? Boolean(dashProxyToken) : Boolean(isM3U8 || selectedReferer);
    source = {
      kind: isEmbed ? "iframe" : isDash ? "dash" : isM3U8 ? "hls" : "video",
      label: selectedBucket?.label || "Anivexa",
      url: streamUrl,
      proxiedUrl: isDash ? null : requiresProxy ? buildProxyUrl(API_BASE_URL, streamUrl, selectedReferer, isM3U8 ? "playlist" : "video", selectedStream.playlist_key || selectedStream.key) : streamUrl,
      iframeUrl: isEmbed ? streamUrl : fallbackEmbedUrl,
      isM3U8,
      requiresProxy,
      dashProxyToken: dashProxyToken || undefined,
    };
  }

  const selectedPayload = selectedBucket?.payload || {};
  const introStart = selectedPayload.intro_start ?? selectedPayload.intro?.start ?? null;
  const introEnd = selectedPayload.intro_end ?? selectedPayload.intro?.end ?? null;
  const outroStart = selectedPayload.outro_start ?? selectedPayload.outro?.start ?? null;
  const outroEnd = selectedPayload.outro_end ?? selectedPayload.outro?.end ?? null;

  recordLog("info", "anime.anivexa.aggregate.selected", {
    anilistId,
    episodeNumber: episodeNum,
    audio,
    requestedServer: requestedServer || "auto",
    activeServerId: activeId || "none",
    sourceKind: source?.kind || "none",
    transport: selectedType,
    serverCount: serverOptions.length,
    providers: buckets.map((bucket) => `${bucket.provider}:${bucket.subType}:${bucket.internal.length}/${bucket.embed.length}`).join(","),
  });

  return {
    source,
    subtitles,
    serverOptions,
    activeServerId: activeId,
    intro: introStart != null ? { start: Number(introStart), end: Number(introEnd ?? (Number(introStart) + 90)) } : null,
    outro: outroStart != null ? { start: Number(outroStart), end: Number(outroEnd ?? (Number(outroStart) + 90)) } : null,
  };
}

// ReAnime streams include a FlixCloud playlist key used by the local HLS proxy.
async function fetchReanimeDirectWatchSession(
  anilistId: string,
  episodeNum: number,
  dubbed: boolean,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  const base = ANIVEXA_WORKER_URL;
  if (!base) throw new Error("NEXT_PUBLIC_ANIVEXA_WORKER_URL is not configured");

  const audio = dubbed ? "dub" : "sub";
  const gatewayMode = requestedGatewayMode(requestedServer);
  const requestedReanimeType =
    gatewayMode === "soft" ? "s-sub" :
    gatewayMode === "hard" ? "sub" :
    gatewayMode === "dub" ? "dub" :
    requestedServer?.endsWith("-s-sub") ? "s-sub" :
    requestedServer?.endsWith("-s-dub") ? "s-dub" :
    requestedServer?.endsWith("-sub") ? "sub" :
    requestedServer?.endsWith("-dub") ? "dub" :
    null;
  const workerUrl = `${base}/watch/reanime/${anilistId}/${audio}/reanime-${episodeNum}`;

  recordLog("info", "anime.anivexa.reanime.request", {
    anilistId,
    episodeNumber: episodeNum,
    audio,
    requestedServer: requestedServer || "auto",
    requestedType: requestedReanimeType || "auto",
    workerPath: `/watch/reanime/${anilistId}/${audio}/reanime-${episodeNum}`,
  });

  const response = await fetch(workerUrl, {
    headers: { Accept: "application/json", "User-Agent": "AnimeKAI-Frontend/1.0" },
    signal: AbortSignal.timeout(22_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    recordLog("warn", "anime.anivexa.reanime.http_error", {
      anilistId,
      episodeNumber: episodeNum,
      audio,
      status: response.status,
    }, body.slice(0, 180));
    throw new Error(`Anivexa/reanime ${response.status}: ${body.slice(0, 120)}`);
  }

  const data = (await response.json()) as Record<string, any>;
  recordLog("info", "anime.anivexa.reanime.payload", {
    anilistId,
    episodeNumber: episodeNum,
    audio,
    streamCount: ensureArray(data.streams || []).length,
    subtitleCount: ensureArray(data.subtitles || []).length,
    allServerCount: ensureArray(data.allServers || data.data?.allServers).length,
    hasRedirect: Boolean(data.redirect_url),
    hasStreamUrl: Boolean(data.stream_url),
  });

  // Intro / Outro from worker data
  const introStart = data.intro_start ?? data.intro?.start ?? null;
  const introEnd   = data.intro_end   ?? data.intro?.end   ?? null;
  const outroStart = data.outro_start ?? data.outro?.start ?? null;
  const outroEnd   = data.outro_end   ?? data.outro?.end   ?? null;
  const intro = introStart != null ? { start: Number(introStart), end: Number(introEnd ?? (Number(introStart) + 90)) } : null;
  const outro = outroStart != null ? { start: Number(outroStart), end: Number(outroEnd ?? (Number(outroStart) + 90)) } : null;

  const relevantServers = ensureArray(data.streams)
    .filter((stream: any) => stream.type === "hls" && typeof stream.url === "string" &&
      dubbed === String(stream.audio || audio).includes("dub"))
    .sort((left: any, right: any) => Number(right.server === "HD-1") - Number(left.server === "HD-1"));

  const serverOptions: ServerOption[] = relevantServers.map((s: any, i: number) => {
    const typeStr = String(s.audio || audio).toLowerCase();
    const sType: "soft" | "hard" = typeStr === "s-sub" ? "soft" : "hard";
    const serverId = `reanime-${(s.server || "HD").toLowerCase().replace(/\s+/g, "-") || String(i)}-${typeStr}`;
    return {
      id: serverId,
      label: `Re ${s.server || "HD"}`,
      provider: "reanime" as ProviderId,
      category: audio,
      subType: dubbed ? undefined : sType,
      transport: "hls",
    };
  });
  if (serverOptions.length === 0) {
    serverOptions.push({
      id: "reanime-default",
      label: "Reanime Default",
      provider: "reanime" as ProviderId,
      category: audio,
      subType: dubbed ? undefined : "hard",
    });
  }

  const requestedIndex = requestedServer
    ? serverOptions.findIndex((option) => option.id === requestedServer)
    : -1;
  const preferredIndex = requestedReanimeType
    ? relevantServers.findIndex((stream: any) => stream.audio === requestedReanimeType)
    : -1;
  const selectedIndex = requestedIndex >= 0 ? requestedIndex : preferredIndex >= 0 ? preferredIndex : 0;
  const selectedStream: any = relevantServers[selectedIndex] || null;
  const activeId = serverOptions[selectedIndex]?.id || "reanime-default";
  const source: StreamSource | null = selectedStream ? {
    kind: "hls",
    label: "Reanime",
    url: selectedStream.url,
    proxiedUrl: buildProxyUrl(API_BASE_URL, selectedStream.url, "https://flixcloud.cc/", "playlist", selectedStream.playlist_key || selectedStream.key),
    iframeUrl: null,
    isM3U8: true,
    requiresProxy: true,
  } : null;


  // Subtitles from worker response
  const rawSubtitles = ensureArray(selectedStream?.subtitles || data.subtitles || []);
  const subtitles: SubtitleTrack[] = rawSubtitles
    .filter((s: any) => {
      const fmt = String(s.format || "").toLowerCase();
      if (fmt === "ass" || fmt === "ssa") return false;
      return Boolean(s.file || s.url);
    })
    .map((s: any) => ({
      label: String(s.label || s.language || s.lang || s.srclang || "Subtitle"),
      lang: String(s.language || s.lang || s.srclang || s.label || "Unknown"),
      url: String(s.file || s.url || ""),
      isDefault: Boolean(s.default),
    }))
    .filter((s: SubtitleTrack) => Boolean(s.url));

  recordLog("info", "anime.anivexa.reanime.selected", {
    anilistId,
    episodeNumber: episodeNum,
    audio,
    activeServerId: activeId,
    serverCount: serverOptions.length,
    subtitleCount: subtitles.length,
    sourceKind: source?.kind || "none",
    isM3U8: Boolean(source?.isM3U8),
    sourceUrlKind: source ? "flixcloud" : "none",
  });

  return { source, subtitles, serverOptions, activeServerId: activeId, intro, outro };
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
        case "gogoanime":
          return fetchGogoAnimeWatchSession(episodeId, dubbed, requestedServer);
        case "reanime": {
          const [anilistId, epNumStr] = episodeId.split("::");
          const epNum = Number(epNumStr || "1");
          return fetchReanimeDirectWatchSession(anilistId, epNum, dubbed, requestedServer);
        }
        case "anikoto":
        case "animegg":
        case "anineko": {
          const [anilistId, epNumStr] = episodeId.split("::");
          const epNum = Number(epNumStr || "1");
          return fetchAniviexaWatchSession(provider as AniviexaProvider, anilistId, epNum, dubbed, requestedServer);
        }
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
        case "gogoanime":
          return fetchGogoAnimeWatchSession(episodeId, dubbed, requestedServer);
        case "reanime": {
          const [anilistId, epNumStr] = episodeId.split("::");
          const epNum = Number(epNumStr || "1");
          return fetchReanimeDirectWatchSession(anilistId, epNum, dubbed, requestedServer);
        }
        case "anikoto":
        case "animegg":
        case "anineko": {
          const [anilistId, epNumStr] = episodeId.split("::");
          const epNum = Number(epNumStr || "1");
          return fetchAniviexaWatchSession(provider as AniviexaProvider, anilistId, epNum, dubbed, requestedServer);
        }
        default:
          throw new Error(`Provider ${provider} is not supported for streaming`);
      }
    },
  );
}

const CUSTOM_SERVERS = [
  "megaplay-sub", "megaplay-dub",
  "animeplay-sub", "animeplay-dub",
  "tryembed-sub", "tryembed-dub",
  "mostream-sub", "mostream-dub"
] as const;

function isCustomEmbed(server: string | null | undefined): boolean {
  if (!server) return false;
  return (CUSTOM_SERVERS as readonly string[]).includes(server);
}

/** Default to Server 1 (megaplay) when an embed server is explicitly needed. */
function defaultCustomServer(server: string | null | undefined, dubbed: boolean | undefined): string {
  if (server && server !== "auto") return server;
  return dubbed ? "megaplay-dub" : "megaplay-sub";
}

function explicitCustomServer(server: string | null | undefined): string | null {
  return server && server !== "auto" && isCustomEmbed(server) ? server : null;
}

function buildStreamProviderOrder(preferredProvider: ProviderId, activeProvider: ProviderId): ProviderId[] {
  if (ANIVEXA_PROVIDER_SET.has(preferredProvider)) {
    return [preferredProvider];
  }
  return buildProviderOrder(preferredProvider, activeProvider);
}

function compactProviderLabel(provider: ProviderId): string {
  switch (provider) {
    case "reanime": return "Re";
    case "anikoto": return "Koto";
    case "animegg": return "GG";
    case "anineko": return "Neko";
    case "animekai": return "Kai";
    case "gogoanime": return "Gogo";
    case "desidub": return "Hindi";
    case "hianime": return "Hi";
    default: return provider;
  }
}

function compactStreamServerLabel(provider: ProviderId, serverName: string, type: string, quality?: string | null): string {
  const providerLabel = compactProviderLabel(provider);
  const cleanedServer = serverName
    .replace(/-embed$/i, "")
    .replace(/^mega?play$/i, "Mega")
    .replace(/^vidwish$/i, "Vid")
    .replace(/^animegg$/i, "")
    .trim();
  const detail = quality || (type === "embed" ? "Embed" : type === "hls" ? "HLS" : type.toUpperCase());
  return [providerLabel, cleanedServer, detail].filter(Boolean).join(" ");
}

function requestedGatewayMode(server: string | null | undefined): "soft" | "hard" | "dub" | null {
  if (!server?.startsWith("anivexa-")) return null;
  if (server.endsWith("-hsub")) return "hard";
  if (server.endsWith("-ssub")) return "soft";
  if (server.endsWith("-dub")) return "dub";
  if (server.endsWith("-sub")) return "soft";
  return null;
}

function requestedAnivexaAggregateMode(server: string | null | undefined): "soft" | "hard" | "unknown" | "dub" | null {
  if (!server) return null;
  if (server.startsWith("anivexa2-")) {
    if (server.endsWith("-hard")) return "hard";
    if (server.endsWith("-soft")) return "soft";
    if (server.endsWith("-unknown")) return "unknown";
    if (server.endsWith("-dub")) return "dub";
    return null;
  }
  return requestedGatewayMode(server);
}

function requestedAnivexaAggregateProvider(server: string | null | undefined): AnivexaWorkerProvider | null {
  if (!server) return null;
  if (server.startsWith("anivexa2-")) {
    const [, provider] = server.match(/^anivexa2-([a-z0-9]+)-/) || [];
    const workerProvider = provider as AnivexaWorkerProvider;
    return ANIVEXA_WORKER_PROVIDERS.includes(workerProvider) ? workerProvider : null;
  }
  if (server.startsWith("anivexa-")) {
    const [, provider] = server.match(/^anivexa-([a-z0-9]+)-/) || [];
    const workerProvider = provider as AnivexaWorkerProvider;
    return ANIVEXA_WORKER_PROVIDERS.includes(workerProvider) ? workerProvider : null;
  }
  return null;
}

function anivexaProviderForUi(provider: ProviderId): ProviderId {
  return provider === "desidub" ? "animekai" : provider;
}

function normalizeAnivexaWatchPayload(data: Record<string, any>, provider: AnivexaWorkerProvider, dubbed: boolean) {
  const envelopes = dubbed
    ? [
        { key: "sdub", payload: data.sdub, subType: undefined as "soft" | "hard" | undefined },
        { key: "hdub", payload: data.hdub, subType: undefined as "soft" | "hard" | undefined },
        { key: "dub", payload: data.dub, subType: undefined as "soft" | "hard" | undefined },
      ]
    : [
        { key: "ssub", payload: data.ssub, subType: "soft" as const },
        { key: "hsub", payload: data.hsub, subType: "hard" as const },
        { key: "sub", payload: data.sub, subType: undefined as "soft" | "hard" | undefined },
      ];

  const usableEnvelopes = envelopes.filter((entry) => entry.payload && typeof entry.payload === "object");
  const fallbackPayload = data.result || data.data || data;
  const selected = usableEnvelopes.length
    ? usableEnvelopes
    : [{ key: "root", payload: fallbackPayload, subType: undefined as "soft" | "hard" | undefined }];

  const streams = selected.flatMap((entry) =>
    ensureArray(entry.payload.streams || []).map((stream: any) => ({
      ...stream,
      __payload: entry.payload,
      __envelopeKey: entry.key,
      __subType: entry.subType,
      __subtitles: extractAnivexaStreamSubtitles(stream),
    })),
  );
  const mkissaStreams = provider === "mkissa"
    ? ensureArray(data.sources).flatMap((source: any) => {
        const referer = source.headers?.Referer || source.headers?.referer || null;
        const server = String(source.name || "MKissa");
        const directUrl = String(source.extractedUrl || "");
        const directType = String(source.extractedType || "").toLowerCase();
        const embedUrl = String(source.url || "");
        const direct = /^https?:\/\//i.test(directUrl) && (directType === "hls" || directType === "mp4")
          ? [{ url: directUrl, type: directType, server, referer, priority: source.priority, audio: data.audio }]
          : [];
        const embed = /^https?:\/\//i.test(embedUrl)
          ? [{ url: embedUrl, type: "embed", server, referer, priority: source.priority, audio: data.audio }]
          : [];
        return [...direct, ...embed];
      })
    : [];
  const fallbackStreams = streams.length > 0
    ? streams
    : [...ensureArray(data.streams), ...mkissaStreams].map((stream: any) => ({
        ...stream,
        __payload: fallbackPayload,
        __envelopeKey: "root",
        __subType: undefined,
        __subtitles: extractAnivexaStreamSubtitles(stream),
      }));
  const subtitles = selected.flatMap((entry) => ensureArray(entry.payload.subtitles || []));
  const streamSubtitles = fallbackStreams.flatMap((stream: any) => ensureArray(stream.__subtitles));
  const rootSubtitles = dedupeAnivexaSubtitles([
    ...subtitles,
    ...streamSubtitles,
    ...ensureArray(data.subtitles),
  ]);
  const download = selected.find((entry) => entry.payload.download)?.payload.download || data.download || null;

  return { streams: fallbackStreams, subtitles: rootSubtitles, download, payloads: selected, fallbackPayload };
}

function normalizeAnivexaStreamUrl(stream: any, base: string): any {
  const rawUrl = String(stream?.url || "");
  if (!rawUrl) return stream;
  try {
    return { ...stream, url: new URL(rawUrl, `${base}/`).toString() };
  } catch {
    return stream;
  }
}

function isAnivexaInternalStream(stream: any): boolean {
  const transport = anivexaStreamTransport(stream);
  return transport === "hls" || transport === "mp4" || transport === "dash";
}

function isAnivexaEmbedStream(stream: any): boolean {
  return anivexaStreamTransport(stream) === "embed";
}

function anivexaStreamTransport(stream: any): NonNullable<ServerOption["transport"]> | null {
  const url = String(stream?.url || "");
  if (!url) return null;
  const type = String(stream?.type || "").toLowerCase();
  const server = String(stream?.server || "").toLowerCase();
  const cleanUrl = url.split("?")[0].toLowerCase();
  const lowerUrl = url.toLowerCase();

  if (type === "dash" || /\.mpd$/i.test(cleanUrl)) return "dash";

  if (
    type === "hls" ||
    type === "hls-redirect" ||
    server.startsWith("hls") ||
    /\.m3u8$/i.test(cleanUrl) ||
    lowerUrl.includes("m3u8-proxy")
  ) return "hls";
  if (type === "mp4" || /\.mp4$/i.test(cleanUrl)) return "mp4";
  if (type === "embed") return "embed";
  return null;
}

function sortAnivexaInternalStreams(streams: any[]): any[] {
  return streams.slice().sort((left, right) => {
    const leftTransport = anivexaStreamTransport(left) || "embed";
    const rightTransport = anivexaStreamTransport(right) || "embed";
    const transportDelta = ANIVEXA_TRANSPORT_PRIORITY[leftTransport] - ANIVEXA_TRANSPORT_PRIORITY[rightTransport];
    if (transportDelta !== 0) return transportDelta;
    const subtitleDelta = ensureArray(right.__subtitles).length - ensureArray(left.__subtitles).length;
    if (subtitleDelta !== 0) return subtitleDelta;
    return Number(right.priority || 0) - Number(left.priority || 0);
  });
}

function requestedAnivexaAggregateTransport(server: string | null | undefined): NonNullable<ServerOption["transport"]> | null {
  if (!server) return null;
  const match = server.match(/^anivexa2-[a-z0-9]+-(hls|mp4|dash|embed)-/);
  if (!match) return null;
  return match[1] as NonNullable<ServerOption["transport"]>;
}

function anivexaSubTypeForProvider(provider: AnivexaWorkerProvider, stream: any, subtitles: any[]): "soft" | "hard" | "unknown" {
  if (stream.__subType === "hard" || stream.__subType === "soft") return stream.__subType;
  const explicitType = String(stream.subtitleType || stream.subType || "").toLowerCase();
  if (explicitType === "hardsub" || explicitType === "hard") return "hard";
  if (explicitType === "softsub" || explicitType === "soft") return "soft";
  if (provider === "reanime" && stream.audio === "sub") return "hard";
  if (provider === "reanime" && stream.audio === "s-sub") return "soft";
  if (provider === "aniwaves" && /vidplay/i.test(String(stream.server || stream.name || ""))) return "hard";
  if (ANIVEXA_HARD_SUB_PROVIDERS.has(provider)) return "hard";
  if (ensureArray(stream.__subtitles).length > 0) return "soft";
  // Prism can return burned-in and external-caption variants in the same
  // response. Provider-wide captions must not turn a burned-in stream soft.
  if (provider === "anineko") return "hard";
  if (subtitles.length > 0) return "soft";
  return "unknown";
}

function extractAnivexaStreamSubtitles(stream: any): any[] {
  const explicit = ensureArray(stream?.subtitles || stream?.tracks)
    .filter((track: any) => Boolean(track?.file || track?.url));
  const directSubtitle = typeof stream?.subtitle === "string" && /^https?:\/\//i.test(stream.subtitle)
    ? [{
        file: stream.subtitle,
        url: stream.subtitle,
        label: anivexaSubtitleLabel(stream.subtitle),
        language: anivexaSubtitleLang(stream.subtitle),
      }]
    : [];
  const inferred: any[] = [];
  const candidates = [
    String(stream?.referer || ""),
    String(stream?.referrer || ""),
    String(stream?.url || ""),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      const values = Array.from(parsed.searchParams.entries())
        .filter(([key]) => /^(?:sub|subtitle|subtitles|track|caption_\d+|c\d+_file)$/i.test(key))
        .map(([, value]) => value);
      for (const value of values) {
        if (!value) continue;
        const decoded = decodeURIComponent(value);
        if (!/^https?:\/\//i.test(decoded)) continue;
        inferred.push({
          file: decoded,
          url: decoded,
          label: anivexaSubtitleLabel(decoded),
          language: anivexaSubtitleLang(decoded),
          format: decoded.split("?")[0].toLowerCase().endsWith(".srt") ? "srt" : "vtt",
          referer: parsed.origin,
        });
      }
    } catch {
      // Ignore malformed provider URLs.
    }
  }

  return dedupeAnivexaSubtitles([...explicit, ...directSubtitle, ...inferred]);
}

export function classifyAnivexaStreamSubType(
  provider: AnivexaWorkerProvider,
  stream: any,
  subtitles: any[] = [],
): "soft" | "hard" | "unknown" {
  return anivexaSubTypeForProvider(provider, {
    ...stream,
    __subtitles: extractAnivexaStreamSubtitles(stream),
  }, subtitles);
}

function dedupeAnivexaSubtitles(subtitles: any[]): any[] {
  const seen = new Set<string>();
  return subtitles.filter((subtitle) => {
    const url = String(subtitle?.file || subtitle?.url || "");
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function anivexaSubtitleLang(url: string): string {
  const lower = url.toLowerCase();
  if (/(^|[_./-])eng?([_.-]|$)/.test(lower) || lower.includes("english")) return "en";
  if (/(^|[_./-])jpn?([_.-]|$)/.test(lower) || lower.includes("japanese")) return "ja";
  return "und";
}

function anivexaSubtitleLabel(url: string): string {
  const lang = anivexaSubtitleLang(url);
  if (lang === "en") return "English";
  if (lang === "ja") return "Japanese";
  return "Subtitle";
}

function isEnglishSubtitleTrack(track: SubtitleTrack): boolean {
  const value = `${track.lang} ${track.label}`.toLowerCase();
  return /(^|[\s_-])(?:en|eng|english)(?:$|[\s_-])/.test(value);
}

export function preferEnglishSubtitleDefault(tracks: SubtitleTrack[]): SubtitleTrack[] {
  if (tracks.length === 0) return tracks;
  const englishIndex = tracks.findIndex(isEnglishSubtitleTrack);
  const defaultIndex = englishIndex >= 0 ? englishIndex : 0;
  return tracks.map((track, index) => ({
    ...track,
    isDefault: index === defaultIndex,
  }));
}

function appendCustomEmbedServers(
  serverOptions: ServerOption[],
  anime: CatalogAnime,
  activeProvider: ProviderId,
): ServerOption[] {
  if (!anime.malId && !anime.anilistId) {
    const routeAnilistId = parseAnilistPassthroughId(anime.id) || parseAnilistPassthroughId(anime.providerId);
    if (!routeAnilistId) return serverOptions;
  }

  // Series-level dub counts are not proof that this exact episode has a
  // playable dub. Only a dub option resolved for the current watch request can
  // unlock the Dub tab and its generic embed fallbacks.
  const hasConfirmedDub = serverOptions.some((option) =>
    option.category === "dub" &&
    !(CUSTOM_SERVERS as readonly string[]).includes(option.id) &&
    option.id !== "anivexa2-auto-hls-dub"
  );
  const customOptions: ServerOption[] = [
    {
      id: "megaplay-sub",
      label: "Server 1",
      provider: activeProvider,
      category: "sub",
      transport: "embed",
    },
    {
      id: "animeplay-sub",
      label: "Server 2",
      provider: activeProvider,
      category: "sub",
      transport: "embed",
    },
    {
      id: "tryembed-sub",
      label: "Server 3",
      provider: activeProvider,
      category: "sub",
      transport: "embed",
    },
    {
      id: "mostream-sub",
      label: "Server 4",
      provider: activeProvider,
      category: "sub",
      transport: "embed",
    },
  ];

  if (hasConfirmedDub) {
    customOptions.push(
      { id: "megaplay-dub", label: "Server 1", provider: activeProvider, category: "dub", transport: "embed" },
      { id: "animeplay-dub", label: "Server 2", provider: activeProvider, category: "dub", transport: "embed" },
      { id: "tryembed-dub", label: "Server 3", provider: activeProvider, category: "dub", transport: "embed" },
      { id: "mostream-dub", label: "Server 4", provider: activeProvider, category: "dub", transport: "embed" },
    );
  }

  const filtered = serverOptions.filter(
    (opt) => !customOptions.some((custom) => custom.id === opt.id)
  );

  return [...filtered, ...customOptions];
}


function resolveCustomEmbedSource(
  server: string,
  anime: CatalogAnime,
  episodeNumber: number,
): StreamSource | null {
  const malId = anime.malId;
  const anilistId = anime.anilistId;
  const [base, cat] = server.split("-");
  const isDub = cat === "dub";
  const lang = isDub ? "dub" : "sub";

  let iframeUrl = "";

  if (base === "megaplay") {
    // MegaPlay works better with AniList IDs for most content.
    // Use mal/ as fallback only when anilistId is missing.
    if (anilistId) {
      iframeUrl = `https://megaplay.buzz/stream/ani/${anilistId}/${episodeNumber}/${lang}`;
    } else if (malId) {
      iframeUrl = `https://megaplay.buzz/stream/mal/${malId}/${episodeNumber}/${lang}`;
    }
  } else if (base === "animeplay") {
    if (anilistId) {
      iframeUrl = `https://animeplay.cfd/stream/ani/${anilistId}/${episodeNumber}/${lang}`;
    } else if (malId) {
      iframeUrl = `https://animeplay.cfd/stream/mal/${malId}/${episodeNumber}/${lang}`;
    }
  } else if (base === "tryembed") {
    if (anilistId) {
      iframeUrl = `https://tryembed.us.cc/embed/anime/${anilistId}/${episodeNumber}/${lang}`;
    } else if (malId) {
      iframeUrl = `https://tryembed.us.cc/embed/anime/${malId}/${episodeNumber}/${lang}`;
    }
  } else if (base === "mostream") {
    if (malId) {
      iframeUrl = `https://mostream.us/anime.php?mal=${malId}&e=${episodeNumber}&lang=${lang}`;
    } else if (anilistId) {
      iframeUrl = `https://mostream.us/anime.php?mal=${anilistId}&e=${episodeNumber}&lang=${lang}`;
    }
  }

  if (!iframeUrl) return null;

  return {
    kind: "iframe",
    label: base.charAt(0).toUpperCase() + base.slice(1),
    url: null,
    proxiedUrl: null,
    iframeUrl,
    isM3U8: false,
    requiresProxy: false,
  };
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
      const order = buildStreamProviderOrder(preferredProvider, detail.activeProvider);
      const targetEpisode =
        detail.episodes.find((episode) => episode.number === Number(input.episodeNumber || 1));
      const episodeAvailableProviders = resolveEpisodeAvailableProviders(targetEpisode, detail.availableProviders);

      const watchAttempts: WatchAttempt[] = [];

      if (!targetEpisode) {
        // For anilist passthrough routes: synthesize episode if we have anilistId/malId
        if (canUseDirectEmbed(detail.anime)) {
          const epNum = Number(input.episodeNumber || 1);
          const synEp = makeSyntheticEpisode(epNum);
          const effectiveServer = explicitCustomServer(input.server);
          const source = effectiveServer ? resolveCustomEmbedSource(effectiveServer, detail.anime, epNum) : null;
          return {
            anime: detail.anime,
            episode: synEp,
            episodes: detail.episodes,
            seasons: detail.seasons,
            provider: preferredProvider,
            availableProviders: [],
            attempts: detail.attempts,
            watchAttempts: [{ provider: preferredProvider, server: effectiveServer || input.server || "auto", ok: Boolean(source), reason: source ? "Playback ready (embed)" : "No embed source" }],
            source,
            subtitles: [],
            serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
            activeServerId: source ? effectiveServer : null,
            dubbed: Boolean(input.dubbed),
            fallbackHistory: [],
          };
        }
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

      const effectiveServer = explicitCustomServer(input.server);

      if (effectiveServer) {
        const source = resolveCustomEmbedSource(effectiveServer, detail.anime, targetEpisode.number);
        if (source) {
          let originalServerOptions: ServerOption[] = [];
          try {
            const firstProvider = order.find((p) => targetEpisode.idByProvider[p]);
            if (firstProvider) {
              const providerEpisodeId = targetEpisode.idByProvider[firstProvider];
              if (providerEpisodeId) {
                const session = await fetchProviderFastWatch(firstProvider, providerEpisodeId, Boolean(input.dubbed), null);
                originalServerOptions = session.serverOptions;
              }
            }
          } catch {
            // Ignore
          }

          return {
            anime: detail.anime,
            episode: targetEpisode,
            episodes: detail.episodes,
            seasons: detail.seasons,
            provider: preferredProvider,
            availableProviders: episodeAvailableProviders,
            attempts: detail.attempts,
            watchAttempts: [{ provider: preferredProvider, server: effectiveServer, ok: true, reason: "Playback ready (custom embed)" }],
            source,
            subtitles: [],
            serverOptions: appendCustomEmbedServers(originalServerOptions, detail.anime, preferredProvider),
            activeServerId: effectiveServer,
            dubbed: Boolean(input.dubbed),
            fallbackHistory: [],
          };
        }
      }

      const anivexaAnilistId = detail.anime.anilistId || parseAnilistPassthroughId(input.animeId);
      for (const provider of order) {
        const providerEpisodeId =
          (provider === preferredProvider && input.episodeId) ||
          targetEpisode.idByProvider[provider] ||
          (provider === "gogoanime" ? `${detail.anime.title}|${detail.anime.subtitle || ""}::${targetEpisode.number}` : null) ||
          (ANIVEXA_PROVIDERS.includes(provider as AniviexaProvider) && anivexaAnilistId ? `${anivexaAnilistId}::${targetEpisode.number}` : null);
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
            serverOptions: appendCustomEmbedServers(session.serverOptions, detail.anime, provider),
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
        serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
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
          const order = buildStreamProviderOrder(preferredProvider, detail.activeProvider);
          const targetEpisode =
            detail.episodes.find((episode) => episode.number === Number(input.episodeNumber || 1));
          const episodeAvailableProviders = resolveEpisodeAvailableProviders(targetEpisode, detail.availableProviders);

          const watchAttempts: WatchAttempt[] = [];

          if (!targetEpisode) {
            // For anilist passthrough routes: synthesize episode if we have anilistId/malId
            if (canUseDirectEmbed(detail.anime)) {
              const epNum = Number(input.episodeNumber || 1);
              const synEp = makeSyntheticEpisode(epNum);
              const effectiveServer2 = explicitCustomServer(input.server);
              const source2 = effectiveServer2 ? resolveCustomEmbedSource(effectiveServer2, detail.anime, epNum) : null;
              return {
                anime: detail.anime,
                episode: synEp,
                episodes: detail.episodes,
                seasons: detail.seasons,
                provider: preferredProvider,
                availableProviders: [],
                attempts: detail.attempts,
                watchAttempts: [{ provider: preferredProvider, server: effectiveServer2 || input.server || "auto", ok: Boolean(source2), reason: source2 ? "Playback ready (embed)" : "No embed source" }],
                source: source2,
                subtitles: [],
                serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
                activeServerId: source2 ? effectiveServer2 : null,
                dubbed: Boolean(input.dubbed),
                fallbackHistory: [],
              };
            }
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

          const effectiveServer = explicitCustomServer(input.server);

          if (effectiveServer) {
            const source = resolveCustomEmbedSource(effectiveServer, detail.anime, targetEpisode.number);
            if (source) {
              let originalServerOptions: ServerOption[] = [];
              try {
                const firstProvider = order.find((p) => targetEpisode.idByProvider[p]);
                if (firstProvider) {
                  const providerEpisodeId = targetEpisode.idByProvider[firstProvider];
                  if (providerEpisodeId) {
                    const session = await fetchProviderFastWatch(firstProvider, providerEpisodeId, Boolean(input.dubbed), null);
                    originalServerOptions = session.serverOptions;
                  }
                }
              } catch {
                // Ignore
              }

              return {
                anime: detail.anime,
                episode: targetEpisode,
                episodes: detail.episodes,
                seasons: detail.seasons,
                provider: preferredProvider,
                availableProviders: episodeAvailableProviders,
                attempts: detail.attempts,
                watchAttempts: [{ provider: preferredProvider, server: effectiveServer, ok: true, reason: "Playback ready (custom embed)" }],
                source,
                subtitles: [],
                serverOptions: appendCustomEmbedServers(originalServerOptions, detail.anime, preferredProvider),
                activeServerId: effectiveServer,
                dubbed: Boolean(input.dubbed),
                fallbackHistory: [],
              };
            }
          }

          const anivexaAnilistId = detail.anime.anilistId || parseAnilistPassthroughId(input.animeId);
          for (const provider of order) {
            // GogoAnime uses title::episodeNumber composite key (no pre-mapping needed)
            const providerEpisodeId =
              (provider === preferredProvider && input.episodeId) ||
              targetEpisode.idByProvider[provider] ||
              (provider === "gogoanime" ? `${detail.anime.title}|${detail.anime.subtitle || ""}::${targetEpisode.number}` : null) ||
              (ANIVEXA_PROVIDERS.includes(provider as AniviexaProvider) && anivexaAnilistId ? `${anivexaAnilistId}::${targetEpisode.number}` : null);
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
                serverOptions: appendCustomEmbedServers(session.serverOptions, detail.anime, provider),
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
            serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
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
      persistent: false,
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
  server?: string | null;
}): Promise<WatchSessionModel> {
  const isAnilistWatchShell = parseAnilistPassthroughId(input.animeId) !== null;
  const detail = await getAnimeDetailModel(input.animeId, input.provider || null, {
    resolveProviderFallbacks: !isAnilistWatchShell,
    mergeEpisodeProviders: !isAnilistWatchShell,
  });
  const preferredProvider = input.provider || detail.activeProvider;
  const targetEpisode =
    detail.episodes.find((episode) => episode.number === Number(input.episodeNumber || 1));
  const episodeAvailableProviders = resolveEpisodeAvailableProviders(targetEpisode, detail.availableProviders);

  // For anilist~ passthrough routes: if no scraped episode list exists but we have
  // an anilistId/malId, use a synthetic episode and serve the custom embed directly.
  const effectiveEpNumber = Number(input.episodeNumber || 1);
  if (!isAnimeEpisodeReleased(detail.anime, effectiveEpNumber)) {
    return {
      anime: detail.anime,
      episode: targetEpisode || makeSyntheticEpisode(effectiveEpNumber),
      episodes: detail.episodes,
      seasons: detail.seasons,
      provider: preferredProvider,
      availableProviders: episodeAvailableProviders,
      attempts: detail.attempts,
      watchAttempts: [{ provider: preferredProvider, ok: false, reason: "Episode has not aired yet" }],
      source: null,
      subtitles: [],
      serverOptions: [],
      activeServerId: null,
      dubbed: Boolean(input.dubbed),
      fallbackHistory: ["AniList reports that this episode is not available yet"],
      stale: false,
      fallback: false,
      message: "This episode has not aired yet.",
    };
  }
  const syntheticEpisode = !targetEpisode && canUseDirectEmbed(detail.anime)
    ? makeSyntheticEpisode(effectiveEpNumber)
    : null;
  const resolvedTargetEpisode = targetEpisode || syntheticEpisode;

  if (!resolvedTargetEpisode) {
    return {
      anime: detail.anime,
      episode: {
        number: effectiveEpNumber,
        title: `Episode ${effectiveEpNumber}`,
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
      serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
      activeServerId: null,
      dubbed: Boolean(input.dubbed),
      fallbackHistory: ["Episode not found in current provider map"],
    };
  }
  const targetEpisode2 = resolvedTargetEpisode;

  if (isAnilistWatchShell) {
    return {
      anime: detail.anime,
      episode: targetEpisode2,
      episodes: detail.episodes,
      seasons: detail.seasons,
      provider: preferredProvider,
      availableProviders: episodeAvailableProviders,
      attempts: detail.attempts,
      watchAttempts: [{
        provider: preferredProvider,
        ok: false,
        reason: "Stream resolving in parallel with the watch page",
      }],
      source: null,
      subtitles: [],
      serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
      activeServerId: input.server && input.server !== "auto" ? input.server : null,
      dubbed: Boolean(input.dubbed),
      fallbackHistory: [],
      stale: true,
      fallback: false,
      message: null,
    };
  }

  // ─── DB-FIRST HLS PATH ────────────────────────────────────────────────────
  // If the catalog cron job has pre-seeded HLS streams for this episode in the
  // EpisodeStream table, return them instantly for premium HLS playback.
  // This gives instant load for all seeded anime without any scraping latency.
  //
  // Falls through to embed path if no DB cache found.
  try {
    const anilistId = detail.anime.anilistId;
    if (anilistId && !input.server?.startsWith("megaplay") && input.server !== "desidub" && input.server !== "scraper-sub" && input.server !== "scraper-dub") {
      const backendUrl = process.env.ANIME_API_BASE_URL || "http://localhost:5000";
      const dubbed = Boolean(input.dubbed);
      const [cachedResSub, cachedResDub] = await Promise.all([
        fetch(
          `${backendUrl}/api/streams/cached?anilistId=${anilistId}&episodeNumber=${targetEpisode2.number}&dubbed=0`,
          { signal: AbortSignal.timeout(3_000) },
        ).then((r) => r.json()).catch(() => ({ cached: false })),
        fetch(
          `${backendUrl}/api/streams/cached?anilistId=${anilistId}&episodeNumber=${targetEpisode2.number}&dubbed=1`,
          { signal: AbortSignal.timeout(3_000) },
        ).then((r) => r.json()).catch(() => ({ cached: false })),
      ]);

      const subStreams = cachedResSub?.cached && Array.isArray(cachedResSub.streams) ? cachedResSub.streams : [];
      const dubStreams = cachedResDub?.cached && Array.isArray(cachedResDub.streams) ? cachedResDub.streams : [];

      if (subStreams.length > 0 || dubStreams.length > 0) {
        // ── Classify all cached streams as soft-sub or hard-sub ───────────
        // Soft sub = stream has external VTT subtitle tracks users can toggle.
        // Hard sub = subtitles are burnt into the video pixels (no VTT file).
        type CachedStream = {
          provider: string;
          quality?: string;
          streamUrl: string;
          referer?: string;
          streams: Array<{ url: string; quality?: string; referer?: string }>;
          subtitles: Array<{ url?: string; label?: string; lang?: string; isDefault?: boolean }>;
          intro?: { start: number; end: number } | null;
          outro?: { start: number; end: number } | null;
          isDub: boolean;
        };

        const stableHlsProviders = new Set(["ally", "nekostream"]);
        const allCachedStreams: CachedStream[] = [
          ...subStreams.map((s: any) => ({ ...s, isDub: false })),
          ...dubStreams.map((s: any) => ({ ...s, isDub: true })),
        ].filter((s) => stableHlsProviders.has((s.provider || "").toLowerCase()));

        // ── Classification rules ─────────────────────────────────────────────
        // Streams from Gogoanime, Nekostream, Animepahe, and Wixstatic/Wixmp (ally)
        // are always hard-subbed (burnt-in pixels), even if they carry a VTT subtitle track.
        const isHardSubProvider = (s: CachedStream) => {
          const prov = (s.provider || "").toLowerCase();
          return (
            prov === "gogoanime" ||
            prov === "anidb" ||
            prov === "animepahe" ||
            prov === "ally" ||
            prov === "animegg"
          );
        };

        const getStreamSubType = (s: CachedStream): "soft" | "hard" => {
          return !isHardSubProvider(s) && Array.isArray(s.subtitles) && s.subtitles.length > 0
            ? "soft"
            : "hard";
        };

        // If the user requested a specific HLS server, check if we have it in the DB cache.
        // If not (e.g. they requested bonk but it's not in the DB yet), fall out of DB-first path
        // so it goes to the status/scraping API to fetch/scrape it on demand.
        const hasRequestedServer = !input.server || input.server === "auto" || input.server.startsWith("hls-") ||
          allCachedStreams.some((s) => s.isDub === dubbed && `hls-${s.provider}-${getStreamSubType(s)}` === input.server);

        if (hasRequestedServer) {
          // ── Subtitle Propagation ──────────────────────────────────────────────
          // Extract common subtitles from any hard-sub or soft-sub provider that has them (e.g. gogoanime)
          const commonSubtitles = allCachedStreams.reduce<CachedStream["subtitles"]>((acc, s) => {
            if (Array.isArray(s.subtitles) && s.subtitles.length > 0 && acc.length === 0) {
              return s.subtitles;
            }
            return acc;
          }, []);

          // Propagate common subtitles to any soft provider that lacks subtitles (like anidb/pewe)
          for (const s of allCachedStreams) {
            if (!isHardSubProvider(s) && (!Array.isArray(s.subtitles) || s.subtitles.length === 0)) {
              s.subtitles = commonSubtitles;
            }
          }

          const getMiruroAlias = (provider: string) => {
            const p = provider.toLowerCase();
            if (p === "gogoanime") return "bonk";
            if (p === "anidb") return "pewe";
            if (p === "nekostream") return "bee";
            if (p === "ally") return "ally";
            if (p === "animepahe") return "kiwi";
            if (p === "kickassanime") return "hop";
            return provider;
          };

          // ── Choose which stream to play based on user's server selection ──
          let chosenStream = allCachedStreams.find((s) => {
            const subType = getStreamSubType(s);
            return s.isDub === dubbed && input.server === `hls-${s.provider}-${subType}`;
          });

          // Backwards compatibility fallbacks
          if (!chosenStream && (input.server === "hls-softsub" || input.server === "hls-hardsub")) {
            const wantHard = input.server === "hls-hardsub";
            chosenStream = allCachedStreams.find((s) => s.isDub === dubbed && getStreamSubType(s) === (wantHard ? "hard" : "soft"))
              || allCachedStreams.find((s) => s.isDub === dubbed && getStreamSubType(s) === (wantHard ? "soft" : "hard"));
          }

          if (!chosenStream && preferredProvider) {
            chosenStream = allCachedStreams.find((s) => s.isDub === dubbed && s.provider === preferredProvider);
          }

          if (!chosenStream) {
            // Default: prefer soft-subbed stream, fallback to hard-subbed
            chosenStream = allCachedStreams.find((s) => s.isDub === dubbed && getStreamSubType(s) === "soft")
              || allCachedStreams.find((s) => s.isDub === dubbed);
          }

          if (!chosenStream) throw new Error("No playable cached stream");

          // ── Build StreamSource for the chosen stream ──────────────────────
          const rawStreams = chosenStream.streams || [];
          const bestRaw = rawStreams[0] || { url: chosenStream.streamUrl };
          const isWix = bestRaw.url.includes("wixmp.com") || bestRaw.url.includes("wixstatic.com");
          const encodedUrl = encodeURIComponent(bestRaw.url);
          const refererParam = bestRaw.referer ? `&referer=${encodeURIComponent(bestRaw.referer)}` : "";
          const proxiedUrl = isWix
            ? bestRaw.url
            : `${backendUrl}/api/proxy/m3u8-streaming-proxy?url=${encodedUrl}${refererParam}`;

          const chosenSubType = getStreamSubType(chosenStream);

          const subtitles: SubtitleTrack[] = (chosenStream.subtitles || []).map((sub) => {
            const rawUrl = sub.url || "";
            const isAbsolute = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
            const proxiedSubUrl = isAbsolute
              ? buildProxyUrl(backendUrl, rawUrl, chosenStream.referer || undefined, "video")
              : rawUrl;
            return {
              url: proxiedSubUrl,
              label: sub.label || "English",
              lang: sub.lang || "en",
              isDefault: sub.isDefault ?? false,
            };
          });

          const source: StreamSource = {
            kind: "hls",
            label: `HLS ${getMiruroAlias(chosenStream.provider)} (${chosenSubType.toUpperCase()})`,
            url: bestRaw.url,
            proxiedUrl,
            iframeUrl: null,
            isM3U8: true,
            requiresProxy: !isWix,
          };

          // ── Build HLS server option buttons dynamically for all cached streams ──
          const hlsServerOptions: ServerOption[] = allCachedStreams.map((s) => {
            const subType = getStreamSubType(s);
            const alias = getMiruroAlias(s.provider);
            return {
              id: `hls-${s.provider}-${subType}`,
              label: `${alias}`,
              provider: preferredProvider,
              category: s.isDub ? "dub" : "sub",
              subType: subType,
              transport: "hls",
            };
          });

          // Ensure fallbacks for all direct HLS providers are present in H-SUB/S-SUB and DUB server options
          const allHlsProviders = [
            { provider: "ally", alias: "ally", subType: "hard" as const },
            { provider: "nekostream", alias: "bee", subType: "soft" as const },
          ];

          for (const item of allHlsProviders) {
            // Ensure for Sub (category: "sub")
            const subId = `hls-${item.provider}-${item.subType}`;
            if (!hlsServerOptions.some((opt) => opt.id === subId && opt.category === "sub")) {
              hlsServerOptions.push({
                id: subId,
                label: item.alias,
                provider: preferredProvider,
                category: "sub",
                subType: item.subType,
                transport: "hls",
              });
            }

            // Ensure for Dub (category: "dub") only if the anime has confirmed dubs
            const dubExists = (detail.anime.dubCount != null && detail.anime.dubCount > 0) ||
              dubStreams.length > 0 ||
              targetEpisode2.isDubbed ||
              detail.episodes.some((ep) => ep.isDubbed);

            if (dubExists) {
              const dubId = `hls-${item.provider}-${item.subType}`;
              if (!hlsServerOptions.some((opt) => opt.id === dubId && opt.category === "dub")) {
                hlsServerOptions.push({
                  id: dubId,
                  label: item.alias,
                  provider: preferredProvider,
                  category: "dub",
                  subType: item.subType,
                  transport: "hls",
                });
              }
            }
          }

          if (hlsServerOptions.length === 0) {
            hlsServerOptions.push({ id: "hls-auto", label: "HLS Auto", provider: preferredProvider, category: dubbed ? "dub" : "sub", transport: "hls" });
          }
          const activeHlsServerId = `hls-${chosenStream.provider}-${chosenSubType}`;

          return {
            anime: detail.anime,
            episode: targetEpisode2,
            episodes: detail.episodes,
            seasons: detail.seasons,
            provider: preferredProvider,
            availableProviders: episodeAvailableProviders,
            attempts: detail.attempts,
            watchAttempts: [{ provider: "gogoanime" as ProviderId, ok: true, reason: `DB-cached HLS (${chosenSubType} sub)` }],
            source,
            subtitles,
            serverOptions: appendCustomEmbedServers(hlsServerOptions, detail.anime, preferredProvider),
            activeServerId: activeHlsServerId,
            dubbed,
            intro: chosenStream.intro || null,
            outro: chosenStream.outro || null,
            fallbackHistory: [`gogoanime: DB-cached HLS (${chosenStream.provider}, ${chosenSubType} sub)`],
            stale: false,
            fallback: false,
            message: null,
          };
        }
      }
    }
  } catch {
    // Non-fatal: fall through to embed path on any error
  }
  // ─── END DB-FIRST HLS PATH ────────────────────────────────────────────────

  const anivexaAnilistId = detail.anime.anilistId || parseAnilistPassthroughId(input.animeId);
  const shouldUseAnivexaAggregate =
    Boolean(
      anivexaAnilistId &&
      ANIVEXA_PROVIDERS.includes(preferredProvider as AniviexaProvider) &&
      (!input.server || input.server === "auto" || input.server.startsWith("anivexa2-") || input.server.startsWith("anivexa-"))
    );

  if (shouldUseAnivexaAggregate && anivexaAnilistId) {
    try {
      const session = await fetchAnivexaAggregateWatchSession(
        String(anivexaAnilistId),
        targetEpisode2.number,
        Boolean(input.dubbed),
        input.server || null,
        anivexaProviderForUi(preferredProvider),
      );

      if (session.source) {
        return {
          anime: detail.anime,
          episode: targetEpisode2,
          episodes: detail.episodes,
          seasons: detail.seasons,
          provider: preferredProvider,
          availableProviders: episodeAvailableProviders,
          attempts: detail.attempts,
          watchAttempts: [{
            provider: preferredProvider,
            server: session.activeServerId || input.server || "auto",
            ok: true,
            reason: "Anivexa aggregate auto-selected source",
          }],
          source: session.source,
          subtitles: session.subtitles,
          serverOptions: appendCustomEmbedServers(session.serverOptions, detail.anime, anivexaProviderForUi(preferredProvider)),
          activeServerId: session.activeServerId,
          dubbed: Boolean(input.dubbed),
          intro: session.intro || null,
          outro: session.outro || null,
          fallbackHistory: [],
          stale: false,
          fallback: false,
          message: null,
        };
      }

      recordLog("warn", "anime.anivexa.quick.no_source", {
        animeId: input.animeId,
        anilistId: anivexaAnilistId,
        episodeNumber: targetEpisode2.number,
        provider: preferredProvider,
        serverCount: session.serverOptions.length,
      });
    } catch (error) {
      recordLog(
        "warn",
        "anime.anivexa.quick.failed",
        {
          animeId: input.animeId,
          anilistId: anivexaAnilistId,
          episodeNumber: targetEpisode2.number,
          provider: preferredProvider,
        },
        error instanceof Error ? error.message : "Unable to resolve Anivexa aggregate watch session",
      );
    }
  }

  if (input.server === "scraper-sub" || input.server === "scraper-dub") {
    return {
      anime: detail.anime,
      episode: targetEpisode2,
      episodes: detail.episodes,
      seasons: detail.seasons,
      provider: preferredProvider,
      availableProviders: episodeAvailableProviders,
      attempts: detail.attempts,
      watchAttempts: [{ provider: preferredProvider, server: input.server, ok: false, reason: "No scraped HLS stream found in database" }],
      source: null,
      subtitles: [],
      serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
      activeServerId: input.server,
      dubbed: Boolean(input.dubbed),
      fallbackHistory: ["Scraper database lookup returned no cached streams"],
      stale: false,
      fallback: false,
      message: "No scraped HLS stream found in database for this episode.",
    };
  }

  // ─── INSTANT EMBED PATH ───────────────────────────────────────────────────
  // For any anime where the active server is a custom embed (MegaPlay, AnimePlay,
  // TryEmbed, MoStream) AND the anime has an anilistId or malId:
  // → Skip the /api/watch-session-status roundtrip entirely.
  // → Return the iframe URL immediately — no Python backend required.
  //
  // This means the watch page loads INSTANTLY for ~99% of anime.
  // The backend is only needed for DesiDub (Hindi) or legacy provider HLS streams.
  const effectiveServerForEmbed = explicitCustomServer(input.server);
  const isDirectEmbedRoute =
    Boolean(effectiveServerForEmbed) &&
    canUseDirectEmbed(detail.anime);

  if (isDirectEmbedRoute && effectiveServerForEmbed) {
    const source = resolveCustomEmbedSource(effectiveServerForEmbed, detail.anime, targetEpisode2.number);
    return {
      anime: detail.anime,
      episode: targetEpisode2,
      episodes: detail.episodes,
      seasons: detail.seasons,
      provider: preferredProvider,
      availableProviders: episodeAvailableProviders,
      attempts: detail.attempts,
      watchAttempts: [{ provider: preferredProvider, server: effectiveServerForEmbed, ok: Boolean(source), reason: source ? "Playback ready (embed)" : "No embed source" }],
      source,
      subtitles: [],
      serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider),
      activeServerId: source ? effectiveServerForEmbed : null,
      dubbed: Boolean(input.dubbed),
      fallbackHistory: [],
      stale: false,
      fallback: false,
      message: null,
    };
  }
  // ─── END INSTANT EMBED PATH ───────────────────────────────────────────────


  const providerEpisodeId = input.episodeId || targetEpisode2.idByProvider[preferredProvider] || "";
  const params = new URLSearchParams({
    animeId: input.animeId,
    title: detail.anime.title,
    episode: String(targetEpisode2.number),
    provider: preferredProvider,
    dubbed: input.dubbed ? "1" : "0",
    server: input.server || "auto",
    episodeId: providerEpisodeId,
  });

  const statusRes = await apiJson<{ status: string; payload?: any }>(
    `/api/watch-session-status?${params.toString()}`
  ).catch(() => ({ status: "stale", payload: undefined }));

  const payload = statusRes.payload || {};

  return {
    anime: detail.anime,
    episode: targetEpisode2,
    episodes: detail.episodes,
    seasons: detail.seasons,
    provider: payload.provider || preferredProvider,
    availableProviders: episodeAvailableProviders,
    attempts: detail.attempts,
    watchAttempts: payload.watchAttempts || [],
    source: payload.source || null,
    subtitles: payload.subtitles || [],
    serverOptions: appendCustomEmbedServers(payload.serverOptions || [], detail.anime, preferredProvider),
    activeServerId: payload.activeServerId || null,
    dubbed: Boolean(input.dubbed),
    fallbackHistory: payload.fallbackHistory || ["Stream pending — resolving on client"],
    stale: statusRes.status === "stale",
    fallback: statusRes.status === "fallback",
    message: statusRes.status === "stale" ? "Resolving stream..." : null,
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
  const isAnivexaSourceRequest = Boolean(
    input.server?.startsWith("anivexa2-") ||
    input.server?.startsWith("anivexa-") ||
    (!input.server && input.provider && ANIVEXA_PROVIDERS.includes(input.provider as AniviexaProvider))
  );
  const cacheKey = `stream:${input.animeId}:ep${input.episodeNumber || 1}:${input.dubbed ? "dub" : "sub"}:${input.server || "auto"}:${input.provider || "auto"}`;

  return cacheFetch(cacheKey, async () => measureAsync(
    "anime.stream.resolve",
    {
      requestedProvider: input.provider || "auto",
      dubbed: input.dubbed ? "dub" : "sub",
      server: input.server || "auto",
    },
    async () => {
      const passthroughAnilistId = parseAnilistPassthroughId(input.animeId);
      const earlyProvider = input.provider || "anikoto";
      const canStartAggregateEarly = Boolean(
        passthroughAnilistId &&
        (
          input.server?.startsWith("anivexa2-") ||
          input.server?.startsWith("anivexa-") ||
          (!input.server && ANIVEXA_PROVIDERS.includes(earlyProvider as AniviexaProvider))
        )
      );
      const earlyAggregate = canStartAggregateEarly && passthroughAnilistId
        ? fetchAnivexaAggregateWatchSession(
            String(passthroughAnilistId),
            Number(input.episodeNumber || 1),
            Boolean(input.dubbed),
            input.server || null,
            anivexaProviderForUi(earlyProvider),
          ).then(
            (session) => ({ session, error: null as unknown }),
            (error: unknown) => ({ session: null, error }),
          )
        : null;

      // AniList passthrough watch pages already have their display metadata.
      // Return the provider result immediately instead of holding a playable
      // source behind a second AniList/detail-model request.
      if (passthroughAnilistId && earlyAggregate) {
        const earlyResult = await earlyAggregate;
        if (earlyResult.session?.source) {
          const runtimeProvider = anivexaProviderForUi(earlyProvider);
          const runtimeAnime: CatalogAnime = {
            id: input.animeId,
            provider: runtimeProvider,
            providerId: String(passthroughAnilistId),
            href: `/anime/${encodeURIComponent(input.animeId)}`,
            title: `AniList ${passthroughAnilistId}`,
            genres: [],
            anilistId: passthroughAnilistId,
            providerIds: { [runtimeProvider]: String(passthroughAnilistId) },
          };
          const session = earlyResult.session;
          return {
            source: session.source,
            subtitles: session.subtitles,
            serverOptions: appendCustomEmbedServers(session.serverOptions, runtimeAnime, runtimeProvider),
            activeServerId: session.activeServerId,
            provider: earlyProvider,
            intro: session.intro || null,
            outro: session.outro || null,
            watchAttempts: [{
              provider: earlyProvider,
              server: input.server || undefined,
              ok: true,
              reason: "Anivexa playback ready",
            }],
          };
        }
      }

      const detail = await getAnimeDetailModel(input.animeId, input.provider || null, {
        resolveProviderFallbacks: true,
        mergeEpisodeProviders: true,
      });
      const preferredProvider = input.provider || detail.activeProvider;
      const requestedEpisodeNumber = Number(input.episodeNumber || 1);
      if (!isAnimeEpisodeReleased(detail.anime, requestedEpisodeNumber)) {
        return {
          source: null,
          subtitles: [],
          serverOptions: [],
          activeServerId: null,
          provider: preferredProvider,
          watchAttempts: [{ provider: preferredProvider, ok: false, reason: "Episode has not aired yet" }],
        };
      }
      const order = buildStreamProviderOrder(preferredProvider, detail.activeProvider);
      const targetEpisode =
        detail.episodes.find((ep) => ep.number === Number(input.episodeNumber || 1));

      // For anilist passthrough routes with no scraped episodes, build a synthetic episode
      const synEpisodeNum = Number(input.episodeNumber || 1);
      const resolvedEp = targetEpisode || (canUseDirectEmbed(detail.anime) ? makeSyntheticEpisode(synEpisodeNum) : null);

      if (!resolvedEp) {
        recordCounter("anime.stream.failure", 1, { reason: "episode_missing" });
        return {
          source: null, subtitles: [], serverOptions: appendCustomEmbedServers([], detail.anime, preferredProvider), activeServerId: null,
          provider: preferredProvider,
          watchAttempts: [{ provider: preferredProvider, ok: false, reason: "Episode not found" }],
        };
      }
      // Use resolvedEp instead of targetEpisode below
      // (rename to avoid redeclaration in same scope)
      const resolvedTargetEp = resolvedEp;
      const anivexaAnilistId = detail.anime.anilistId || parseAnilistPassthroughId(input.animeId);

      const effectiveServer = explicitCustomServer(input.server);

      const shouldUseAnivexaAggregate =
        Boolean(
          input.server?.startsWith("anivexa2-") ||
          input.server?.startsWith("anivexa-") ||
          (!input.server && ANIVEXA_PROVIDERS.includes(preferredProvider as AniviexaProvider))
        );
      if (shouldUseAnivexaAggregate && anivexaAnilistId) {
        const earlyResult = earlyAggregate ? await earlyAggregate : null;
        if (earlyResult?.error) {
          throw earlyResult.error;
        }
        const session = earlyResult?.session || await fetchAnivexaAggregateWatchSession(
          String(anivexaAnilistId),
          resolvedTargetEp.number,
          Boolean(input.dubbed),
          input.server || null,
          anivexaProviderForUi(preferredProvider),
        );
        const serverOptions = appendCustomEmbedServers(session.serverOptions, detail.anime, anivexaProviderForUi(preferredProvider));
        const watchAttempts: WatchAttempt[] = [{
          provider: preferredProvider,
          server: input.server || undefined,
          ok: Boolean(session.source),
          reason: session.source ? "Anivexa aggregate playback ready" : "No playable Anivexa source",
        }];
        if (!session.source) {
          const genericFallback = serverOptions.find((option) =>
            option.category === (input.dubbed ? "dub" : "sub") &&
            /^(megaplay|animeplay|tryembed|mostream)-/.test(option.id)
          );
          const genericSource = genericFallback
            ? resolveCustomEmbedSource(genericFallback.id, detail.anime, resolvedTargetEp.number)
            : null;
          if (genericSource && genericFallback) {
            watchAttempts.push({
              provider: preferredProvider,
              server: genericFallback.id,
              ok: true,
              reason: "Anivexa unavailable; existing embed fallback ready",
            });
            return {
              source: genericSource,
              subtitles: [],
              serverOptions,
              activeServerId: genericFallback.id,
              provider: preferredProvider,
              intro: session.intro || null,
              outro: session.outro || null,
              watchAttempts,
            };
          }
        }
        return {
          source: session.source,
          subtitles: session.subtitles,
          serverOptions,
          activeServerId: session.activeServerId,
          provider: preferredProvider,
          intro: session.intro || null,
          outro: session.outro || null,
          watchAttempts,
        };
      }

      if (effectiveServer) {
        const source = resolveCustomEmbedSource(effectiveServer, detail.anime, resolvedTargetEp.number);
        if (source) {
          let originalServerOptions: ServerOption[] = [];
          try {
            const firstProvider = order.find((p) => resolvedTargetEp.idByProvider[p]);
            if (firstProvider) {
              const providerEpisodeId = resolvedTargetEp.idByProvider[firstProvider];
              if (providerEpisodeId) {
                const session = await fetchProviderFastWatch(firstProvider, providerEpisodeId, Boolean(input.dubbed), null);
                originalServerOptions = session.serverOptions;
              }
            }
          } catch {
            // Ignore
          }

          return {
            source,
            subtitles: [],
            serverOptions: appendCustomEmbedServers(originalServerOptions, detail.anime, preferredProvider),
            activeServerId: effectiveServer,
            provider: preferredProvider,
            watchAttempts: [{ provider: preferredProvider, server: effectiveServer, ok: true, reason: "Playback ready (custom embed)" }],
          };
        }
      }

      const watchAttempts: WatchAttempt[] = [];
      let collectedServerOptions: ServerOption[] = [];
      for (const provider of order) {
        const providerEpisodeId =
          (provider === preferredProvider && input.episodeId) ||
          resolvedTargetEp.idByProvider[provider] ||
          (provider === "gogoanime" ? `${detail.anime.title}|${detail.anime.subtitle || ""}::${resolvedTargetEp.number}` : null) ||
          (ANIVEXA_PROVIDERS.includes(provider as AniviexaProvider) && anivexaAnilistId ? `${anivexaAnilistId}::${resolvedTargetEp.number}` : null);
        if (!providerEpisodeId) {
          watchAttempts.push({ provider, ok: false, reason: "Episode unavailable in provider" });
          recordCounter("anime.provider.failure", 1, { mode: "resolve", provider, reason: "episode_unavailable" });
          continue;
        }
        try {
          const session = await fetchProviderWatch(provider, providerEpisodeId, Boolean(input.dubbed), input.server || null);
          collectedServerOptions = Array.from(new Map(
            [...collectedServerOptions, ...session.serverOptions].map((option) => [option.id, option]),
          ).values());
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
            serverOptions: appendCustomEmbedServers(session.serverOptions, detail.anime, provider),
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

      // A failed preferred/internal provider must not strand the player on
      // "No source" when a known embed is available. Resolve the first embed
      // immediately and return it as the active source.
      const fallbackServerOptions = appendCustomEmbedServers(
        collectedServerOptions,
        detail.anime,
        preferredProvider,
      );
      const fallbackEmbed = fallbackServerOptions.find((option) =>
        option.category === (input.dubbed ? "dub" : "sub") &&
        option.transport === "embed" &&
        /^(megaplay|animeplay|tryembed|mostream)-/.test(option.id),
      );
      const fallbackEmbedSource = fallbackEmbed
        ? resolveCustomEmbedSource(fallbackEmbed.id, detail.anime, resolvedTargetEp.number)
        : null;
      if (fallbackEmbed && fallbackEmbedSource) {
        watchAttempts.push({
          provider: preferredProvider,
          server: fallbackEmbed.id,
          ok: true,
          reason: "Internal sources unavailable; embedded fallback ready",
        });
        recordCounter("anime.fallback.used", 1, {
          mode: "resolve",
          preferredProvider,
          provider: preferredProvider,
          transport: "embed",
        });
        return {
          source: fallbackEmbedSource,
          subtitles: [],
          serverOptions: fallbackServerOptions,
          activeServerId: fallbackEmbed.id,
          provider: preferredProvider,
          watchAttempts,
        };
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
        source: null, subtitles: [], serverOptions: fallbackServerOptions, activeServerId: null,
        provider: preferredProvider, watchAttempts,
      };
    },
  ), {
    freshMs: isAnivexaSourceRequest ? 30 * 1000 : 5 * 60 * 1000,
    staleMs: isAnivexaSourceRequest ? 30 * 1000 : 15 * 60 * 1000,
    expireMs: isAnivexaSourceRequest ? 90 * 1000 : 30 * 60 * 1000,
    persistent: false,
    shouldCache: (value) => shouldCacheStreamResolution(value as { source: StreamSource | null }),
  });
}
