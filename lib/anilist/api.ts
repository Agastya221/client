/**
 * AniList GraphQL API — free, no API key needed, always up-to-date.
 * Used for all catalog browsing: hero banner, trending, seasonal, search.
 * Our Railway Python API is used ONLY for watch session / stream resolution.
 */

const ANILIST_URL = "https://graphql.anilist.co";

const MEDIA_FRAGMENT = `
  fragment MediaFields on Media {
    id
    idMal
    title { romaji english native }
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
    startDate { year }
    studios(isMain: true) { nodes { name } }
    nextAiringEpisode { episode airingAt }
    trailer { id site }
    isAdult
  }
`;

async function anilistQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`AniList API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || "AniList GraphQL error");
  return json.data as T;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnilistMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null; native: string };
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
  startDate: { year: number | null };
  studios: { nodes: { name: string }[] };
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  trailer: { id: string; site: string } | null;
  isAdult: boolean;
}

export interface AnilistPageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
  perPage: number;
}

// ─── Normalize to CatalogAnime ─────────────────────────────────────────────

export function anilistTitle(media: AnilistMedia): string {
  return media.title.english || media.title.romaji;
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
  query Search($search: String, $genre: String, $page: Int, $perPage: Int, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(search: $search, genre: $genre, type: ANIME, sort: $sort, isAdult: false) {
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
          node { id title { english romaji } coverImage { large } format status }
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

// ─── Public API ────────────────────────────────────────────────────────────

export async function getAnilistTrending(perPage = 10): Promise<AnilistMedia[]> {
  const data = await anilistQuery<{ trending: { media: AnilistMedia[] } }>(TRENDING_QUERY, {
    page: 1,
    perPage,
  });
  return data.trending.media;
}

export async function getAnilistSeasonal(perPage = 20): Promise<AnilistMedia[]> {
  const { season, year } = getCurrentSeason();
  const data = await anilistQuery<{ seasonal: { media: AnilistMedia[] } }>(SEASONAL_QUERY, {
    season,
    year,
    page: 1,
    perPage,
  });
  return data.seasonal.media;
}

export async function getAnilistPopular(perPage = 20): Promise<AnilistMedia[]> {
  const data = await anilistQuery<{ popular: { media: AnilistMedia[] } }>(POPULAR_QUERY, {
    page: 1,
    perPage,
  });
  return data.popular.media;
}

export async function searchAnilist(options: {
  search?: string;
  genre?: string;
  page?: number;
  perPage?: number;
  sort?: string[];
}): Promise<{ media: AnilistMedia[]; pageInfo: AnilistPageInfo }> {
  const data = await anilistQuery<{
    Page: { media: AnilistMedia[]; pageInfo: AnilistPageInfo };
  }>(SEARCH_QUERY, {
    search: options.search || undefined,
    genre: options.genre || undefined,
    page: options.page || 1,
    perPage: options.perPage || 24,
    sort: options.sort || (options.search ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"]),
  });
  return { media: data.Page.media, pageInfo: data.Page.pageInfo };
}

export async function getAnilistGenres(): Promise<string[]> {
  const data = await anilistQuery<{ GenreCollection: string[] }>(GENRES_QUERY);
  return data.GenreCollection.filter(Boolean);
}

export interface AnilistDetailMedia extends AnilistMedia {
  characters: { nodes: { name: { full: string }; image: { medium: string } }[] };
  relations: {
    edges: {
      relationType: string;
      node: {
        id: number;
        title: { english: string | null; romaji: string };
        coverImage: { large: string };
        format: string;
        status: string;
      };
    }[];
  };
  recommendations: {
    nodes: { mediaRecommendation: AnilistMedia | null }[];
  };
}

export async function getAnilistDetail(id: number): Promise<AnilistDetailMedia> {
  const data = await anilistQuery<{ Media: AnilistDetailMedia }>(ANIME_DETAIL_QUERY, { id });
  return data.Media;
}
