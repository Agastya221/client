export const PROVIDERS = ["animekai", "desidub"] as const;

export type ProviderId = (typeof PROVIDERS)[number] | "hianime";

export type ProviderAttemptState = "success" | "error" | "empty" | "skipped";

export interface ProviderAttemptStatus {
  provider: ProviderId;
  state: ProviderAttemptState;
  message: string;
}

export interface CatalogAnime {
  id: string;
  provider: ProviderId;
  providerId: string;
  href: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  poster?: string | null;
  banner?: string | null;
  genres: string[];
  type?: string | null;
  rating?: string | null;
  year?: string | null;
  status?: string | null;
  subCount?: number | null;
  dubCount?: number | null;
  episodeCount?: number | null;
  anilistId?: number | null;
  malId?: number | null;
  providerIds: Partial<Record<ProviderId, string>>;
}

export interface HomePageModel {
  hero: CatalogAnime | null;
  trending: CatalogAnime[];
  newReleases: CatalogAnime[];
  topAiring: CatalogAnime[];
  genres: string[];
  activeProvider: ProviderId;
  attempts: ProviderAttemptStatus[];
  sectionProviders: Partial<Record<"hero" | "trending" | "newReleases" | "topAiring", ProviderId>>;
}

export interface SearchPageModel {
  query: string;
  genre: string;
  page: number;
  dubbed: boolean;
  lockedProvider: ProviderId | null;
  results: CatalogAnime[];
  genres: string[];
  activeProvider: ProviderId;
  attempts: ProviderAttemptStatus[];
  totalPages: number | null;
  hasNextPage: boolean;
  browsingLabel: string;
}

export interface GenresPageModel {
  genres: string[];
  featuredGenres: string[];
  activeProvider: ProviderId;
  attempts: ProviderAttemptStatus[];
}

export interface AnimeMetadataRow {
  label: string;
  value: string;
}

export interface EpisodeModel {
  number: number;
  title: string;
  image?: string | null;
  isFiller?: boolean;
  isSubbed?: boolean;
  isDubbed?: boolean;
  idByProvider: Partial<Record<ProviderId, string>>;
  availableProviders: ProviderId[];
}

export interface AnimeDetailModel {
  anime: CatalogAnime;
  synopsis: string;
  metadata: AnimeMetadataRow[];
  episodes: EpisodeModel[];
  episodeCoverageMode: "active-provider" | "merged-providers";
  related: CatalogAnime[];
  recommended: CatalogAnime[];
  activeProvider: ProviderId;
  availableProviders: ProviderId[];
  attempts: ProviderAttemptStatus[];
}

export interface AnimeDetailOverviewModel {
  anime: CatalogAnime;
  synopsis: string;
  metadata: AnimeMetadataRow[];
  related: CatalogAnime[];
  recommended: CatalogAnime[];
  activeProvider: ProviderId;
  availableProviders: ProviderId[];
  attempts: ProviderAttemptStatus[];
}

export interface AnimeEpisodeListModel {
  anime: CatalogAnime;
  episodes: EpisodeModel[];
  episodeCoverageMode: "active-provider" | "merged-providers";
  activeProvider: ProviderId;
  availableProviders: ProviderId[];
}

export interface SubtitleTrack {
  label: string;
  lang: string;
  url: string;
  isDefault?: boolean;
}

export interface StreamSource {
  kind: "video" | "iframe";
  label: string;
  url: string | null;
  proxiedUrl: string | null;
  iframeUrl: string | null;
  isM3U8: boolean;
  requiresProxy: boolean;
}

export interface ServerOption {
  id: string;
  label: string;
  provider: ProviderId;
  category?: string;
}

export interface WatchAttempt {
  provider: ProviderId;
  server?: string;
  ok: boolean;
  reason: string;
}

export interface WatchSessionModel {
  anime: CatalogAnime;
  episode: EpisodeModel;
  episodes: EpisodeModel[];
  provider: ProviderId;
  availableProviders: ProviderId[];
  attempts: ProviderAttemptStatus[];
  watchAttempts: WatchAttempt[];
  source: StreamSource | null;
  subtitles: SubtitleTrack[];
  serverOptions: ServerOption[];
  activeServerId: string | null;
  dubbed: boolean;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  fallbackHistory: string[];
}
