import { cache } from "react";
import {
  PROVIDERS,
  type AnimeDetailModel,
  type AnimeMetadataRow,
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

const API_BASE_URL = String(process.env.ANIME_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const HOME_REVALIDATE_SECONDS = 300;
const SEARCH_REVALIDATE_SECONDS = 120;
const DETAIL_REVALIDATE_SECONDS = 300;

type JsonValue = Record<string, any>;
export type ProviderJson = JsonValue;

type ProviderDetailBundle = {
  provider: ProviderId;
  providerId: string;
  anime: CatalogAnime;
  synopsis: string;
  metadata: AnimeMetadataRow[];
  episodes: EpisodeModel[];
  related: CatalogAnime[];
  recommended: CatalogAnime[];
};

type ProviderWatchPayload = {
  source: StreamSource | null;
  subtitles: SubtitleTrack[];
  serverOptions: ServerOption[];
  activeServerId: string | null;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
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

async function apiJson<T>(path: string, options?: { revalidate?: number; noStore?: boolean }): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Kaido-Frontend/1.0",
    },
    cache: options?.noStore ? "no-store" : undefined,
    next: options?.noStore ? undefined : { revalidate: options?.revalidate ?? DETAIL_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${path} -> ${response.status}${body ? `: ${body}` : ""}`);
  }

  return (await response.json()) as T;
}

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
  return normalizeBaseAnime({
    provider: "animekai",
    providerId: String(item.id || item.slug || item.title),
    title: pickFirstNonEmpty(item.title, humanizeProviderId(String(item.id || ""))),
    poster: pickFirstNonEmpty(item.image, item.poster, item.thumbnail),
    banner: pickFirstNonEmpty(item.banner),
    description: item.description || null,
    genres,
    type: item.type || null,
    rating: item.score || item.rating || null,
    year: parseYear(item.releaseDate || item.year || item.season),
    subCount: numberOrNull(item.sub),
    dubCount: numberOrNull(item.dub),
    episodeCount: numberOrNull(item.episodes ?? item.totalEpisodes),
    anilistId: numberOrNull(item.anilistId),
    malId: numberOrNull(item.malId),
  });
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

function mergeEpisodeMaps(target: Map<number, EpisodeModel>, episodes: EpisodeModel[], provider: ProviderId): void {
  for (const episode of episodes) {
    const existing = target.get(episode.number);
    if (!existing) {
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
  return ensureArray(data.episodes).map((episode) => ({
    number: Number(episode.number || 0),
    title: pickFirstNonEmpty(episode.title, `Episode ${episode.number}`),
    isFiller: Boolean(episode.isFiller),
    isSubbed: Boolean(episode.isSubbed),
    isDubbed: Boolean(episode.isDubbed),
    idByProvider: { animekai: String(episode.id) },
    availableProviders: ["animekai"],
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

async function fetchHianimeDetail(providerId: string): Promise<ProviderDetailBundle> {
  const [detailResponse, episodeResponse] = await Promise.all([
    apiJson<JsonValue>(`/api/v2/hianime/anime/${encodeURIComponent(providerId)}`, {
      revalidate: DETAIL_REVALIDATE_SECONDS,
    }),
    apiJson<JsonValue>(`/api/v2/hianime/anime/${encodeURIComponent(providerId)}/episodes`, {
      revalidate: DETAIL_REVALIDATE_SECONDS,
    }),
  ]);

  const detail = unwrapProviderPayload(detailResponse);
  const episodes = unwrapProviderPayload(episodeResponse);
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
    episodeCount: numberOrNull(episodes.totalEpisodes ?? info.stats?.episodes?.sub),
    anilistId: numberOrNull(info.anilistId),
    malId: numberOrNull(info.malId),
  });

  return {
    provider: "hianime",
    providerId,
    anime,
    synopsis: pickFirstNonEmpty(info.description),
    metadata: toHianimeMetadata(detail),
    episodes: normalizeHianimeEpisodesPayload(episodes),
    related: ensureArray(detail.relatedAnimes).map(normalizeHianimeCatalogItem),
    recommended: ensureArray(detail.recommendedAnimes).map(normalizeHianimeCatalogItem),
  };
}

async function fetchAnimeKaiDetail(providerId: string): Promise<ProviderDetailBundle> {
  const detail = await apiJson<JsonValue>(`/api/v2/anime/animekai/info/${encodeURIComponent(providerId)}`, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
  });
  const anime = normalizeBaseAnime({
    provider: "animekai",
    providerId,
    title: pickFirstNonEmpty(detail.title, humanizeProviderId(providerId)),
    poster: pickFirstNonEmpty(detail.image),
    description: detail.description || null,
    genres: mapGenres(detail.genres),
    type: detail.type || null,
    year: parseYear(detail.season),
    status: detail.status || null,
    subCount: detail.hasSub ? numberOrNull(detail.totalEpisodes) : 0,
    dubCount: detail.hasDub ? numberOrNull(detail.totalEpisodes) : 0,
    episodeCount: numberOrNull(detail.totalEpisodes),
    anilistId: numberOrNull(detail.anilistId),
    malId: numberOrNull(detail.malId),
  });

  return {
    provider: "animekai",
    providerId,
    anime,
    synopsis: pickFirstNonEmpty(detail.description),
    metadata: toAnimeKaiMetadata(detail),
    episodes: normalizeAnimeKaiEpisodesPayload(detail),
    related: ensureArray(detail.relations).map(normalizeAnimeKaiCatalogItem),
    recommended: ensureArray(detail.recommendations).map(normalizeAnimeKaiCatalogItem),
  };
}

async function fetchDesidubDetail(providerId: string): Promise<ProviderDetailBundle> {
  const detail = await apiJson<JsonValue>(`/api/v2/anime/desidub/info/${encodeURIComponent(providerId)}`, {
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
    episodes: normalizeDesidubEpisodesPayload(detail),
    related: [],
    recommended: [],
  };
}

async function fetchProviderDetail(provider: ProviderId, providerId: string): Promise<ProviderDetailBundle> {
  switch (provider) {
    case "hianime":
      return fetchHianimeDetail(providerId);
    case "animekai":
      return fetchAnimeKaiDetail(providerId);
    case "desidub":
      return fetchDesidubDetail(providerId);
  }
}

async function searchAnimeKaiByTitle(title: string): Promise<string | null> {
  const response = await apiJson<JsonValue>(
    `/api/v2/anime/animekai/search/${encodeURIComponent(title)}?page=1`,
    { revalidate: SEARCH_REVALIDATE_SECONDS },
  );
  const match = bestTitleMatch(title, ensureArray(response.results));
  return match?.id ? String(match.id) : null;
}

async function searchDesidubByTitle(title: string): Promise<string | null> {
  const response = await apiJson<JsonValue>(`/api/v2/anime/desidub/search?q=${encodeURIComponent(title)}`, {
    revalidate: SEARCH_REVALIDATE_SECONDS,
  });
  const match = bestTitleMatch(title, ensureArray(response.results));
  return match?.slug ? String(match.slug) : null;
}

async function resolveFallbackProviderIds(
  seedAnime: CatalogAnime,
  preferredTitle?: string,
): Promise<Partial<Record<ProviderId, string>>> {
  const providerIds: Partial<Record<ProviderId, string>> = { ...seedAnime.providerIds };
  const title = preferredTitle || seedAnime.title;

  const tasks: Array<Promise<void>> = [];

  if (!providerIds.animekai) {
    tasks.push(
      searchAnimeKaiByTitle(title)
        .then((value) => {
          if (value) providerIds.animekai = value;
        })
        .catch(() => undefined),
    );
  }

  if (!providerIds.desidub) {
    tasks.push(
      searchDesidubByTitle(title)
        .then((value) => {
          if (value) providerIds.desidub = value;
        })
        .catch(() => undefined),
    );
  }

  await Promise.all(tasks);
  return providerIds;
}

function withProviderIds(anime: CatalogAnime, providerIds: Partial<Record<ProviderId, string>>, routeId?: string): CatalogAnime {
  const next = cloneCatalogAnime(anime, providerIds);
  return routeId ? { ...next, id: routeId, href: `/anime/${routeId}` } : next;
}

const getHomePageModelUncached = async (): Promise<HomePageModel> => {
  const attempts: ProviderAttemptStatus[] = [];
  let activeProvider: ProviderId = "hianime";
  let hero: CatalogAnime | null = null;
  let trending: CatalogAnime[] = [];
  let newReleases: CatalogAnime[] = [];
  let topAiring: CatalogAnime[] = [];
  let genres: string[] = [];
  const sectionProviders: HomePageModel["sectionProviders"] = {};

  try {
    const home = await fetchHianimeHome();
    attempts.push(providerSuccess("hianime", "Home data loaded"));
    activeProvider = "hianime";
    hero = normalizeHianimeCatalogItem(ensureArray(home.spotlightAnimes)[0] || ensureArray(home.trendingAnimes)[0] || {});
    hero = hero.providerId ? hero : null;
    trending = ensureArray(home.trendingAnimes).slice(0, 10).map(normalizeHianimeCatalogItem);
    newReleases = ensureArray(home.latestEpisodeAnimes).slice(0, 8).map(normalizeHianimeCatalogItem);
    topAiring = ensureArray(home.topAiringAnimes).slice(0, 6).map(normalizeHianimeCatalogItem);
    genres = uniqueStrings(ensureArray(home.genres));
    if (hero) sectionProviders.hero = "hianime";
    if (trending.length > 0) sectionProviders.trending = "hianime";
    if (newReleases.length > 0) sectionProviders.newReleases = "hianime";
    if (topAiring.length > 0) sectionProviders.topAiring = "hianime";
  } catch (error) {
    attempts.push(providerFailure("hianime", error instanceof Error ? error.message : "Failed to load home"));
  }

  if (!hero || trending.length === 0 || newReleases.length === 0 || topAiring.length === 0) {
    try {
      const [spotlight, releases, recent] = await Promise.all([
        apiJson<JsonValue>("/api/v2/anime/animekai/spotlight", { revalidate: HOME_REVALIDATE_SECONDS }),
        apiJson<JsonValue>("/api/v2/anime/animekai/new-releases?page=1", { revalidate: HOME_REVALIDATE_SECONDS }),
        apiJson<JsonValue>("/api/v2/anime/animekai/recent-episodes?page=1", { revalidate: HOME_REVALIDATE_SECONDS }),
      ]);
      attempts.push(providerSuccess("animekai", "Used to backfill home sections"));

      if (!hero) {
        const heroItem = normalizeAnimeKaiCatalogItem(ensureArray(spotlight.results)[0] || {});
        if (heroItem.providerId) {
          hero = heroItem;
          sectionProviders.hero = "animekai";
        }
      }

      if (trending.length === 0) {
        trending = ensureArray(spotlight.results).slice(0, 10).map(normalizeAnimeKaiCatalogItem);
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
        const animeKaiGenres = await apiJson<JsonValue>("/api/v2/anime/animekai/genres", {
          revalidate: HOME_REVALIDATE_SECONDS,
        });
        genres = uniqueStrings(ensureArray(animeKaiGenres.results).map(String));
      }

      if (!sectionProviders.hero || sectionProviders.hero !== "hianime") {
        activeProvider = "animekai";
      }
    } catch (error) {
      attempts.push(providerFailure("animekai", error instanceof Error ? error.message : "Failed to backfill home"));
    }
  }

  if (!hero || trending.length === 0) {
    try {
      const desidub = await apiJson<JsonValue>("/api/v2/anime/desidub/home", {
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
  const providerOrder = lockedProvider ? [lockedProvider] : buildProviderOrder("hianime");

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

      if (provider === "hianime") {
        if (query) {
          const response = await fetchHianimeSearch(query, page);
          results = ensureArray(response.animes).map(normalizeHianimeCatalogItem);
          totalPages = numberOrNull(response.totalPages);
          hasNextPage = Boolean(response.hasNextPage);
        } else if (genre) {
          const response = await fetchHianimeGenre(genre, page);
          results = ensureArray(response.animes).map(normalizeHianimeCatalogItem);
          totalPages = numberOrNull(response.totalPages);
          hasNextPage = Boolean(response.hasNextPage);
        } else {
          const home = await getHomePageModel();
          results = [...home.trending, ...home.newReleases].slice(0, 18);
        }
      }

      if (provider === "animekai") {
        if (query) {
          const response = await apiJson<JsonValue>(
            `/api/v2/anime/animekai/search/${encodeURIComponent(query)}?page=${page}`,
            { revalidate: SEARCH_REVALIDATE_SECONDS },
          );
          results = ensureArray(response.results).map(normalizeAnimeKaiCatalogItem);
          totalPages = numberOrNull(response.totalPages);
          hasNextPage = Boolean(response.hasNextPage);
        } else if (genre) {
          const response = await apiJson<JsonValue>(
            `/api/v2/anime/animekai/genre/${encodeURIComponent(genre.toLowerCase())}?page=${page}`,
            { revalidate: SEARCH_REVALIDATE_SECONDS },
          );
          results = ensureArray(response.results).map(normalizeAnimeKaiCatalogItem);
          totalPages = numberOrNull(response.totalPages);
          hasNextPage = Boolean(response.hasNextPage);
        } else {
          const response = await apiJson<JsonValue>("/api/v2/anime/animekai/recent-episodes?page=1", {
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
    activeProvider: lockedProvider || "hianime",
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

export async function getAnimeDetailModel(routeId: string, preferredProvider?: ProviderId | null): Promise<AnimeDetailModel> {
  const decoded = decodeAnimeId(routeId);
  const attempts: ProviderAttemptStatus[] = [];
  const baseBundle = await tryBaseProviderDetail(routeId);

  if (baseBundle) {
    attempts.push(providerSuccess(baseBundle.provider, "Resolved base provider metadata"));
  } else {
    attempts.push(providerFailure(decoded.provider, "Base provider detail lookup failed"));
  }

  const seedAnime = baseBundle?.anime || normalizeBaseAnime({
    provider: decoded.provider,
    providerId: decoded.providerId,
    title: humanizeProviderId(decoded.providerId),
    description: null,
    genres: [],
  });

  const providerIds = await resolveFallbackProviderIds(seedAnime, baseBundle?.anime.title || humanizeProviderId(decoded.providerId));
  const order = buildProviderOrder(preferredProvider || decoded.provider, decoded.provider);
  const bundleCache = new Map<ProviderId, ProviderDetailBundle>();
  if (baseBundle) {
    bundleCache.set(baseBundle.provider, baseBundle);
  }

  let activeBundle: ProviderDetailBundle | null = null;

  for (const provider of order) {
    const providerId = providerIds[provider];
    if (!providerId) {
      attempts.push(providerFailure(provider, "No provider mapping available", true));
      continue;
    }

    try {
      const bundle = bundleCache.get(provider) || (await fetchProviderDetail(provider, providerId));
      bundleCache.set(provider, bundle);
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
      episodes: [],
      related: [],
      recommended: [],
      activeProvider: decoded.provider,
      availableProviders: Object.keys(providerIds) as ProviderId[],
      attempts,
    };
  }

  const episodeMap = new Map<number, EpisodeModel>();
  mergeEpisodeMaps(episodeMap, activeBundle.episodes, activeBundle.provider);

  for (const provider of PROVIDERS) {
    if (provider === activeBundle.provider) continue;
    const providerId = providerIds[provider];
    if (!providerId) continue;
    try {
      const bundle = bundleCache.get(provider) || (await fetchProviderDetail(provider, providerId));
      bundleCache.set(provider, bundle);
      mergeEpisodeMaps(episodeMap, bundle.episodes, provider);
    } catch {
      // Keep detail page resilient; attempts already capture top-level provider tries.
    }
  }

  const mergedAnime = withProviderIds(activeBundle.anime, providerIds, routeId);
  const episodes = Array.from(episodeMap.values()).sort((a, b) => a.number - b.number);
  const availableProviders = PROVIDERS.filter((provider) => Boolean(providerIds[provider]));

  return {
    anime: mergedAnime,
    synopsis: activeBundle.synopsis || mergedAnime.description || "No synopsis available right now.",
    metadata: activeBundle.metadata,
    episodes,
    related: activeBundle.related.map((anime) => withProviderIds(anime, anime.providerIds)),
    recommended: activeBundle.recommended.map((anime) => withProviderIds(anime, anime.providerIds)),
    activeProvider: activeBundle.provider,
    availableProviders,
    attempts,
  };
}

export function normalizeStreamSourceFromUrl(input: {
  label: string;
  url: string | null;
  iframeUrl?: string | null;
  referer?: string | null;
  forceProxy?: boolean;
}): StreamSource {
  const url = input.url || null;
  const isM3U8 = Boolean(url && url.includes(".m3u8"));
  const requiresProxy = Boolean(input.forceProxy || input.referer || isM3U8);

  return {
    kind: url ? "video" : "iframe",
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
  const response = await apiJson<JsonValue>(
    `/api/v2/anime/animekai/watch/${encodeURIComponent(episodeId)}?dub=${dubbed ? "1" : "0"}`,
    { noStore: true },
  );
  const entries = ensureArray(response.results);
  const selected =
    entries.find((entry) => String(entry.name || "").toLowerCase() === String(requestedServer || "").toLowerCase()) ||
    entries[0] ||
    {};
  const stream = ensureArray(selected.sources)[0] || {};
  const source = normalizeStreamSourceFromUrl({
    label: selected.name || "AnimeKai",
    url: stream.url || null,
    iframeUrl: selected.url || null,
    referer: selected.url || null,
  });

  return {
    source: source.url || source.iframeUrl ? source : null,
    subtitles: ensureArray(selected.subtitles).map((subtitle) => ({
      label: subtitle.lang || subtitle.label || "Subtitle",
      lang: subtitle.lang || subtitle.label || "Unknown",
      url: subtitle.url,
    })),
    serverOptions: entries.map((entry) => ({
      id: String(entry.name || "animekai"),
      label: String(entry.name || "AnimeKai"),
      provider: "animekai",
      category: entry.isDub ? "dub" : "sub",
    })),
    activeServerId: String(selected.name || entries[0]?.name || ""),
    intro: selected.intro
      ? { start: Number(selected.intro[0] || selected.intro.start || 0), end: Number(selected.intro[1] || selected.intro.end || 0) }
      : null,
    outro: selected.outro
      ? { start: Number(selected.outro[0] || selected.outro.start || 0), end: Number(selected.outro[1] || selected.outro.end || 0) }
      : null,
  };
}

async function fetchDesidubWatchSession(
  episodeId: string,
  requestedServer?: string | null,
): Promise<ProviderWatchPayload> {
  const response = await apiJson<JsonValue>(`/api/v2/anime/desidub/watch/${encodeURIComponent(episodeId)}`, {
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
  switch (provider) {
    case "hianime":
      return fetchHianimeWatchSession(episodeId, dubbed, requestedServer);
    case "animekai":
      return fetchAnimeKaiWatchSession(episodeId, dubbed, requestedServer);
    case "desidub":
      return fetchDesidubWatchSession(episodeId, requestedServer);
  }
}

export async function getWatchSession(input: {
  animeId: string;
  episodeNumber?: number;
  provider?: ProviderId | null;
  episodeId?: string | null;
  dubbed?: boolean;
  server?: string | null;
}): Promise<WatchSessionModel> {
  const detail = await getAnimeDetailModel(input.animeId, input.provider || null);
  const preferredProvider = input.provider || detail.activeProvider;
  const order = buildProviderOrder(preferredProvider, detail.activeProvider);
  const targetEpisode =
    detail.episodes.find((episode) => episode.number === Number(input.episodeNumber || 1)) ||
    detail.episodes[0];

  const watchAttempts: WatchAttempt[] = [];

  if (!targetEpisode) {
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
      availableProviders: detail.availableProviders,
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
      continue;
    }

    try {
      const session = await fetchProviderWatch(provider, providerEpisodeId, Boolean(input.dubbed), input.server || null);
      if (!session.source) {
        watchAttempts.push({ provider, server: input.server || undefined, ok: false, reason: "No playable source returned" });
        continue;
      }

      return {
        anime: detail.anime,
        episode: targetEpisode,
        episodes: detail.episodes,
        provider,
        availableProviders: detail.availableProviders,
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
      watchAttempts.push({
        provider,
        server: input.server || undefined,
        ok: false,
        reason: error instanceof Error ? error.message : "Failed to resolve watch session",
      });
    }
  }

  return {
    anime: detail.anime,
    episode: targetEpisode,
    episodes: detail.episodes,
    provider: preferredProvider,
    availableProviders: detail.availableProviders,
    attempts: detail.attempts,
    watchAttempts,
    source: null,
    subtitles: [],
    serverOptions: [],
    activeServerId: null,
    dubbed: Boolean(input.dubbed),
    fallbackHistory: watchAttempts.map((attempt) => `${attempt.provider}: ${attempt.reason}`),
  };
}
