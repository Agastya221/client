/**
 * AniList GraphQL API — free, no API key needed, always up-to-date.
 * Used for all catalog browsing: hero banner, trending, seasonal, search.
 * Our Railway Python API is used ONLY for watch session / stream resolution.
 */

const ANILIST_URL = "https://graphql.anilist.co";

import { cache } from "react";
import { cacheFetch } from "@/lib/cache";
import { recordCounter, recordLog } from "@/lib/observability";

const ANILIST_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_ANILIST_USER_AGENT = "Tatakai/1.0 (Next.js server; AniList catalog integration)";

export class AnilistApiError extends Error {
  statusCode: number;
  retriable: boolean;
  responseBody: string;

  constructor(message: string, statusCode: number, responseBody = "") {
    super(message);
    this.name = "AnilistApiError";
    this.statusCode = statusCode;
    this.retriable = statusCode === 429 || statusCode >= 500;
    this.responseBody = responseBody;
  }
}

function buildAnilistHeaders(): HeadersInit {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://animekai.app";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": process.env.ANILIST_USER_AGENT || DEFAULT_ANILIST_USER_AGENT,
  };

  headers.Origin = siteUrl;
  headers.Referer = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;

  return headers;
}

const MEDIA_FRAGMENT = `
  fragment MediaFields on Media {
    id
    idMal
    title { romaji english native }
    synonyms
    coverImage { extraLarge large medium color }
    bannerImage
    description(asHtml: false)
    genres
    averageScore
    meanScore
    popularity
    trending
    episodes
    status
    format
    season
    seasonYear
    startDate { year month day }
    endDate { year month day }
    countryOfOrigin
    duration
    siteUrl
    externalLinks { site url type }
    studios(isMain: true) { nodes { name } }
    nextAiringEpisode { episode airingAt }
    trailer { id site }
    isAdult
  }
`;

async function anilistQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  let lastError: Error | null = null;
  const operation = typeof variables?.page === "number"
    ? "paged_query"
    : typeof variables?.id === "number"
      ? "detail_query"
      : "query";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: buildAnilistHeaders(),
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(ANILIST_REQUEST_TIMEOUT_MS),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.errors) {
        const message = json.errors[0]?.message || "AniList GraphQL error";
        recordCounter("anilist.query.failure", 1, { operation, reason: "graphql_error" });
        recordLog("warn", "anilist.query.failure", {
          operation,
          attempt: attempt + 1,
          reason: "graphql_error",
        }, message);
        throw new Error(message);
      }
      recordCounter("anilist.query.success", 1, { operation, attempt: attempt + 1 });
      return json.data as T;
    }

    const responseBody = (await res.text()).slice(0, 300);
    lastError = new AnilistApiError(`AniList API error: ${res.status}`, res.status, responseBody);
    const shouldRetry = res.status === 429 || res.status >= 500;
    recordCounter("anilist.query.failure", 1, {
      operation,
      reason: "http_error",
      status_code: res.status,
      retryable: shouldRetry,
    });
    recordLog("warn", "anilist.query.http_error", {
      operation,
      attempt: attempt + 1,
      status_code: res.status,
      retryable: shouldRetry,
    }, responseBody || `AniList API error: ${res.status}`);
    if (!shouldRetry || attempt === 2) {
      throw lastError;
    }

    const retryAfterSeconds = Number(res.headers.get("retry-after") || 0);
    const waitMs = retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 500 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw lastError || new Error("AniList query failed");
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnilistMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null; native: string };
  synonyms?: string[];
  coverImage: { extraLarge: string; large: string; medium: string; color: string | null };
  bannerImage: string | null;
  description: string | null;
  genres: string[];
  averageScore: number | null;
  meanScore: number | null;
  popularity: number;
  trending: number;
  episodes: number | null;
  status: string;
  format: string;
  season: string | null;
  seasonYear: number | null;
  startDate: { year: number | null; month?: number | null; day?: number | null };
  endDate?: { year: number | null; month: number | null; day: number | null } | null;
  countryOfOrigin?: string | null;
  duration?: number | null;
  siteUrl?: string | null;
  externalLinks?: { site: string; url: string; type: string | null }[];
  studios: { nodes: { name: string }[] };
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  trailer: { id: string; site: string } | null;
  isAdult: boolean;
}

export interface AnilistSeasonEntry {
  relationType: string;
  media: AnilistMedia;
  isCurrent: boolean;
  kind: "season" | "special";
}

export interface AnilistPageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
  perPage: number;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

export function normalizeAnilistMediaEntry(value: unknown): AnilistMedia | null {
  const media = asObject(value);
  if (!media) return null;

  const id = asNumber(media.id, 0);
  if (id <= 0) return null;

  const title = asObject(media.title);
  const coverImage = asObject(media.coverImage);
  const startDate = asObject(media.startDate);
  const endDate = asObject(media.endDate);
  const nextAiringEpisode = asObject(media.nextAiringEpisode);
  const trailer = asObject(media.trailer);
  const studios = asObject(media.studios);
  const studioNodes = Array.isArray(studios?.nodes) ? studios.nodes : [];
  const externalLinks = Array.isArray(media.externalLinks) ? media.externalLinks : [];

  const romaji = asString(title?.romaji, "") || asString(title?.english, "") || asString(title?.native, "") || `AniList ${id}`;
  const english = asNullableString(title?.english);
  const nativeTitle = asString(title?.native, "") || romaji;

  return {
    id,
    idMal: asNullableNumber(media.idMal),
    title: {
      romaji,
      english,
      native: nativeTitle,
    },
    synonyms: asStringArray(media.synonyms),
    coverImage: {
      extraLarge: asString(coverImage?.extraLarge),
      large: asString(coverImage?.large),
      medium: asString(coverImage?.medium),
      color: asNullableString(coverImage?.color),
    },
    bannerImage: asNullableString(media.bannerImage),
    description: asNullableString(media.description),
    genres: asStringArray(media.genres),
    averageScore: asNullableNumber(media.averageScore),
    meanScore: asNullableNumber(media.meanScore),
    popularity: asNumber(media.popularity, 0),
    trending: asNumber(media.trending, 0),
    episodes: asNullableNumber(media.episodes),
    status: asString(media.status, "UNKNOWN"),
    format: asString(media.format, "UNKNOWN"),
    season: asNullableString(media.season),
    seasonYear: asNullableNumber(media.seasonYear),
    startDate: {
      year: asNullableNumber(startDate?.year),
      month: asNullableNumber(startDate?.month),
      day: asNullableNumber(startDate?.day),
    },
    endDate: endDate
      ? {
          year: asNullableNumber(endDate.year),
          month: asNullableNumber(endDate.month),
          day: asNullableNumber(endDate.day),
        }
      : null,
    countryOfOrigin: asNullableString(media.countryOfOrigin),
    duration: asNullableNumber(media.duration),
    siteUrl: asNullableString(media.siteUrl),
    externalLinks: externalLinks
      .map((entry) => asObject(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => ({
        site: asString(entry.site, "Official site"),
        url: asString(entry.url),
        type: asNullableString(entry.type),
      }))
      .filter((entry) => Boolean(entry.url)),
    studios: {
      nodes: studioNodes
        .map((node) => asObject(node))
        .filter((node): node is Record<string, unknown> => Boolean(node))
        .map((node) => ({ name: asString(node.name, "Unknown Studio") })),
    },
    nextAiringEpisode:
      nextAiringEpisode && asNumber(nextAiringEpisode.episode, 0) > 0
        ? {
            episode: asNumber(nextAiringEpisode.episode, 0),
            airingAt: asNumber(nextAiringEpisode.airingAt, 0),
          }
        : null,
    trailer:
      trailer && asString(trailer.id) && asString(trailer.site)
        ? {
            id: asString(trailer.id),
            site: asString(trailer.site),
          }
        : null,
    isAdult: Boolean(media.isAdult),
  };
}

export function normalizeAnilistMediaCollection(value: unknown): AnilistMedia[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeAnilistMediaEntry)
    .filter((entry): entry is AnilistMedia => Boolean(entry));
}

export function normalizeAnilistPageInfo(
  value: unknown,
  fallbackPage = 1,
  fallbackPerPage = 24,
): AnilistPageInfo {
  const pageInfo = asObject(value);
  const currentPage = Math.max(1, asNumber(pageInfo?.currentPage, fallbackPage));
  const perPage = Math.max(1, asNumber(pageInfo?.perPage, fallbackPerPage));
  const lastPage = Math.max(currentPage, asNumber(pageInfo?.lastPage, currentPage));
  const total = Math.max(0, asNumber(pageInfo?.total, 0));

  return {
    total,
    currentPage,
    lastPage,
    hasNextPage: Boolean(pageInfo?.hasNextPage) && currentPage < lastPage,
    perPage,
  };
}

// ─── Normalize to CatalogAnime ─────────────────────────────────────────────

export function anilistTitle(media: AnilistMedia): string {
  return media.title.english || media.title.romaji;
}

function normalizeCatalogSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * AniList's search can return no matches for very short prefixes such as
 * "vin". Rank a cached catalog pool locally so autocomplete and the full
 * search page still behave like prefix search without guessing a title.
 */
export function filterAnilistMediaByPartialTitle(
  media: AnilistMedia[],
  rawQuery: string,
  limit = 24,
): AnilistMedia[] {
  const query = normalizeCatalogSearchText(rawQuery);
  if (query.length < 2) return [];

  return media
    .flatMap((entry) => {
      const titles = [
        entry.title.english,
        entry.title.romaji,
        entry.title.native,
        ...(entry.synonyms || []),
      ]
        .filter((title): title is string => Boolean(title))
        .map(normalizeCatalogSearchText)
        .filter(Boolean);

      const score = titles.reduce((best, title) => {
        if (title === query) return Math.min(best, 0);
        if (title.startsWith(query)) return Math.min(best, 1);
        if (title.split(" ").some((word) => word.startsWith(query))) return Math.min(best, 2);
        if (title.includes(query)) return Math.min(best, 3);
        return best;
      }, Number.POSITIVE_INFINITY);

      return Number.isFinite(score) ? [{ entry, score }] : [];
    })
    .sort((left, right) => left.score - right.score || right.entry.popularity - left.entry.popularity)
    .slice(0, Math.max(1, limit))
    .map(({ entry }) => entry);
}

export function anilistRating(media: AnilistMedia): string | null {
  const score = media.averageScore ?? media.meanScore;
  return score ? (score / 10).toFixed(1) : null;
}

export function anilistYear(media: AnilistMedia): string | null {
  const year = media.seasonYear ?? media.startDate?.year;
  return year ? String(year) : null;
}

export function anilistStatus(media: AnilistMedia): string {
  const map: Record<string, string> = {
    FINISHED: "Finished",
    RELEASING: "Airing",
    NOT_YET_RELEASED: "Upcoming",
    CANCELLED: "Cancelled",
    HIATUS: "Hiatus",
  };
  return map[media.status] || media.status;
}

export function anilistFormat(media: AnilistMedia): string {
  const map: Record<string, string> = {
    TV: "TV",
    TV_SHORT: "TV Short",
    MOVIE: "Movie",
    SPECIAL: "Special",
    OVA: "OVA",
    ONA: "ONA",
    MUSIC: "Music",
  };
  return map[media.format] || media.format;
}

// Build the encoded ID for our routing: anilist~{anilist_id}
// The watch page will search AnimeKai by title when this is the provider
export function encodeAnilistRouteId(anilistId: number): string {
  return `anilist~${anilistId}`;
}

// ─── Home Page Queries ─────────────────────────────────────────────────────

const TRENDING_QUERY = `
  ${MEDIA_FRAGMENT}
  query TrendingNow($page: Int, $perPage: Int) {
    trending: Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage currentPage total }
      media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
        ...MediaFields
      }
    }
  }
`;

const SEASONAL_QUERY = `
  ${MEDIA_FRAGMENT}
  query Seasonal($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
    seasonal: Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
        ...MediaFields
      }
    }
  }
`;

const POPULAR_QUERY = `
  ${MEDIA_FRAGMENT}
  query Popular($page: Int, $perPage: Int) {
    popular: Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(sort: POPULARITY_DESC, type: ANIME, isAdult: false, status: RELEASING) {
        ...MediaFields
      }
    }
  }
`;

const SEARCH_QUERY = `
  ${MEDIA_FRAGMENT}
  query Search($search: String, $genre: String, $page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $format: MediaFormat, $season: MediaSeason, $seasonYear: Int, $countryOfOrigin: CountryCode) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(search: $search, genre: $genre, type: ANIME, sort: $sort, isAdult: false, status: $status, format: $format, season: $season, seasonYear: $seasonYear, countryOfOrigin: $countryOfOrigin) {
        ...MediaFields
      }
    }
  }
`;

const GENRES_QUERY = `
  query Genres {
    GenreCollection
  }
`;

const ANIME_DETAIL_QUERY = `
  ${MEDIA_FRAGMENT}
  query AnimeDetail($id: Int) {
    Media(id: $id, type: ANIME) {
      ...MediaFields
      characters(sort: ROLE, perPage: 6) {
        nodes { name { full } image { medium } }
      }
      relations {
        edges {
          relationType
          node { ...MediaFields }
        }
      }
      recommendations(sort: RATING_DESC, perPage: 8) {
        nodes {
          mediaRecommendation { ...MediaFields }
        }
      }
    }
  }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

function getCurrentSeason(): { season: string; year: number } {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

const JIKAN_URL = "https://api.jikan.moe/v4";

function shouldUseJikanFallback(error: unknown): boolean {
  if (error instanceof AnilistApiError) {
    return true;
  }

  if (error instanceof Error) {
    return (
      error.message.includes("AniList API error") ||
      error.message.includes("AniList GraphQL error") ||
      error.message.includes("The AniList API has been temporarily disabled")
    );
  }

  return false;
}

async function withCatalogFallback<T>(
  scope: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (!shouldUseJikanFallback(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "AniList request failed";
    recordCounter("anilist.fallback.used", 1, { scope });
    recordLog("warn", "anilist.fallback.used", { scope }, message);
    return fallback();
  }
}

async function jikanRequest<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${JIKAN_URL}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.ANILIST_USER_AGENT || DEFAULT_ANILIST_USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(ANILIST_REQUEST_TIMEOUT_MS),
    });

    if (res.ok) {
      return await res.json() as T;
    }

    lastError = new Error(`Jikan API error: ${res.status}`);
    const shouldRetry = res.status === 429 || res.status >= 500;
    if (!shouldRetry || attempt === 2) {
      throw lastError;
    }

    const retryAfterSeconds = Number(res.headers.get("retry-after") || 0);
    const waitMs = retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 750 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw lastError || new Error("Jikan request failed");
}

function mapJikanStatus(status: string): string {
  const value = status.trim().toLowerCase();
  if (value.includes("currently airing")) return "RELEASING";
  if (value.includes("finished")) return "FINISHED";
  if (value.includes("not yet")) return "NOT_YET_RELEASED";
  return "UNKNOWN";
}

function mapJikanFormat(type: string): string {
  const value = type.trim().toLowerCase();
  if (value === "tv") return "TV";
  if (value === "movie") return "MOVIE";
  if (value === "special") return "SPECIAL";
  if (value === "ova") return "OVA";
  if (value === "ona") return "ONA";
  if (value === "music") return "MUSIC";
  return "UNKNOWN";
}

function getJikanTitles(entry: Record<string, unknown>): { romaji: string; english: string | null; native: string } {
  const romaji = asString(entry.title, "") || asString(entry.title_english, "") || asString(entry.title_japanese, "");
  const english = asNullableString(entry.title_english);
  const native = asString(entry.title_japanese, "") || romaji;
  return { romaji, english, native };
}

function getJikanImageUrls(entry: Record<string, unknown>): { extraLarge: string; large: string; medium: string } {
  const images = asObject(entry.images);
  const webp = asObject(images?.webp);
  const jpg = asObject(images?.jpg);

  const medium = asString(webp?.image_url) || asString(jpg?.image_url);
  const large = asString(webp?.large_image_url) || asString(jpg?.large_image_url) || medium;
  return {
    extraLarge: large,
    large,
    medium,
  };
}

function getJikanGenreTags(entry: Record<string, unknown>): string[] {
  const sources = [
    ...(Array.isArray(entry.genres) ? entry.genres : []),
    ...(Array.isArray(entry.themes) ? entry.themes : []),
    ...(Array.isArray(entry.demographics) ? entry.demographics : []),
  ];

  return sources
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => asString(item.name))
    .filter((name) => Boolean(name));
}

function normalizeJikanMediaEntry(value: unknown): AnilistMedia | null {
  const entry = asObject(value);
  if (!entry) return null;

  const idMal = asNumber(entry.mal_id, 0);
  if (idMal <= 0) return null;

  const titles = getJikanTitles(entry);
  const coverImage = getJikanImageUrls(entry);
  const aired = asObject(entry.aired);
  const airedProp = asObject(aired?.prop);
  const airedFrom = asObject(airedProp?.from);
  const airedTo = asObject(airedProp?.to);
  const trailer = asObject(entry.trailer);
  const trailerImages = asObject(trailer?.images);
  const studios = Array.isArray(entry.studios) ? entry.studios : [];
  const studioNodes = studios
    .map((studio) => asObject(studio))
    .filter((studio): studio is Record<string, unknown> => Boolean(studio))
    .map((studio) => ({ name: asString(studio.name, "Unknown Studio") }));
  const score = asNullableNumber(entry.score);
  const averageScore = score === null ? null : Math.round(score * 10);
  const adultRating = asString(entry.rating).toUpperCase();
  const durationMatch = asString(entry.duration).match(/\d+/);
  const externalLinks = Array.isArray(entry.external) ? entry.external : [];

  return {
    id: idMal,
    idMal,
    title: titles,
    synonyms: asStringArray(entry.title_synonyms),
    coverImage: {
      extraLarge: coverImage.extraLarge,
      large: coverImage.large,
      medium: coverImage.medium,
      color: null,
    },
    bannerImage: asNullableString(trailerImages?.maximum_image_url) || asNullableString(trailerImages?.large_image_url),
    description: asNullableString(entry.synopsis),
    genres: getJikanGenreTags(entry),
    averageScore,
    meanScore: averageScore,
    popularity: asNumber(entry.members, 0),
    trending: asNumber(entry.favorites, 0),
    episodes: asNullableNumber(entry.episodes),
    status: mapJikanStatus(asString(entry.status)),
    format: mapJikanFormat(asString(entry.type)),
    season: asNullableString(entry.season)?.toUpperCase() || null,
    seasonYear: asNullableNumber(entry.year),
    startDate: {
      year: asNullableNumber(airedFrom?.year),
      month: asNullableNumber(airedFrom?.month),
      day: asNullableNumber(airedFrom?.day),
    },
    endDate: airedTo
      ? {
          year: asNullableNumber(airedTo.year),
          month: asNullableNumber(airedTo.month),
          day: asNullableNumber(airedTo.day),
        }
      : null,
    countryOfOrigin: null,
    duration: durationMatch ? Number(durationMatch[0]) : null,
    siteUrl: asNullableString(entry.url),
    externalLinks: externalLinks
      .map((item) => asObject(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        site: asString(item.name, "Official site"),
        url: asString(item.url),
        type: "INFO",
      }))
      .filter((item) => Boolean(item.url)),
    studios: {
      nodes: studioNodes,
    },
    nextAiringEpisode: null,
    trailer:
      asString(trailer?.youtube_id) || asString(trailer?.url) || asString(trailer?.embed_url)
        ? {
            id: asString(trailer?.youtube_id) || asString(trailer?.embed_url) || asString(trailer?.url),
            site: "YOUTUBE",
          }
        : null,
    isAdult: adultRating.includes("RX") || getJikanGenreTags(entry).some((genre) => genre.toLowerCase() === "hentai"),
  };
}

function normalizeJikanRecommendationEntry(value: unknown): AnilistMedia | null {
  const recommendation = asObject(value);
  const entry = asObject(recommendation?.entry);
  if (!entry) return null;

  const idMal = asNumber(entry.mal_id, 0);
  if (idMal <= 0) return null;

  const coverImage = getJikanImageUrls(entry);
  const title = asString(entry.title, "") || `Anime ${idMal}`;

  return {
    id: idMal,
    idMal,
    title: {
      romaji: title,
      english: title,
      native: title,
    },
    synonyms: [],
    coverImage: {
      extraLarge: coverImage.extraLarge,
      large: coverImage.large,
      medium: coverImage.medium,
      color: null,
    },
    bannerImage: null,
    description: null,
    genres: [],
    averageScore: null,
    meanScore: null,
    popularity: asNumber(recommendation?.votes, 0),
    trending: asNumber(recommendation?.votes, 0),
    episodes: null,
    status: "UNKNOWN",
    format: "UNKNOWN",
    season: null,
    seasonYear: null,
    startDate: { year: null },
    studios: { nodes: [] },
    nextAiringEpisode: null,
    trailer: null,
    isAdult: false,
  };
}

function normalizeJikanRelationType(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "PARENT_STORY") return "PARENT";
  if (normalized === "FULL_STORY") return "FULL_STORY";
  return normalized || "OTHER";
}

async function getJikanGenreMap(): Promise<Record<string, number>> {
  return cacheFetch(
    "jikan:genre-map",
    async () => {
      const response = await jikanRequest<{ data?: unknown[] }>("/genres/anime");
      const map: Record<string, number> = {};

      for (const item of response.data || []) {
        const genre = asObject(item);
        if (!genre) continue;
        const name = asString(genre.name).trim().toLowerCase();
        const id = asNumber(genre.mal_id, 0);
        if (name && id > 0) {
          map[name] = id;
        }
      }

      return map;
    },
    {
      freshMs: 12 * 60 * 60 * 1000,
      staleMs: 24 * 60 * 60 * 1000,
      expireMs: 3 * 24 * 60 * 60 * 1000,
      shouldCache: (value) => Boolean(value && Object.keys(value as Record<string, number>).length > 0),
    },
  );
}

function createJikanPageInfo(
  pagination: Record<string, unknown> | null,
  page: number,
  perPage: number,
): AnilistPageInfo {
  const items = asObject(pagination?.items);
  return {
    total: asNumber(items?.total, 0),
    currentPage: Math.max(1, asNumber(pagination?.current_page, page)),
    lastPage: Math.max(1, asNumber(pagination?.last_visible_page, page)),
    hasNextPage: Boolean(pagination?.has_next_page),
    perPage: Math.max(1, asNumber(items?.per_page, perPage)),
  };
}

function jikanStatusParam(status?: string): string | undefined {
  switch ((status || "").toUpperCase()) {
    case "RELEASING":
      return "airing";
    case "FINISHED":
      return "complete";
    case "NOT_YET_RELEASED":
      return "upcoming";
    default:
      return undefined;
  }
}

function jikanTypeParam(format?: string): string | undefined {
  switch ((format || "").toUpperCase()) {
    case "TV":
      return "tv";
    case "MOVIE":
      return "movie";
    case "OVA":
      return "ova";
    case "ONA":
      return "ona";
    case "SPECIAL":
      return "special";
    case "MUSIC":
      return "music";
    default:
      return undefined;
  }
}

function jikanOrderBy(sort?: string[]): { orderBy?: string; direction?: "asc" | "desc" } {
  const joined = (sort || []).join(",");
  if (joined.includes("SEARCH_MATCH")) return {};
  if (joined.includes("SCORE")) return { orderBy: "score", direction: "desc" };
  if (joined.includes("POPULARITY")) return { orderBy: "members", direction: "desc" };
  if (joined.includes("TRENDING")) return { orderBy: "members", direction: "desc" };
  if (joined.includes("UPDATED_AT") || joined.includes("START_DATE")) return { orderBy: "start_date", direction: "desc" };
  return { orderBy: "members", direction: "desc" };
}

async function searchJikanAnime(options: {
  search?: string;
  genre?: string;
  page?: number;
  perPage?: number;
  sort?: string[];
  status?: string;
  format?: string;
  season?: string;
  seasonYear?: number;
  countryOfOrigin?: string;
}): Promise<{ media: AnilistMedia[]; pageInfo: AnilistPageInfo }> {
  const page = options.page || 1;
  const perPage = options.perPage || 24;
  const genreMap = options.genre ? await getJikanGenreMap() : {};
  const genreId = options.genre ? genreMap[options.genre.trim().toLowerCase()] : undefined;
  const ordering = jikanOrderBy(options.sort);

  const response = await jikanRequest<{ data?: unknown[]; pagination?: Record<string, unknown> }>(
    "/anime",
    {
      q: options.search || undefined,
      genres: genreId,
      page,
      limit: perPage,
      status: jikanStatusParam(options.status),
      type: jikanTypeParam(options.format),
      order_by: ordering.orderBy,
      sort: ordering.direction,
      sfw: "true",
    },
  );

  return {
    media: normalizeAnilistMediaCollection(
      (response.data || []).map((entry) => normalizeJikanMediaEntry(entry)).filter(Boolean),
    ),
    pageInfo: createJikanPageInfo(asObject(response.pagination), page, perPage),
  };
}

async function getJikanTrending(perPage: number): Promise<AnilistMedia[]> {
  const response = await jikanRequest<{ data?: unknown[] }>("/anime", {
    order_by: "members",
    sort: "desc",
    page: 1,
    limit: perPage,
    sfw: "true",
  });
  return normalizeAnilistMediaCollection(
    (response.data || []).map((entry) => normalizeJikanMediaEntry(entry)).filter(Boolean),
  );
}

async function getJikanSeasonal(perPage: number): Promise<AnilistMedia[]> {
  const response = await jikanRequest<{ data?: unknown[] }>("/seasons/now", {
    page: 1,
    limit: perPage,
    sfw: "true",
  });
  return normalizeAnilistMediaCollection(
    (response.data || []).map((entry) => normalizeJikanMediaEntry(entry)).filter(Boolean),
  );
}

async function getJikanPopular(perPage: number): Promise<AnilistMedia[]> {
  const response = await jikanRequest<{ data?: unknown[] }>("/anime", {
    status: "airing",
    order_by: "members",
    sort: "desc",
    page: 1,
    limit: perPage,
    sfw: "true",
  });
  return normalizeAnilistMediaCollection(
    (response.data || []).map((entry) => normalizeJikanMediaEntry(entry)).filter(Boolean),
  );
}

async function getJikanGenreNames(): Promise<string[]> {
  const response = await jikanRequest<{ data?: unknown[] }>("/genres/anime");
  return (response.data || [])
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => asString(item.name))
    .filter(Boolean);
}

async function getJikanDetail(id: number): Promise<AnilistDetailMedia> {
  const [fullResponse, charactersResponse, recommendationsResponse] = await Promise.all([
    jikanRequest<{ data?: unknown }>(`/anime/${id}/full`),
    jikanRequest<{ data?: unknown[] }>(`/anime/${id}/characters`),
    jikanRequest<{ data?: unknown[] }>(`/anime/${id}/recommendations`),
  ]);

  const media = normalizeJikanMediaEntry(fullResponse.data);
  if (!media) {
    throw new Error(`Jikan detail not found for ${id}`);
  }

  const fullEntry = asObject(fullResponse.data);
  const relations = Array.isArray(fullEntry?.relations) ? fullEntry.relations : [];
  const characters = Array.isArray(charactersResponse.data) ? charactersResponse.data : [];
  const recommendations = Array.isArray(recommendationsResponse.data) ? recommendationsResponse.data : [];

  return {
    ...media,
    characters: {
      nodes: characters
        .slice(0, 6)
        .map((item) => asObject(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => {
          const character = asObject(item.character);
          const images = asObject(character?.images);
          const webp = asObject(images?.webp);
          const jpg = asObject(images?.jpg);
          return {
            name: {
              full: asString(character?.name, "Unknown Character"),
            },
            image: {
              medium: asString(webp?.image_url) || asString(jpg?.image_url),
            },
          };
        }),
    },
    relations: {
      edges: relations
        .map((relation) => asObject(relation))
        .filter((relation): relation is Record<string, unknown> => Boolean(relation))
        .flatMap((relation) => {
          const relationType = normalizeJikanRelationType(asString(relation.relation));
          const entries = Array.isArray(relation.entry) ? relation.entry : [];
          return entries
            .map((entry) => asObject(entry))
            .filter((entry): entry is Record<string, unknown> => {
              if (!entry) return false;
              return asString(entry.type) === "anime";
            })
            .map((entry) => {
              const coverImage = getJikanImageUrls(entry);
              const title = asString(entry.name, "");
              const relationId = asNumber(entry.mal_id, 0);
              return {
                relationType,
                node: {
                  id: relationId,
                  idMal: relationId,
                  title: { english: title || null, romaji: title || `Anime ${relationId}`, native: title },
                  coverImage: { ...coverImage, color: null },
                  bannerImage: null,
                  description: null,
                  genres: [],
                  averageScore: null,
                  meanScore: null,
                  popularity: 0,
                  trending: 0,
                  episodes: null,
                  format: "ANIME",
                  status: "UNKNOWN",
                  season: null,
                  seasonYear: null,
                  startDate: { year: null },
                  studios: { nodes: [] },
                  nextAiringEpisode: null,
                  trailer: null,
                  isAdult: false,
                },
              };
            });
        }),
    },
    recommendations: {
      nodes: recommendations
        .slice(0, 8)
        .map((item) => ({
          mediaRecommendation: normalizeJikanRecommendationEntry(item),
        })),
    },
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function getAnilistTrending(perPage = 10): Promise<AnilistMedia[]> {
  return withCatalogFallback(
    "trending",
    () => cacheFetch(
      `anilist:trending:${perPage}`,
      async () => {
        const data = await anilistQuery<{ trending: { media: AnilistMedia[] } }>(TRENDING_QUERY, {
          page: 1,
          perPage,
        });
        return normalizeAnilistMediaCollection(data?.trending?.media);
      },
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 30 * 60 * 1000,
        expireMs: 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
    () => cacheFetch(
      `jikan:trending:${perPage}`,
      () => getJikanTrending(perPage),
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 30 * 60 * 1000,
        expireMs: 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
  );
}

export async function getAnilistSeasonal(perPage = 20): Promise<AnilistMedia[]> {
  const { season, year } = getCurrentSeason();
  return withCatalogFallback(
    "seasonal",
    () => cacheFetch(
      `anilist:seasonal:${season}:${year}:${perPage}`,
      async () => {
        const data = await anilistQuery<{ seasonal: { media: AnilistMedia[] } }>(SEASONAL_QUERY, {
          season,
          year,
          page: 1,
          perPage,
        });
        return normalizeAnilistMediaCollection(data?.seasonal?.media);
      },
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 30 * 60 * 1000,
        expireMs: 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
    () => cacheFetch(
      `jikan:seasonal:${season}:${year}:${perPage}`,
      () => getJikanSeasonal(perPage),
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 30 * 60 * 1000,
        expireMs: 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
  );
}

export async function getAnilistPopular(perPage = 20): Promise<AnilistMedia[]> {
  return withCatalogFallback(
    "popular",
    () => cacheFetch(
      `anilist:popular:${perPage}`,
      async () => {
        const data = await anilistQuery<{ popular: { media: AnilistMedia[] } }>(POPULAR_QUERY, {
          page: 1,
          perPage,
        });
        return normalizeAnilistMediaCollection(data?.popular?.media);
      },
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 30 * 60 * 1000,
        expireMs: 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
    () => cacheFetch(
      `jikan:popular:${perPage}`,
      () => getJikanPopular(perPage),
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 30 * 60 * 1000,
        expireMs: 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
  );
}

export async function searchAnilist(options: {
  search?: string;
  genre?: string;
  page?: number;
  perPage?: number;
  sort?: string[];
  status?: string;
  format?: string;
  season?: string;
  seasonYear?: number;
  countryOfOrigin?: string;
}): Promise<{ media: AnilistMedia[]; pageInfo: AnilistPageInfo }> {
  const page = options.page || 1;
  const perPage = options.perPage || 24;
  const sort = options.sort || (options.search ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"]);
  const cacheKey = [
    "anilist:search",
    options.search || "",
    options.genre || "",
    page,
    perPage,
    sort.join(","),
    options.status || "",
    options.format || "",
    options.season || "",
    options.seasonYear || "",
    options.countryOfOrigin || "",
  ].join(":");

  const result = await withCatalogFallback(
    "search",
    () => cacheFetch(
      cacheKey,
      async () => {
        const data = await anilistQuery<{
          Page: { media: AnilistMedia[]; pageInfo: AnilistPageInfo };
        }>(SEARCH_QUERY, {
          search: options.search || undefined,
          genre: options.genre || undefined,
          page,
          perPage,
          sort,
          status: options.status || undefined,
          format: options.format || undefined,
          season: options.season || undefined,
          seasonYear: options.seasonYear || undefined,
          countryOfOrigin: options.countryOfOrigin || undefined,
        });
        return {
          media: normalizeAnilistMediaCollection(data?.Page?.media),
          pageInfo: normalizeAnilistPageInfo(data?.Page?.pageInfo, page, perPage),
        };
      },
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 20 * 60 * 1000,
        expireMs: 45 * 60 * 1000,
        shouldCache: (value) =>
          Boolean(
            value &&
            typeof value === "object" &&
            Array.isArray((value as { media?: unknown[] }).media),
          ),
      },
    ),
    () => cacheFetch(
      `jikan:${cacheKey}`,
      () => searchJikanAnime(options),
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 20 * 60 * 1000,
        expireMs: 45 * 60 * 1000,
        shouldCache: (value) =>
          Boolean(
            value &&
            typeof value === "object" &&
            Array.isArray((value as { media?: unknown[] }).media),
          ),
      },
    ),
  );

  const shortQuery = normalizeCatalogSearchText(options.search || "");
  if (result.media.length > 0 || shortQuery.length < 2 || shortQuery.length > 3 || page > 1) {
    return result;
  }

  const catalogPool = await searchAnilist({
    genre: options.genre,
    page: 1,
    perPage: 50,
    sort: ["POPULARITY_DESC"],
    status: options.status,
    format: options.format,
    season: options.season,
    seasonYear: options.seasonYear,
    countryOfOrigin: options.countryOfOrigin,
  });
  const partialMatches = filterAnilistMediaByPartialTitle(catalogPool.media, shortQuery, perPage);
  if (partialMatches.length === 0) return result;

  return {
    media: partialMatches,
    pageInfo: {
      total: partialMatches.length,
      currentPage: 1,
      lastPage: 1,
      hasNextPage: false,
      perPage,
    },
  };
}

export async function getAnilistGenres(): Promise<string[]> {
  return withCatalogFallback(
    "genres",
    () => cacheFetch(
      "anilist:genres",
      async () => {
        const data = await anilistQuery<{ GenreCollection: string[] }>(GENRES_QUERY);
        return data.GenreCollection.filter(Boolean);
      },
      {
        freshMs: 12 * 60 * 60 * 1000,
        staleMs: 24 * 60 * 60 * 1000,
        expireMs: 3 * 24 * 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
    () => cacheFetch(
      "jikan:genres",
      () => getJikanGenreNames(),
      {
        freshMs: 12 * 60 * 60 * 1000,
        staleMs: 24 * 60 * 60 * 1000,
        expireMs: 3 * 24 * 60 * 60 * 1000,
        shouldCache: (value) => Array.isArray(value) && value.length > 0,
      },
    ),
  );
}

export interface AnilistDetailMedia extends AnilistMedia {
  characters: { nodes: { name: { full: string }; image: { medium: string } }[] };
  relations: {
    edges: {
      relationType: string;
      node: AnilistMedia;
    }[];
  };
  recommendations: {
    nodes: { mediaRecommendation: AnilistMedia | null }[];
  };
}

const ANILIST_ANIME_FORMATS = new Set(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"]);
// Only explicit chronological continuations belong in Seasons. AniList uses
// PARENT, SIDE_STORY, SPIN_OFF, and similar relations for franchise material
// that should stay in the Related panel.
const ANILIST_MAIN_SEASON_RELATIONS = new Set(["PREQUEL", "SEQUEL"]);
const ANILIST_SEASON_ORDER: Record<string, number> = {
  WINTER: 0,
  SPRING: 1,
  SUMMER: 2,
  FALL: 3,
};

function sortAnilistSeasonEntries(entries: AnilistSeasonEntry[]) {
  return entries.toSorted((left, right) => {
    const leftYear = left.media.seasonYear || left.media.startDate.year;
    const rightYear = right.media.seasonYear || right.media.startDate.year;
    if (leftYear && rightYear && leftYear !== rightYear) return leftYear - rightYear;
    if (leftYear && !rightYear) return -1;
    if (!leftYear && rightYear) return 1;

    const leftSeason = left.media.season ? ANILIST_SEASON_ORDER[left.media.season] ?? 4 : 4;
    const rightSeason = right.media.season ? ANILIST_SEASON_ORDER[right.media.season] ?? 4 : 4;
    if (leftSeason !== rightSeason) return leftSeason - rightSeason;

    const relationOrder = (entry: AnilistSeasonEntry) => {
      if (entry.relationType === "PREQUEL") return 0;
      if (entry.isCurrent) return 1;
      if (entry.relationType === "SEQUEL") return 2;
      return 3;
    };
    const orderDifference = relationOrder(left) - relationOrder(right);
    if (orderDifference !== 0) return orderDifference;
    return anilistTitle(left.media).localeCompare(anilistTitle(right.media));
  });
}

/**
 * Build a compact, stable franchise rail from the relation graph included in
 * the existing AniList detail response. This deliberately avoids another API
 * request on the watch page while keeping current/prequel/sequel ordering.
 */
export function buildAnilistSeasonEntries(detail: AnilistDetailMedia): AnilistSeasonEntry[] {
  const candidates: AnilistSeasonEntry[] = [
    {
      relationType: "CURRENT",
      media: normalizeAnilistMediaEntry(detail) || detail,
      isCurrent: true,
      kind: "season",
    },
  ];

  for (const edge of detail.relations.edges) {
    const relationType = String(edge.relationType || "OTHER").toUpperCase();
    const media = normalizeAnilistMediaEntry(edge.node);
    if (!media || !ANILIST_ANIME_FORMATS.has(media.format)) continue;

    if (ANILIST_MAIN_SEASON_RELATIONS.has(relationType)) {
      candidates.push({ relationType, media, isCurrent: false, kind: "season" });
    }
  }

  const entriesById = new Map<number, AnilistSeasonEntry>();
  for (const entry of candidates) {
    const existing = entriesById.get(entry.media.id);
    if (!existing) {
      entriesById.set(entry.media.id, entry);
    }
  }
  const deduped = Array.from(entriesById.values());

  return sortAnilistSeasonEntries(deduped);
}

export const getAnilistDetail = cache(async (id: number): Promise<AnilistDetailMedia> => {
  return cacheFetch(
    `anilist:detail:${id}`,
    () => withCatalogFallback(
      "detail",
      async () => {
        const data = await anilistQuery<{ Media: AnilistDetailMedia }>(ANIME_DETAIL_QUERY, { id });
        return data.Media;
      },
      () => getJikanDetail(id),
    ),
    {
      freshMs: 15 * 60 * 1000,
      staleMs: 6 * 60 * 60 * 1000,
      expireMs: 24 * 60 * 60 * 1000,
      shouldCache: (value) => Boolean((value as AnilistDetailMedia | null)?.id),
    },
  );
});

export interface AnilistSeasonTraversalOptions {
  maxMainlineEntries?: number;
  loadDetail?: (id: number) => Promise<AnilistDetailMedia>;
}

/**
 * Follow cached PREQUEL/SEQUEL edges in parallel breadth-first rounds.
 * The watch-page context is deferred, so this can discover a long franchise
 * without blocking the initial player shell. Non-season franchise relations
 * remain available to the Related panel, while traversal is capped to protect
 * AniList and response latency.
 */
export async function getAnilistFranchiseSeasonEntries(
  detail: AnilistDetailMedia,
  options: AnilistSeasonTraversalOptions = {},
): Promise<AnilistSeasonEntry[]> {
  const maxMainlineEntries = Math.min(10, Math.max(1, options.maxMainlineEntries ?? 10));
  const loadDetail = options.loadDetail || getAnilistDetail;
  const initialEntries = buildAnilistSeasonEntries(detail);
  const mainlineById = new Map<number, AnilistSeasonEntry>();

  for (const entry of initialEntries) {
    mainlineById.set(entry.media.id, entry);
  }

  const visitedDetailIds = new Set<number>([detail.id]);
  let frontier = Array.from(mainlineById.keys()).filter((id) => id !== detail.id);
  let fetchBudget = maxMainlineEntries - 1;

  while (frontier.length > 0 && mainlineById.size < maxMainlineEntries && fetchBudget > 0) {
    const batch = Array.from(new Set(frontier))
      .filter((id) => !visitedDetailIds.has(id))
      .slice(0, fetchBudget);
    if (batch.length === 0) break;

    batch.forEach((id) => visitedDetailIds.add(id));
    fetchBudget -= batch.length;
    const loadedDetails = await Promise.all(
      batch.map((id) => loadDetail(id).catch(() => null)),
    );
    const nextFrontier: number[] = [];

    for (const loadedDetail of loadedDetails) {
      if (!loadedDetail) continue;
      for (const edge of loadedDetail.relations.edges) {
        const relationType = String(edge.relationType || "OTHER").toUpperCase();
        if (!ANILIST_MAIN_SEASON_RELATIONS.has(relationType)) continue;
        const media = normalizeAnilistMediaEntry(edge.node);
        if (!media || !ANILIST_ANIME_FORMATS.has(media.format)) continue;

        if (!mainlineById.has(media.id) && mainlineById.size < maxMainlineEntries) {
          mainlineById.set(media.id, {
            relationType,
            media,
            isCurrent: media.id === detail.id,
            kind: "season",
          });
        }
        if (!visitedDetailIds.has(media.id)) nextFrontier.push(media.id);
      }
    }

    frontier = nextFrontier;
  }

  const mainline = sortAnilistSeasonEntries(Array.from(mainlineById.values()))
    .slice(0, maxMainlineEntries);
  return mainline;
}

// ─── Weekly Airing Schedule Query ──────────────────────────────────────────

const WEEKLY_AIRING_SCHEDULE_QUERY = `
  ${MEDIA_FRAGMENT}
  query WeeklyAiringSchedule($start: Int, $end: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo {
        hasNextPage
        currentPage
      }
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
        id
        airingAt
        timeUntilAiring
        episode
        media {
          ...MediaFields
        }
      }
    }
  }
`;

export interface AnilistAiringScheduleEntry {
  id: number;
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
  media: AnilistMedia;
}

export const getWeeklyAiringSchedule = cache(
  async (start: number, end: number): Promise<AnilistAiringScheduleEntry[]> => {
    try {
      let schedules: any[] = [];
      let currentPage = 1;
      const MAX_PAGES = 6;

      while (currentPage <= MAX_PAGES) {
        const res = await anilistQuery<{
          Page: {
            pageInfo: { hasNextPage: boolean };
            airingSchedules: any[];
          };
        }>(WEEKLY_AIRING_SCHEDULE_QUERY, { start, end, page: currentPage });

        const items = res?.Page?.airingSchedules || [];
        schedules = schedules.concat(items);

        if (!res?.Page?.pageInfo?.hasNextPage || items.length === 0) {
          break;
        }
        currentPage++;
      }

      return schedules
        .map((item) => {
          const normalizedMedia = normalizeAnilistMediaEntry(item.media);
          if (!normalizedMedia) return null;
          return {
            id: asNumber(item.id),
            airingAt: asNumber(item.airingAt),
            timeUntilAiring: asNumber(item.timeUntilAiring),
            episode: asNumber(item.episode),
            media: normalizedMedia,
          };
        })
        .filter((entry): entry is AnilistAiringScheduleEntry => entry !== null);
    } catch (err) {
      console.error("Error fetching weekly airing schedule:", err);
      return [];
    }
  }
);

