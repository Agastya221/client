"use client";

import VideoPlayer from "@/components/anime/watch/VideoPlayer";
import CommentSection from "@/components/anime/CommentSection";
import {
  WatchAnimeDetailsPanel,
  WatchRecommendationsPanel,
} from "@/components/anime/watch/WatchMetaPanels";
import {
  ControlBtn,
  EpisodeNumberGrid,
  SeasonRail,
  ServerButton,
  summarizeServerGroups,
} from "@/components/anime/watch/WatchUiPrimitives";
import type {
  AnimeSeasonEntry,
  CatalogAnime,
  EpisodeModel,
  ProviderId,
  ServerOption,
  WatchSessionModel,
} from "@/lib/anime/types";
import {
  getEpisodeArtworkUrl,
  mergeEpisodeMetadataIntoWatchSession,
  normalizeEpisodeDescription,
  resolveEpisodeLanguageAvailability,
  type EpisodeDisplayMetadata,
} from "@/lib/anime/episode-metadata";
import { prefetchClientStream, resolveClientStream } from "@/lib/anime/client-stream-resolver";
import type { AnilistMedia, AnilistSeasonEntry } from "@/lib/anilist/api";
import * as playerPrefs from "@/lib/player/player-prefs";
import {
  trackEpisodeWatch,
  getWatchedEpisodes,
} from "@/lib/anime/watch-history";
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Captions,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Grid3X3,
  Images,
  Info,
  Keyboard,
  Lightbulb,
  List,
  Minimize2,
  Play,
  RefreshCcw,
  Search,
  SkipForward,
  Tv2,
} from "lucide-react";
import Image, { type ImageProps } from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const EPISODE_PAGE_SIZE = 100;
const EPISODE_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatEpisodeAirDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(timestamp) ? EPISODE_DATE_FORMATTER.format(timestamp) : null;
}

function EpisodeMicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <rect x="5.25" y="1.5" width="5.5" height="8" rx="2.75" fill="currentColor" />
      <path d="M3.75 7.75a4.25 4.25 0 0 0 8.5 0M8 12v2.5M5.75 14.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface WatchExperienceProps {
  initialSession: WatchSessionModel;
  initialEpisodeMetadata?: EpisodeDisplayMetadata[];
  recommendations?: AnilistMedia[] | null;
  related?: RelatedAnimeEntry[] | null;
  currentUserId?: string | null;
}

interface RelatedAnimeEntry {
  relationType: string;
  media: AnilistMedia;
}

interface SessionRequest {
  episodeNumber: number;
  provider?: ProviderId | null;
  dubbed?: boolean;
  server?: string | null;
}

function buildWatchSessionUrl(animeId: string, request: SessionRequest): string {
  const params = new URLSearchParams();
  params.set("animeId", animeId);
  params.set("episodeNumber", String(request.episodeNumber));
  if (request.provider) params.set("provider", request.provider);
  if (request.dubbed) params.set("dub", "1");
  if (request.server) params.set("server", request.server);
  return `/api/watch-session?${params.toString()}`;
}

function hasDirectPlaybackSource(session: WatchSessionModel): boolean {
  // Only count as a "direct" source if the kind is hls/video (not iframe).
  // Iframe-kind sources (flixcloud embeds from Anivexa) use the iframe player path.
  if (session.source?.kind === "iframe") return false;
  return Boolean(session.source?.proxiedUrl || session.source?.url);
}

/* ── Client-side instant episode switching for custom embeds ──────────────
   When the user switches episodes on a custom embed server (megaplay,
   animeplay, etc.) we can build the new session entirely client-side:
   just swap the episode number in the iframe URL and update the episode
   metadata. This avoids the full /api/watch-session round-trip (500-2000ms)
   making episode switching feel instant. */

const CUSTOM_EMBED_BASES = ["megaplay", "animeplay", "tryembed", "mostream"] as const;
const WORKER_PROVIDER_IDS = ["reanime", "allmanga", "anikoto", "animegg", "anineko"] as const;

function isCustomEmbedServer(serverId: string | null): boolean {
  if (!serverId) return false;
  const base = serverId.split("-")[0];
  return CUSTOM_EMBED_BASES.some((b) => base === b);
}

function isWorkerProvider(provider: ProviderId | null | undefined): boolean {
  return Boolean(provider && (WORKER_PROVIDER_IDS as readonly string[]).includes(provider));
}

function isWorkerServerOption(serverId: string | null | undefined): boolean {
  if (!serverId) return false;
  if (serverId.startsWith("anivexa-") || serverId.startsWith("anivexa2-")) return true;
  const base = serverId.split("-")[0];
  return (WORKER_PROVIDER_IDS as readonly string[]).includes(base);
}

function isEmbedServerOption(serverId: string): boolean {
  return serverId.includes("-embed") || serverId.endsWith("-embed") || isCustomEmbedServer(serverId);
}

function watchDebug(event: string, details: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  console.info(JSON.stringify({
    at: new Date().toISOString(),
    scope: "anime-watch-client",
    event,
    ...details,
  }));
}

function buildCustomEmbedUrl(
  serverId: string,
  anime: { anilistId?: number | null; malId?: number | null },
  episodeNumber: number,
): string | null {
  const base = serverId.split("-")[0]; // "megaplay" | "animeplay" | "tryembed" | "mostream"
  const lang = serverId.endsWith("-dub") ? "dub" : "sub";
  const { anilistId, malId } = anime;

  if (base === "megaplay") {
    if (anilistId) return `https://megaplay.buzz/stream/ani/${anilistId}/${episodeNumber}/${lang}`;
    if (malId) return `https://megaplay.buzz/stream/mal/${malId}/${episodeNumber}/${lang}`;
  } else if (base === "animeplay") {
    if (anilistId) return `https://animeplay.cfd/stream/ani/${anilistId}/${episodeNumber}/${lang}`;
    if (malId) return `https://animeplay.cfd/stream/mal/${malId}/${episodeNumber}/${lang}`;
  } else if (base === "tryembed") {
    if (anilistId) return `https://tryembed.us.cc/embed/anime/${anilistId}/${episodeNumber}/${lang}`;
    if (malId) return `https://tryembed.us.cc/embed/anime/${malId}/${episodeNumber}/${lang}`;
  } else if (base === "mostream") {
    if (malId) return `https://mostream.us/anime.php?mal=${malId}&e=${episodeNumber}&lang=${lang}`;
    if (anilistId) return `https://mostream.us/anime.php?mal=${anilistId}&e=${episodeNumber}&lang=${lang}`;
  }
  return null;
}

/**
 * Try to resolve an episode/server/language switch entirely on the client.
 * Returns null if the request can't be handled locally (e.g. provider change,
 * non-embed server, missing anime IDs).
 *
 * Handles three cases instantly without a network round-trip:
 *  1. Episode switch on the same custom embed server
 *  2. Server switch to another custom embed server
 *  3. Sub/Dub language switch on a custom embed server (flips the -sub/-dub suffix)
 */
function tryBuildLocalSession(
  current: WatchSessionModel,
  request: SessionRequest,
): WatchSessionModel | null {
  // Only handle same-provider switches
  const sameProvider = !request.provider || request.provider === current.provider;
  if (!sameProvider) return null;

  // Must have anime IDs available
  if (!current.anime.anilistId && !current.anime.malId) return null;

  const targetDubbed = request.dubbed ?? current.dubbed;

  // Determine target server.
  // If an explicit server was requested, use it (possibly adjusting suffix for language).
  // If no explicit server, keep the current server but flip the suffix if the language changed.
  let targetServerId: string | null = null;

  if (request.server) {
    // Explicit server requested — honour it, adjusting suffix for the target language
    const base = request.server.split("-")[0];
    const langSuffix = targetDubbed ? "dub" : "sub";
    // If the server id already has a lang suffix, normalise it; otherwise keep as-is
    const serverHasSuffix = request.server.endsWith("-sub") || request.server.endsWith("-dub");
    targetServerId = serverHasSuffix ? `${base}-${langSuffix}` : request.server;
  } else {
    // No explicit server — use the current server, flipping suffix when language changes
    const currentServer = current.activeServerId;
    if (!currentServer) return null;
    const base = currentServer.split("-")[0];
    const langSuffix = targetDubbed ? "dub" : "sub";
    const serverHasSuffix = currentServer.endsWith("-sub") || currentServer.endsWith("-dub");
    targetServerId = serverHasSuffix ? `${base}-${langSuffix}` : currentServer;
  }

  // Must be on a custom embed server
  if (!isCustomEmbedServer(targetServerId)) return null;

  // Find the target episode in the already-loaded episode list
  const targetEpisode = current.episodes.find((ep) => ep.number === request.episodeNumber);
  if (!targetEpisode) return null;

  // Build the new iframe URL
  const newIframeUrl = buildCustomEmbedUrl(
    targetServerId,
    current.anime,
    request.episodeNumber,
  );
  if (!newIframeUrl) return null;

  return {
    ...current,
    episode: targetEpisode,
    activeServerId: targetServerId,
    dubbed: targetDubbed,
    source: {
      kind: "iframe",
      label: current.source?.label || "Embed",
      url: null,
      proxiedUrl: null,
      iframeUrl: newIframeUrl,
      isM3U8: false,
      requiresProxy: false,
    },
    subtitles: [],
    watchAttempts: [{ provider: current.provider, server: targetServerId, ok: true, reason: "Playback ready (embed)" }],
    fallbackHistory: [],
    stale: false,
    fallback: false,
    message: null,
  };
}


/* ── Client-side session cache ─────────────────────
   Keeps up to 20 recently fetched sessions in memory.
   Going back to a previously visited episode is instant. */
const SESSION_CACHE_MAX = 20;
const sessionCache = new Map<string, { data: WatchSessionModel; ts: number; prefetched?: boolean }>();
const inflightSessionRequests = new Map<string, Promise<WatchSessionModel>>();

/* ── Prefetch budget ─────────────────────────────────
   Limits prefetch to MAX_PREFETCH_PER_ANIME episodes per anime
   to avoid over-fetching and excessive backend load. */
const MAX_PREFETCH_PER_ANIME = 3;
const prefetchBudget = new Map<string, number>();

function getPrefetchCount(animeId: string): number {
  return prefetchBudget.get(animeId) || 0;
}

function incrementPrefetchCount(animeId: string): void {
  prefetchBudget.set(animeId, (prefetchBudget.get(animeId) || 0) + 1);
}

function canPrefetch(animeId: string): boolean {
  return getPrefetchCount(animeId) < MAX_PREFETCH_PER_ANIME;
}

/* ── Prefetch effectiveness tracking ─────────────────
   Lightweight counters to measure if prefetches are used. */
const prefetchStats = { fired: 0, used: 0, skippedBudget: 0, skippedCached: 0 };

/** Call from dev tools: (window as any).__prefetchStats?.() */
if (typeof window !== "undefined") {
  const debugWindow = window as typeof window & {
    __prefetchStats?: () => typeof prefetchStats;
  };
  debugWindow.__prefetchStats = () => ({ ...prefetchStats });
}

function getCachedSession(url: string): WatchSessionModel | null {
  const entry = sessionCache.get(url);
  if (!entry) return null;
  // Expire after 5 minutes
  if (Date.now() - entry.ts > 5 * 60 * 1000) {
    sessionCache.delete(url);
    return null;
  }
  return entry.data;
}

function isCachedOrInflight(url: string): boolean {
  return sessionCache.has(url) || inflightSessionRequests.has(url);
}

function setCachedSession(url: string, data: WatchSessionModel, prefetched = false): void {
  // Evict oldest if full
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldest = [...sessionCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) sessionCache.delete(oldest[0]);
  }
  sessionCache.set(url, { data, ts: Date.now(), prefetched });
}

function loadWatchSession(
  animeId: string,
  request: SessionRequest,
  options?: { priority?: RequestPriority; isPrefetch?: boolean }
): Promise<WatchSessionModel> {
  const url = buildWatchSessionUrl(animeId, request);
  const cached = getCachedSession(url);
  if (cached) {
    // Track that a prefetched session was used by a real navigation
    if (!options?.isPrefetch && sessionCache.get(url)?.prefetched) {
      prefetchStats.used += 1;
    }
    return Promise.resolve(cached);
  }

  const inflight = inflightSessionRequests.get(url);
  if (inflight) {
    return inflight;
  }

  const requestPromise = fetch(url, options?.priority ? { priority: options.priority } : undefined)
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as WatchSessionModel | { message?: string } | null;
      if (!response.ok) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : `Watch session failed with ${response.status}`
        );
      }

      const result = payload as WatchSessionModel;
      setCachedSession(url, result, options?.isPrefetch ?? false);
      return result;
    })
    .finally(() => {
      inflightSessionRequests.delete(url);
    });

  inflightSessionRequests.set(url, requestPromise);
  return requestPromise;
}

function prefetchWatchSession(animeId: string, request: SessionRequest): void {
  const url = buildWatchSessionUrl(animeId, request);
  prefetchClientStream({
    animeId,
    episodeNumber: request.episodeNumber,
    provider: request.provider,
    dubbed: request.dubbed,
    server: request.server,
  });

  // Skip if already cached or in-flight
  if (isCachedOrInflight(url)) {
    prefetchStats.skippedCached += 1;
    return;
  }

  // Skip if budget exhausted for this anime
  if (!canPrefetch(animeId)) {
    prefetchStats.skippedBudget += 1;
    return;
  }

  incrementPrefetchCount(animeId);
  prefetchStats.fired += 1;

  void loadWatchSession(animeId, request, {
    priority: "low" as RequestPriority,
    isPrefetch: true,
  }).catch(() => undefined);
}

function sessionViewKey(session: WatchSessionModel): string {
  return [
    session.anime.id,
    session.episode.number,
    session.provider,
    session.dubbed ? "dub" : "sub",
    session.activeServerId || "",
    session.source?.iframeUrl || session.source?.proxiedUrl || session.source?.url || "none",
  ].join("|");
}

function sameStringArray<T extends string>(left: readonly T[], right: readonly T[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameKeyedStrings(
  left: Record<string, string | undefined>,
  right: Record<string, string | undefined>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? null) !== (right[key] ?? null)) {
      return false;
    }
  }
  return true;
}

function sameCatalogAnime(left: CatalogAnime, right: CatalogAnime): boolean {
  return (
    left.id === right.id &&
    left.provider === right.provider &&
    left.providerId === right.providerId &&
    left.href === right.href &&
    left.title === right.title &&
    left.subtitle === right.subtitle &&
    left.description === right.description &&
    left.poster === right.poster &&
    left.banner === right.banner &&
    sameStringArray(left.genres, right.genres) &&
    left.type === right.type &&
    left.rating === right.rating &&
    left.year === right.year &&
    left.status === right.status &&
    left.subCount === right.subCount &&
    left.dubCount === right.dubCount &&
    left.episodeCount === right.episodeCount &&
    left.anilistId === right.anilistId &&
    left.malId === right.malId &&
    sameKeyedStrings(left.providerIds, right.providerIds)
  );
}

function sameSeasonEntry(left: AnimeSeasonEntry, right: AnimeSeasonEntry): boolean {
  return (
    left.title === right.title &&
    left.href === right.href &&
    left.poster === right.poster &&
    left.episodeLabel === right.episodeLabel &&
    left.episodeCount === right.episodeCount &&
    left.isActive === right.isActive
  );
}

function sameSeasonList(left: AnimeSeasonEntry[], right: AnimeSeasonEntry[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameSeasonEntry(left[index], right[index])) return false;
  }
  return true;
}

function sameEpisode(left: EpisodeModel, right: EpisodeModel): boolean {
  return (
    left.number === right.number &&
    left.title === right.title &&
    left.image === right.image &&
    left.description === right.description &&
    left.airDate === right.airDate &&
    left.isFiller === right.isFiller &&
    left.isSubbed === right.isSubbed &&
    left.isDubbed === right.isDubbed &&
    sameKeyedStrings(left.idByProvider, right.idByProvider) &&
    sameStringArray(left.availableProviders, right.availableProviders)
  );
}

function sameEpisodeList(left: EpisodeModel[], right: EpisodeModel[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameEpisode(left[index], right[index])) return false;
  }
  return true;
}

function sameServerOption(left: ServerOption, right: ServerOption): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.provider === right.provider &&
    left.category === right.category &&
    left.subType === right.subType &&
    left.transport === right.transport
  );
}

function sameServerOptionList(left: ServerOption[], right: ServerOption[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameServerOption(left[index], right[index])) return false;
  }
  return true;
}

type SafeWatchImageProps = Omit<ImageProps, "src" | "alt" | "onError"> & {
  src?: string | null;
};

function SafeWatchImage({ src, ...props }: SafeWatchImageProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const activeSrc = src && !failedSources.includes(src) ? src : null;

  if (!activeSrc) return null;

  return (
    <Image
      {...props}
      src={activeSrc}
      alt=""
      onError={() => {
        setFailedSources((current) => current.includes(activeSrc) ? current : [...current, activeSrc]);
      }}
    />
  );
}

function WatchPreferenceToggle({
  label,
  active,
  onToggle,
  accentColor,
  icon: Icon,
  disabled = false,
  title,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  accentColor: string;
  icon: typeof Play;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
      title={title}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-35"
      style={active && !disabled ? { color: accentColor } : undefined}
    >
      <span
        className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-white/15"
        style={active && !disabled ? { borderColor: accentColor, backgroundColor: accentColor } : undefined}
      >
        {active && !disabled ? <span className="h-1.5 w-1.5 rounded-[1px] bg-white" /> : null}
      </span>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  );
}

function serverOptionMergeKey(option: ServerOption): string {
  const gateway = option.id.match(/^anivexa2-([a-z0-9]+)-(hls|mp4|embed)-(?:soft|hard|dub)$/);
  if (!gateway) return option.id;
  return `anivexa2:${gateway[1]}:${gateway[2]}:${option.category || "sub"}`;
}

function mergeServerOptionLists(previous: ServerOption[], next: ServerOption[]): ServerOption[] {
  const nextByKey = new Map(next.map((option) => [serverOptionMergeKey(option), option]));
  const previousKeys = new Set(previous.map(serverOptionMergeKey));
  return [
    ...previous.map((option) => nextByKey.get(serverOptionMergeKey(option)) || option),
    ...next.filter((option) => !previousKeys.has(serverOptionMergeKey(option))),
  ];
}

function mergeWatchSessions(previous: WatchSessionModel, next: WatchSessionModel): WatchSessionModel {
  if (previous.anime.id !== next.anime.id) {
    return next;
  }

  const anime = sameCatalogAnime(previous.anime, next.anime) ? previous.anime : next.anime;
  const seasons = sameSeasonList(previous.seasons, next.seasons) ? previous.seasons : next.seasons;
  const episodes = sameEpisodeList(previous.episodes, next.episodes) ? previous.episodes : next.episodes;
  const availableProviders = sameStringArray(previous.availableProviders, next.availableProviders)
    ? previous.availableProviders
    : next.availableProviders;
  const nextServerOptions =
    previous.episode.number === next.episode.number && previous.dubbed === next.dubbed
      ? mergeServerOptionLists(previous.serverOptions, next.serverOptions)
      : next.serverOptions;
  const serverOptions = sameServerOptionList(previous.serverOptions, nextServerOptions)
    ? previous.serverOptions
    : nextServerOptions;
  const mergedEpisode =
    episodes.find((episode) => episode.number === next.episode.number && sameEpisode(episode, next.episode)) ||
    next.episode;

  return {
    ...next,
    anime,
    seasons,
    episodes,
    availableProviders,
    serverOptions,
    episode: mergedEpisode,
  };
}

/* ════════════════════════════════════════════════
   MAIN: WatchExperience
   ════════════════════════════════════════════════ */
export default function WatchExperience({ initialSession, initialEpisodeMetadata = [], recommendations = null, related = null, currentUserId }: WatchExperienceProps) {
  const initialRecommendations = recommendations ?? null;
  const initialRelated = related ?? null;
  const [session, setSession] = useState(initialSession);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(initialSession.message || null);
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [episodeRangeStart, setEpisodeRangeStart] = useState(0);
  const [episodeView, setEpisodeView] = useState<"grid" | "list" | "cards">("cards");
  const [showEmbedServers, setShowEmbedServers] = useState(() => Boolean(initialSession.activeServerId && isEmbedServerOption(initialSession.activeServerId)));
  const [focusMode, setFocusMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [autoSkip, setAutoSkip] = useState(() => playerPrefs.getAutoSkip());
  const [autoAdvance, setAutoAdvance] = useState(() => playerPrefs.getAutoAdvance());
  const [autoPlay, setAutoPlay] = useState(() => playerPrefs.getAutoplay());
  const [playerActivated, setPlayerActivated] = useState(false);
  const [loadedSurfaceKey, setLoadedSurfaceKey] = useState<string | null>(null);
  // Optimistic server selection: turns the button green immediately on click
  // before the embed has finished loading. Cleared when the session commits.
  const [optimisticServerId, setOptimisticServerId] = useState<string | null>(null);
  const pendingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPrefetchKeyRef = useRef<string | null>(null);
  const pendingSessionKeyRef = useRef<string | null>(null);
  const nearEndPrefetchedRef = useRef<string | null>(null);
  const sessionRequestSeqRef = useRef(0);
  const userActivatedPlayerRef = useRef(false);
  const episodeMetadataRef = useRef<{
    animeId: string;
    entries: EpisodeDisplayMetadata[];
  } | null>(initialEpisodeMetadata.length > 0 ? {
    animeId: initialSession.anime.id,
    entries: initialEpisodeMetadata,
  } : null);
  const failedServerIdsRef = useRef<Set<string>>(new Set());
  const [deferredRecommendations, setDeferredRecommendations] = useState<AnilistMedia[] | null>(initialRecommendations);
  const [deferredRelated, setDeferredRelated] = useState<RelatedAnimeEntry[] | null>(initialRelated);
  const [deferredDetail, setDeferredDetail] = useState<AnilistMedia | null>(null);
  const [deferredSeasons, setDeferredSeasons] = useState<AnilistSeasonEntry[] | null>(null);
  const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<string | null>(currentUserId ?? null);

  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkChecked, setBookmarkChecked] = useState(false);
  const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    import("@/lib/anime/bookmarks").then(({ isBookmarked: getBookmarkState, ensureBookmarksHydrated, subscribeToBookmarks }) => {
      const syncState = () => {
        setIsBookmarked(getBookmarkState(session.anime.id));
        setBookmarkChecked(true);
      };

      syncState();
      ensureBookmarksHydrated().finally(syncState);
      return subscribeToBookmarks(syncState);
    });
  }, [session.anime.id]);

  const toggleBookmark = async () => {
    const { isBookmarked: getBookmarkState, saveBookmark, removeBookmark } = await import("@/lib/anime/bookmarks");
    if (getBookmarkState(session.anime.id)) {
      removeBookmark(session.anime.id);
      setIsBookmarked(false);
    } else {
      saveBookmark({
        animeId: session.anime.id,
        title: session.anime.title,
        poster: session.anime.poster || "",
        href: session.anime.href,
        status: "PLAN_TO_WATCH",
      });
      setIsBookmarked(true);
    }
  };

  // A playable source exists — either an iframe embed or (in future) a direct HLS stream
  const embedAvailable = Boolean(session.source);
  const directAvailable = hasDirectPlaybackSource(session);
  const cameFromAnilistCatalog =
    session.anime.id.startsWith("anilist~") || session.anime.href.includes("/anime/anilist~");
  const mappingUnavailable =
    cameFromAnilistCatalog &&
    (session.attempts.some(
      (attempt) => attempt.provider === "animekai" && /No provider mapping available/i.test(attempt.message),
    ) ||
      session.fallbackHistory.some((entry) => /animekai:\s*No provider mapping available/i.test(entry)));
  const [pendingSession, setPendingSession] = useState<WatchSessionModel | null>(null);
  const pendingEmbedUrl = pendingSession?.source?.kind === "iframe" ? pendingSession.source.iframeUrl : null;
  const animeGenresKey = session.anime.genres.join("|");
  const playerType = directAvailable ? "hls" : "iframe";
  const activePlayerSurfaceKey = [
    session.anime.id,
    session.episode.number,
    session.activeServerId || "auto",
    playerType,
    session.source?.proxiedUrl || session.source?.url || session.source?.iframeUrl || "none",
  ].join("|");
  const embedOnlyBlocked = !embedAvailable && directAvailable;
  const activeEmbedLoaded = loadedSurfaceKey === activePlayerSurfaceKey;
  const watchedEpisodes = getWatchedEpisodes(session.anime.id);

  // ── Dynamic theme accent from AniList coverImage.color ───────────────────
  const accentColor = session.anime.color || "#ff5500";
  // Pre-compute CSS-friendly opacity variants for inline styles
  const accentRgb = (() => {
    const hex = accentColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r},${g},${b}`;
  })();
  const accentStyle = (opacity: number) => `rgba(${accentRgb},${opacity})`;

  // ── Language availability ──────────────────────────────────────────────────
  // Episodes are synthetic (from AniList) with no isDubbed/isSubbed flags.
  // We get accurate sub/dub episode counts from the Anikoto API (same library
  // as MegaPlay). When dubCount is set, we cap the episode list in dub mode
  // so users only see episodes that actually have dub available.
  const canUseEmbed = Boolean(session.anime.anilistId || session.anime.malId);
  const { dubCount, subCount } = session.anime;
  const hasDubEpisode = session.episodes.some((episode) => episode.isDubbed === true);
  const hasSubEpisode = session.episodes.some((episode) => episode.isSubbed === true);
  const hasLanguageInfo = hasDubEpisode || hasSubEpisode;
  const hasDubServer = session.serverOptions.some((entry) => entry.category === "dub");
  const hasSubServer = session.serverOptions.some((entry) => entry.category === "sub" || !entry.category);
  // A language is available when a provider count, episode flag, or successfully
  // probed server confirms it. A zero/unknown catalog count must not override a
  // real working server (long-running shows such as One Piece hit this case).
  const hasDub =
    (dubCount != null && dubCount > 0) ||
    hasDubEpisode ||
    hasDubServer;
  const hasSub =
    canUseEmbed ||
    hasSubEpisode ||
    hasSubServer;

  // Cap episode list by dubCount when in dub mode (for synthetic episodes).
  // If dubCount is null (anime not found in Anikoto), show all episodes.
  const normalizedAnimeStatus = String(session.anime.status || "").toUpperCase().replace(/[ -]+/g, "_");
  const languageFilteredEpisodes = useMemo(() => session.episodes.filter((episode) => {
    if (normalizedAnimeStatus.includes("NOT_YET_RELEASED") || normalizedAnimeStatus.includes("UPCOMING")) {
      return false;
    }

    const confirmedCount = session.dubbed ? dubCount : subCount;
    if (confirmedCount != null && confirmedCount > 0) {
      if (episode.number > confirmedCount) return false;
    }

    if (session.dubbed) {
      return hasDubEpisode ? episode.isDubbed === true : hasDub;
    }
    return hasSubEpisode ? episode.isSubbed !== false : hasSub;
  }), [
    dubCount,
    hasDub,
    hasDubEpisode,
    hasSub,
    hasSubEpisode,
    normalizedAnimeStatus,
    session.dubbed,
    session.episodes,
    subCount,
  ]);

  // Whether the dub count is known (from Anikoto) or unknown
  const dubCountKnown = dubCount !== null && dubCount !== undefined && dubCount > 0;

  const getFallbackEpisodeForLanguage = (targetDubbed: boolean, currentEpNum: number) => {
    // For embed routes, use dubCount/subCount to determine the max available episode
    if (!hasLanguageInfo) {
      const maxEp = targetDubbed
        ? (dubCountKnown ? dubCount! : Infinity)
        : (subCount !== null && subCount !== undefined && subCount > 0 ? subCount : Infinity);
      return currentEpNum <= maxEp ? currentEpNum : Math.min(currentEpNum, maxEp);
    }
    const targetEpisodes = session.episodes.filter((ep) =>
      targetDubbed ? (ep.isDubbed ?? false) : (ep.isSubbed ?? true)
    );
    if (targetEpisodes.length === 0) return currentEpNum;
    const exactMatch = targetEpisodes.find((ep) => ep.number === currentEpNum);
    if (exactMatch) return currentEpNum;
    const closest = [...targetEpisodes].reverse().find((ep) => ep.number <= currentEpNum);
    return closest ? closest.number : targetEpisodes[0].number;
  };

  // Only show the feedback overlay while actively loading a new session (not during initial embed load)
  // This prevents the "OPENING PLAYER" overlay from blocking the iframe while it loads.
  // Also show while the new iframe hasn't called onReady yet, to hide the white flash.
  const showPlayerFeedback = playerActivated && (isSessionLoading || (embedAvailable && !activeEmbedLoaded));

  useEffect(() => {
    return () => {
      if (pendingCommitTimerRef.current) clearTimeout(pendingCommitTimerRef.current);
      if (hoverPrefetchTimerRef.current) clearTimeout(hoverPrefetchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (session.anime.anilistId) params.set("anilistId", String(session.anime.anilistId));
    if (session.anime.title) params.set("title", session.anime.title);
    if (animeGenresKey) params.set("genres", animeGenresKey.replaceAll("|", ","));

    const controller = new AbortController();

    void fetch(`/api/watch-page-context?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Watch page context failed with ${response.status}`);
        }
        return response.json() as Promise<{
          currentUserId?: string | null;
          detail?: AnilistMedia | null;
          seasons?: AnilistSeasonEntry[];
          related?: RelatedAnimeEntry[];
          recommendations?: AnilistMedia[];
          episodeMetadata?: EpisodeDisplayMetadata[];
        }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const episodeMetadata = payload.episodeMetadata ?? [];
        episodeMetadataRef.current = {
          animeId: session.anime.id,
          entries: episodeMetadata,
        };
        if (episodeMetadata.length > 0) {
          setSession((current) =>
            current.anime.id === session.anime.id
              ? mergeEpisodeMetadataIntoWatchSession(current, episodeMetadata)
              : current);
        }
        setDeferredDetail(payload.detail ?? null);
        setDeferredSeasons(payload.seasons ?? []);
        setDeferredRelated(payload.related ?? []);
        setDeferredRecommendations(payload.recommendations ?? []);
        setResolvedCurrentUserId(payload.currentUserId ?? null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDeferredDetail(null);
        setDeferredSeasons([]);
        setDeferredRelated((current) => current ?? []);
        setDeferredRecommendations((current) => current ?? []);
      });

    return () => controller.abort();
  }, [animeGenresKey, session.anime.anilistId, session.anime.id, session.anime.title]);

  /* ── Watch history tracking ─────────────────── */
  useEffect(() => {
    // Track episode view
    trackEpisodeWatch(session.anime.id, session.episode.number, {
      title: session.anime.title,
      poster: session.anime.poster ?? null,
      href: session.anime.href,
      provider: session.provider,
    });
  }, [session.anime.id, session.anime.title, session.anime.poster, session.anime.href, session.provider, session.episode.number]);

  /* ── Focus mode ────────────────────────────── */
  useEffect(() => {
    if (focusMode) {
      document.body.style.overflow = "hidden";
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") setFocusMode(false);
      };
      window.addEventListener("keydown", handleEsc);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleEsc);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [focusMode]);

  const fetchSession = async (request: SessionRequest): Promise<WatchSessionModel> => {
    watchDebug("watch_session_fetch.start", {
      animeId: session.anime.id,
      episodeNumber: request.episodeNumber,
      provider: request.provider,
      dubbed: request.dubbed,
      server: request.server,
    });
    return loadWatchSession(session.anime.id, request);
  };

  const resolveCurrentSource = async (request: SessionRequest): Promise<WatchSessionModel> => {
    const startedAt = performance.now();
    watchDebug("resolve_source.start", {
      animeId: session.anime.id,
      episodeNumber: request.episodeNumber,
      provider: request.provider,
      dubbed: request.dubbed,
      server: request.server,
    });

    const payload = await resolveClientStream({
      animeId: session.anime.id,
      episodeNumber: request.episodeNumber,
      provider: request.provider,
      dubbed: request.dubbed,
      server: request.server,
    });

    watchDebug("resolve_source.done", {
      animeId: session.anime.id,
      episodeNumber: request.episodeNumber,
      requestedProvider: request.provider,
      provider: payload.provider,
      activeServerId: payload.activeServerId,
      sourceKind: payload.source?.kind || "none",
      isM3U8: Boolean(payload.source?.isM3U8),
      subtitleCount: payload.subtitles?.length || 0,
      serverCount: payload.serverOptions?.length || 0,
      durationMs: Math.round(performance.now() - startedAt),
    });

    const resolvedEpisode =
      session.episodes.find((episode) => episode.number === request.episodeNumber) || {
        number: request.episodeNumber,
        title: `Episode ${request.episodeNumber}`,
        idByProvider: {},
        availableProviders: [],
      };

    return {
      ...session,
      episode: resolvedEpisode,
      provider: payload.provider || request.provider || session.provider,
      source: payload.source || null,
      subtitles: payload.subtitles || [],
      serverOptions: payload.serverOptions?.length ? payload.serverOptions : session.serverOptions,
      activeServerId: payload.activeServerId || null,
      intro: payload.intro ?? null,
      outro: payload.outro ?? null,
      watchAttempts: payload.watchAttempts || session.watchAttempts,
      dubbed: request.dubbed ?? session.dubbed,
      stale: false,
      fallback: false,
      message: payload.source ? null : "No playable source returned.",
      fallbackHistory: payload.source ? [] : ["Resolve source returned no playable stream"],
    };
  };

  const clearPendingCommit = () => {
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
  };

  const commitSession = (nextSession: WatchSessionModel) => {
    watchDebug("session.commit", {
      animeId: nextSession.anime.id,
      episodeNumber: nextSession.episode.number,
      provider: nextSession.provider,
      activeServerId: nextSession.activeServerId,
      sourceKind: nextSession.source?.kind || "none",
      stale: Boolean(nextSession.stale),
      subtitleCount: nextSession.subtitles.length,
      serverCount: nextSession.serverOptions.length,
    });
    clearPendingCommit();
    pendingSessionKeyRef.current = null;
    setPendingSession(null);
    sessionRequestSeqRef.current += 1;
    setIsSessionLoading(false);
    setOptimisticServerId(null); // real server id is now in session — clear optimistic

    setSession((previous) => {
      const merged = mergeWatchSessions(previous, nextSession);
      const deferredMetadata = episodeMetadataRef.current;
      return deferredMetadata?.animeId === merged.anime.id
        ? mergeEpisodeMetadataIntoWatchSession(merged, deferredMetadata.entries)
        : merged;
    });
    setPlaybackMessage(nextSession.message || null);
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("ep", String(session.episode.number));
    if (session.dubbed) url.searchParams.set("dub", "1");
    else url.searchParams.delete("dub");
    if (session.provider) url.searchParams.set("provider", session.provider);
    if (session.activeServerId) url.searchParams.set("server", session.activeServerId);
    else url.searchParams.delete("server");
    window.history.replaceState(window.history.state, "", url);
  }, [session.activeServerId, session.dubbed, session.episode.number, session.provider]);

  const stageOrCommitSession = (nextSession: WatchSessionModel) => {
    if (
      nextSession.source?.kind !== "iframe" ||
      !nextSession.source.iframeUrl ||
      !autoPlay ||
      !userActivatedPlayerRef.current
    ) {
      commitSession(nextSession);
      return;
    }

    const nextKey = sessionViewKey(nextSession);
    clearPendingCommit();
    pendingSessionKeyRef.current = nextKey;
    setPendingSession(nextSession);
    pendingCommitTimerRef.current = setTimeout(() => {
      if (pendingSessionKeyRef.current === nextKey) {
        commitSession(nextSession);
      }
    }, 4000);
  };

  const applySession = async (request: SessionRequest, requestSeq?: number): Promise<WatchSessionModel> => {
    // Fall back to server fetch
    const nextSession = await fetchSession(request);
    if (requestSeq !== undefined && sessionRequestSeqRef.current !== requestSeq) {
      return nextSession;
    }
    stageOrCommitSession(nextSession);
    return nextSession;
  };

  const handlePendingPlayerReady = (readyKey: string) => {
    if (pendingSessionKeyRef.current !== readyKey || !pendingSession) {
      return;
    }

    if (sessionViewKey(pendingSession) !== readyKey) {
      return;
    }
    commitSession(pendingSession);
  };

  const queueSession = (request: SessionRequest) => {
    const normalizedRequest: SessionRequest = {
      episodeNumber: request.episodeNumber,
      provider: request.provider ?? session.provider,
      dubbed: request.dubbed ?? session.dubbed,
      server: request.server ?? null,
    };

    watchDebug("queue_session", {
      animeId: session.anime.id,
      currentEpisode: session.episode.number,
      currentProvider: session.provider,
      currentServer: session.activeServerId,
      requestedEpisode: normalizedRequest.episodeNumber,
      requestedProvider: normalizedRequest.provider,
      requestedServer: normalizedRequest.server,
      requestedDubbed: normalizedRequest.dubbed,
    });

    if (
      normalizedRequest.episodeNumber === session.episode.number &&
      normalizedRequest.provider === session.provider &&
      normalizedRequest.dubbed === session.dubbed &&
      (normalizedRequest.server ?? null) === (session.activeServerId ?? null)
    ) {
      return;
    }

    const playbackContextChanged =
      normalizedRequest.episodeNumber !== session.episode.number ||
      normalizedRequest.dubbed !== session.dubbed;
    if (playbackContextChanged) {
      setLoadedSurfaceKey(null);
      setPlayerActivated(autoPlay && userActivatedPlayerRef.current);
    }

    clearPendingCommit();
    if (hoverPrefetchTimerRef.current) {
      clearTimeout(hoverPrefetchTimerRef.current);
      hoverPrefetchTimerRef.current = null;
    }
    hoverPrefetchKeyRef.current = null;
    pendingSessionKeyRef.current = null;
    setPendingSession(null);
    const requestSeq = ++sessionRequestSeqRef.current;

    // Optimistic server selection gives instant feedback while the resolver runs.
    // The real active server is committed only after the request completes.
    if (normalizedRequest.server) {
      setOptimisticServerId(normalizedRequest.server);
    } else if (normalizedRequest.dubbed !== session.dubbed) {
      // Dub/sub switch — derive the expected server id by flipping the suffix
      const base = (session.activeServerId || "megaplay").split("-")[0];
      setOptimisticServerId(`${base}-${normalizedRequest.dubbed ? "dub" : "sub"}`);
    }

    // ⚡ Try client-side local session first
    const localSession = tryBuildLocalSession(session, normalizedRequest);
    if (localSession) {
      watchDebug("queue_session.local_embed", {
        provider: localSession.provider,
        activeServerId: localSession.activeServerId,
        sourceKind: localSession.source?.kind || "none",
      });
      const serverChanged = normalizedRequest.server && normalizedRequest.server !== session.activeServerId;
      const dubChanged = normalizedRequest.dubbed !== session.dubbed;
      if (serverChanged || dubChanged) {
        // Preload new embed in background — keeps current video playing until ready
        stageOrCommitSession(localSession);
      } else {
        // Same server, same language, just episode switch: commit instantly
        commitSession(localSession);
      }
      return;
    }

    const shouldResolveWorkerSource =
      (isWorkerProvider(normalizedRequest.provider) || isWorkerServerOption(normalizedRequest.server)) &&
      (
        normalizedRequest.provider !== session.provider ||
        !normalizedRequest.server ||
        isWorkerServerOption(normalizedRequest.server)
      );

    if (shouldResolveWorkerSource) {
      watchDebug("queue_session.worker_resolve", {
        provider: normalizedRequest.provider,
        server: normalizedRequest.server,
        serverSentToResolver: normalizedRequest.server,
      });
      setIsSessionLoading(true);
      void resolveCurrentSource(normalizedRequest)
        .then((nextSession) => {
          if (sessionRequestSeqRef.current !== requestSeq) return;
          commitSession(nextSession);
        })
        .catch((error) => {
          if (sessionRequestSeqRef.current !== requestSeq) return;
          watchDebug("queue_session.worker_resolve_error", {
            provider: normalizedRequest.provider,
            server: normalizedRequest.server,
            message: error instanceof Error ? error.message : "Unable to resolve worker stream.",
          });
          setPlaybackMessage(error instanceof Error ? error.message : "Unable to resolve worker stream.");
          setIsSessionLoading(false);
          setOptimisticServerId(null);
        });
      return;
    }

    // Otherwise, do a server-side load
    setIsSessionLoading(true);
    void applySession(normalizedRequest, requestSeq)
      .catch((error) => {
        if (sessionRequestSeqRef.current !== requestSeq) return;
        watchDebug("queue_session.watch_session_error", {
          provider: normalizedRequest.provider,
          server: normalizedRequest.server,
          message: error instanceof Error ? error.message : "Unable to refresh watch session.",
        });
        setPlaybackMessage(error instanceof Error ? error.message : "Unable to refresh watch session.");
        setIsSessionLoading(false);
        setOptimisticServerId(null); // revert optimistic on error
      })
      .finally(() => undefined);
  };

  const handlePlaybackError = () => {
    if (isSessionLoading) return;

    const activeServerId = pendingSession?.activeServerId || session.activeServerId;
    const language = session.dubbed ? "dub" : "sub";
    const activeServer = session.serverOptions.find((entry) => entry.id === activeServerId);
    const failedKey = activeServerId
      ? `${session.anime.id}|${session.episode.number}|${language}|${activeServerId}`
      : null;
    if (failedKey) failedServerIdsRef.current.add(failedKey);

    const scraperCandidates = session.serverOptions.filter((entry) => {
      const sameLanguage = language === "dub"
        ? entry.category === "dub"
        : entry.category === "sub" || !entry.category;
      const failedCandidateKey = `${session.anime.id}|${session.episode.number}|${language}|${entry.id}`;
      const sameSubMode = language === "dub" || !activeServer?.subType || entry.subType === activeServer.subType;
      return sameLanguage &&
        sameSubMode &&
        entry.id !== activeServerId &&
        !failedServerIdsRef.current.has(failedCandidateKey) &&
        !isEmbedServerOption(entry.id);
    });

    const currentIndex = scraperCandidates.findIndex((entry) => entry.id === activeServerId);
    const orderedCandidates =
      currentIndex >= 0
        ? [...scraperCandidates.slice(currentIndex + 1), ...scraperCandidates.slice(0, currentIndex)]
        : scraperCandidates;
    const next = orderedCandidates[0];

    if (!next) {
      watchDebug("playback_error.no_scraper_candidate", {
        provider: session.provider,
        activeServerId,
        language,
        subType: activeServer?.subType || "any",
      });
      setPlaybackMessage(
        activeServer?.subType === "hard"
          ? "All internal hard-sub servers failed. Try an embed server or another audio mode."
          : "All internal servers for this mode failed. Try an embed server or another audio mode.",
      );
      return;
    }

    watchDebug("playback_error.try_next_scraper", {
      failedProvider: session.provider,
      failedServer: activeServerId,
      nextProvider: next.provider,
      nextServer: next.id,
      nextLabel: next.label,
      nextTransport: next.transport || "unknown",
    });

    setPlaybackMessage(`${activeServer?.subType === "hard" ? "Hard-sub" : "Stream"} failed. Trying ${next.label}...`);
    queueSession({
      episodeNumber: session.episode.number,
      provider: next.provider,
      server: next.id,
      dubbed: session.dubbed,
    });
  };

  useEffect(() => {
    failedServerIdsRef.current.clear();
  }, [session.anime.id, session.episode.number, session.dubbed]);

  const prefetchEpisode = (episodeNumber: number) => {
    if (episodeNumber === session.episode.number) return;
    const prefetchKey = [session.anime.id, session.provider, session.dubbed ? "dub" : "sub", episodeNumber].join("|");
    if (hoverPrefetchKeyRef.current === prefetchKey) return;

    if (hoverPrefetchTimerRef.current) {
      clearTimeout(hoverPrefetchTimerRef.current);
    }

    hoverPrefetchKeyRef.current = prefetchKey;
    hoverPrefetchTimerRef.current = setTimeout(() => {
      hoverPrefetchTimerRef.current = null;
      hoverPrefetchKeyRef.current = null;
      prefetchWatchSession(session.anime.id, {
        episodeNumber,
        provider: session.provider,
        dubbed: session.dubbed,
        server: null,
      });
    }, 220);
  };

  /* ── Episode navigation ──────────────────────── */
  const currentEpisodeIndex = languageFilteredEpisodes.findIndex((episode) => episode.number === session.episode.number);
  const previousEpisode = currentEpisodeIndex > 0 ? languageFilteredEpisodes[currentEpisodeIndex - 1] : null;
  const nextEpisode =
    currentEpisodeIndex >= 0 && currentEpisodeIndex < languageFilteredEpisodes.length - 1
      ? languageFilteredEpisodes[currentEpisodeIndex + 1]
      : null;
  const nextEpisodeNumber = nextEpisode?.number ?? null;

  /* ── Intent-based next-episode prefetch ────────────
     Fires once the current embed has loaded (user is watching).
     This replaces the old timer=0 approach with an intent signal:
     the embed finishing its load means the user committed to this episode. */
  useEffect(() => {
    if (!activeEmbedLoaded || isSessionLoading || nextEpisodeNumber === null) {
      return;
    }

    // Prefetch next episode immediately after embed loads (fire-and-forget)
    prefetchWatchSession(session.anime.id, {
      episodeNumber: nextEpisodeNumber,
      provider: session.provider,
      dubbed: session.dubbed,
      server: null,
    });
  }, [
    activeEmbedLoaded,
    isSessionLoading,
    nextEpisodeNumber,
    session.anime.id,
    session.dubbed,
    session.provider,
  ]);

  /* ── Near-end playback prefetch ────────────────────
     Listen for postMessage from embed iframes reporting playback progress.
     When progress >= 85%, prefetch the next episode.
     This is fire-and-forget — must NOT affect current playback.
     Trigger once per episode to avoid spamming. */
  useEffect(() => {
    if (!nextEpisodeNumber) return;

    const nearEndKey = `${session.anime.id}|${session.episode.number}|${nextEpisodeNumber}`;

    const handleMessage = (event: MessageEvent) => {
      // Validate message shape — many embed players post progress data
      if (!event.data || typeof event.data !== "object") return;
      const progress = event.data.progress ?? event.data.percent ?? event.data.percentComplete;
      if (typeof progress !== "number" || progress < 0.85) return;

      // Only trigger once per episode viewing
      if (nearEndPrefetchedRef.current === nearEndKey) return;
      nearEndPrefetchedRef.current = nearEndKey;

      prefetchWatchSession(session.anime.id, {
        episodeNumber: nextEpisodeNumber,
        provider: session.provider,
        dubbed: session.dubbed,
        server: null,
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    nextEpisodeNumber,
    session.anime.id,
    session.episode.number,
    session.dubbed,
    session.provider,
  ]);

  // Reset near-end tracking when episode changes
  useEffect(() => {
    nearEndPrefetchedRef.current = null;
  }, [session.episode.number]);

  /* ── Background Source Resolve ───────────────── */
  useEffect(() => {
    if (!session.stale) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let attempts = 0;
    const requestSeq = ++sessionRequestSeqRef.current;
    const delays = [0, 1500, 3000, 5000, 5000];

    const resolve = async () => {
      const delay = delays[Math.min(attempts, delays.length - 1)];
      attempts++;

      timeoutId = setTimeout(async () => {
        try {
          const nextSession = await resolveCurrentSource({
            episodeNumber: session.episode.number,
            provider: session.provider,
            dubbed: session.dubbed,
            server: session.activeServerId,
          });
          if (!cancelled && sessionRequestSeqRef.current === requestSeq) commitSession(nextSession);
        } catch (error) {
          if (cancelled || sessionRequestSeqRef.current !== requestSeq) return;
          setPlaybackMessage(error instanceof Error ? error.message : "Failed to poll watch session");
          if (attempts < delays.length) {
            resolve();
          } else {
            commitSession({
              ...session,
              stale: false,
              fallback: false,
              message: error instanceof Error ? error.message : "Failed to resolve stream source.",
              fallbackHistory: ["Resolve source failed after multiple attempts"],
            });
          }
        }
      }, delay);
    };

    resolve();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [session.stale, session.anime.id, session.episode.number, session.provider, session.dubbed, session.activeServerId]);

  /* ── Server buttons helper ───────────────────── */
  // Priority: optimistic click → pending staged session → committed session
  const effectiveActiveServerId = optimisticServerId || pendingSession?.activeServerId || session.activeServerId;
  const activeIsEmbedServer = Boolean(effectiveActiveServerId && isEmbedServerOption(effectiveActiveServerId));
  const embedServersOpen = showEmbedServers || activeIsEmbedServer;
  const { isDesidub, subServers, softSubServers, hardSubServers, dubServers, hindiServers } = summarizeServerGroups(session.serverOptions);
  const effectiveActiveServer = session.serverOptions.find((entry) => entry.id === effectiveActiveServerId);
  const activeHasSoftSubtitles = !session.dubbed && session.subtitles.some((track) => Boolean(track.url));
  const activeIsHardSub = !activeHasSoftSubtitles && (
    effectiveActiveServer?.subType === "hard" ||
    effectiveActiveServerId === "hls-hardsub" ||
    (effectiveActiveServerId?.endsWith("-hard") ?? false)
  );
  const mainFallback = session.availableProviders.find((p) => p !== "desidub") || "animekai";
  const showHindi = session.availableProviders.includes("desidub") || session.provider === "desidub";


  const heroImage =
    session.anime.banner ||
    session.anime.poster ||
    "https://placehold.co/1600x900/09090b/f5f5f5?text=Tatakai";
  const playerPosterImage = getEpisodeArtworkUrl(session.episode.image, session.anime);
  const activatePlayer = () => {
    userActivatedPlayerRef.current = true;
    setLoadedSurfaceKey(null);
    setPlayerActivated(true);
  };
  const isSessionTransitioning = isSessionLoading;
  const playerFeedbackTitle = activeEmbedLoaded ? "Player ready" : "Opening player";
  const playerFeedbackHint = isSessionTransitioning
    ? "Loading the next session…"
    : "Opening the player…";

  const filteredEpisodes = useMemo(() => languageFilteredEpisodes.filter((episode) => {
    const query = episodeQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      String(episode.number).includes(query) ||
      episode.title.toLowerCase().includes(query)
    );
  }), [episodeQuery, languageFilteredEpisodes]);

  useEffect(() => {
    if (episodeQuery.trim()) {
      setEpisodeRangeStart(0);
      return;
    }

    const activeIndex = filteredEpisodes.findIndex((episode) => episode.number === session.episode.number);
    const nextRangeStart = Math.floor(Math.max(0, activeIndex) / EPISODE_PAGE_SIZE) * EPISODE_PAGE_SIZE;
    setEpisodeRangeStart(nextRangeStart);
  }, [episodeQuery, filteredEpisodes, session.episode.number]);

  const episodeRangeCount = Math.ceil(filteredEpisodes.length / EPISODE_PAGE_SIZE);
  const visibleEpisodes = episodeQuery.trim()
    ? filteredEpisodes
    : filteredEpisodes.slice(episodeRangeStart, episodeRangeStart + EPISODE_PAGE_SIZE);

  const goToEpisode = (num: number) => {
    queueSession({
      episodeNumber: num,
      provider: session.provider,
      dubbed: session.dubbed,
      server: null,
    });
  };

  const internalHardSubServers = hardSubServers.filter((entry) => !isEmbedServerOption(entry.id));
  const internalSoftSubServers = softSubServers.filter((entry) => !isEmbedServerOption(entry.id));
  const internalDubServers = dubServers.filter((entry) => !isEmbedServerOption(entry.id));
  const externalSubServers = subServers.filter((entry) => isEmbedServerOption(entry.id));
  const externalDubServers = dubServers.filter((entry) => isEmbedServerOption(entry.id));
  const internalServerCount = internalHardSubServers.length + internalSoftSubServers.length + internalDubServers.length;
  const externalServerCount = externalSubServers.length + externalDubServers.length;

  const renderServerRow = (
    label: string,
    entries: ServerOption[],
    options: { dubbed?: boolean; provider?: ProviderId; emptyLabel?: string; accent?: string } = {},
  ) => {
    if (entries.length === 0 && !options.emptyLabel) return null;
    return (
      <div className="grid gap-2 sm:grid-cols-[92px_1fr] sm:items-center">
        <span className="text-[11px] font-bold text-white/45 sm:text-right">{label}:</span>
        <div className="flex flex-wrap gap-2">
          {entries.length > 0 ? entries.map((entry) => {
            const isEmbedEntry = isEmbedServerOption(entry.id);
            const transportTag = isEmbedEntry
              ? "Embed"
              : entry.transport === "mp4"
                ? "MP4"
                : "HLS";
            return (
              <ServerButton
                key={entry.id}
                label={entry.label}
                subType={isEmbedEntry ? undefined : entry.subType}
                tag={transportTag}
                accentColor={options.accent || accentColor}
                active={Boolean(
                  effectiveActiveServerId === entry.id &&
                  (options.provider === "desidub"
                    ? isDesidub
                    : Boolean(options.dubbed) === Boolean(session.dubbed) && (!options.dubbed || !isDesidub))
                )}
                onClick={() => queueSession({
                  episodeNumber: session.episode.number,
                  provider: options.provider || entry.provider,
                  server: entry.id,
                  dubbed: Boolean(options.dubbed),
                })}
              />
            );
          }) : (
            <ServerButton
              label={options.emptyLabel || "Try another source"}
              active={false}
              accentColor={options.accent || accentColor}
              onClick={() => queueSession({
                episodeNumber: session.episode.number,
                provider: options.provider || mainFallback,
                server: null,
                dubbed: Boolean(options.dubbed),
              })}
            />
          )}
        </div>
      </div>
    );
  };

  const episodePanel = (
    <div className="watch-episode-panel overflow-hidden rounded-2xl border border-white/10 bg-[#0f1012]">
      <div className="border-b border-white/5 px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Episodes</h2>
            <p className="mt-0.5 text-[11px] text-white/35">
              Playing Episode {session.episode.number}
              {session.episode.title && session.episode.title !== `Episode ${session.episode.number}` ? ` · ${session.episode.title}` : ""}
            </p>
          </div>
          <span className="text-[10px] font-bold text-white/45 bg-white/5 px-2 py-1 rounded-full shrink-0">
            {languageFilteredEpisodes.length}
          </span>
        </div>

        {nextEpisode ? (
          <button
            type="button"
            onClick={() => goToEpisode(nextEpisode.number)}
            onMouseEnter={() => prefetchEpisode(nextEpisode.number)}
            onFocus={() => prefetchEpisode(nextEpisode.number)}
            className="w-full rounded-xl border px-3 py-2.5 text-left transition-all hover:brightness-110"
            style={{ background: accentStyle(0.1), borderColor: accentStyle(0.28) }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
                Next Episode
              </span>
              <ChevronRight className="h-4 w-4" style={{ color: accentColor }} aria-hidden="true" />
            </div>
            <p className="mt-1 text-sm font-bold text-white">
              EP {nextEpisode.number}
              {nextEpisode.title && nextEpisode.title !== `Episode ${nextEpisode.number}` ? ` · ${nextEpisode.title}` : ""}
            </p>
          </button>
        ) : (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Latest available episode</p>
            <p className="mt-1 text-sm font-bold text-white">You are caught up</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {episodeRangeCount > 1 && !episodeQuery.trim() ? (
            <label className="relative shrink-0">
              <span className="sr-only">Episode range</span>
              <select
                value={episodeRangeStart}
                onChange={(event) => setEpisodeRangeStart(Number(event.target.value))}
                className="h-10 appearance-none rounded-xl border border-white/8 bg-white/[0.04] py-2 pl-3 pr-8 text-[11px] font-bold text-white/70 outline-none transition-colors hover:border-white/15 focus:border-white/20"
                aria-label="Episode range"
              >
                {Array.from({ length: episodeRangeCount }, (_, index) => {
                  const start = index * EPISODE_PAGE_SIZE;
                  const first = filteredEpisodes[start]?.number ?? start + 1;
                  const last = filteredEpisodes[Math.min(start + EPISODE_PAGE_SIZE - 1, filteredEpisodes.length - 1)]?.number ?? first;
                  return <option key={start} value={start}>{first}-{last}</option>;
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" aria-hidden="true" />
            </label>
          ) : null}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" aria-hidden="true" />
            <input
              type="text"
              placeholder="Filter episodes..."
              value={episodeQuery}
              onChange={(e) => setEpisodeQuery(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/8 rounded-xl text-sm text-white/80 pl-9 pr-3 py-2.5 outline-none focus:border-white/18"
            />
          </div>
          <div className="flex h-10 overflow-hidden rounded-xl border border-white/8 bg-white/[0.03]">
            {([
              { view: "cards" as const, icon: Images, label: "Episode cards" },
              { view: "list" as const, icon: List, label: "Episode list" },
              { view: "grid" as const, icon: Grid3X3, label: "Episode grid" },
            ]).map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                type="button"
                onClick={() => setEpisodeView(view)}
                aria-label={label}
                aria-pressed={episodeView === view}
                className="inline-flex w-10 items-center justify-center border-l border-white/[0.06] text-white/35 transition-colors first:border-l-0 hover:text-white/75"
                style={episodeView === view ? { background: accentStyle(0.13), color: accentColor } : undefined}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="watch-episode-panel-body px-3 py-3">
        {filteredEpisodes.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-4">
            {`No episodes match "${episodeQuery}"`}
          </p>
        ) : episodeView === "cards" ? (
          <div className="watch-episode-scroll h-full space-y-2 overflow-y-auto pr-1 hide-scrollbar">
            {visibleEpisodes.map((episode, visibleIndex) => {
              const active = episode.number === session.episode.number;
              const watched = watchedEpisodes.has(episode.number);
              const episodeArtwork = getEpisodeArtworkUrl(episode.image, session.anime);
              const eagerArtwork = active || visibleIndex < 6;
              const airDate = formatEpisodeAirDate(episode.airDate);
              const description = normalizeEpisodeDescription(episode.description);
              const languageAvailability = resolveEpisodeLanguageAvailability(episode, {
                subCount,
                dubCount,
                hasAnySubEpisode: hasSubEpisode,
                hasSubFallback: hasSub,
                hasDubServerForCurrentEpisode: hasDubServer,
                currentEpisodeNumber: session.episode.number,
              });
              return (
                <button
                  key={episode.number}
                  type="button"
                  onClick={() => goToEpisode(episode.number)}
                  onMouseEnter={() => prefetchEpisode(episode.number)}
                  onFocus={() => prefetchEpisode(episode.number)}
                  data-active-episode={active ? "true" : undefined}
                  className="group/episode relative flex h-[100px] w-full gap-0 overflow-hidden rounded-[11px] border text-left transition-colors"
                  style={active
                    ? { borderColor: accentStyle(0.95), background: accentStyle(0.68) }
                    : { borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
                >
                  {episodeArtwork ? (
                    <div className="relative h-full w-[42%] shrink-0 overflow-hidden rounded-[10px] bg-black">
                      <SafeWatchImage
                        src={episodeArtwork}
                        fill
                        priority={eagerArtwork}
                        loading={eagerArtwork ? "eager" : "lazy"}
                        fetchPriority={eagerArtwork ? "high" : "auto"}
                        quality={90}
                        sizes="(min-width: 1280px) 160px, 38vw"
                        unoptimized
                        className="object-cover transition-transform duration-300 group-hover/episode:scale-[1.025]"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[9px] font-black text-white">
                        EP {episode.number}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col px-2 py-2">
                    <p className="line-clamp-1 text-[12px] font-bold leading-4 text-white/85 group-hover/episode:text-white">
                      {episode.title}
                    </p>
                    {description ? (
                      <p className={`mt-0.5 line-clamp-3 text-[10px] leading-[12px] ${active ? "text-white/72" : "text-white/38"}`}>
                        {description}
                      </p>
                    ) : null}
                    <div className={`mt-auto flex items-center gap-1.5 pt-1 text-white/38 ${active ? "text-white/78" : ""}`}>
                      {languageAvailability.subbed ? (
                        <span
                          title="Subtitles available"
                          aria-label="Subtitles available"
                          className={`inline-flex h-3.5 min-w-4 items-center justify-center rounded-[3px] px-0.5 text-[7px] font-black leading-none ${active ? "bg-white/85 text-black/75" : "bg-white/55 text-black/80"}`}
                        >
                          CC
                        </span>
                      ) : null}
                      {languageAvailability.dubbed ? (
                        <span title="Dub available" aria-label="Dub available">
                          <EpisodeMicIcon className={`h-3.5 w-3.5 ${active ? "text-white/90" : "text-white/60"}`} />
                        </span>
                      ) : null}
                      {watched ? <span className="text-[8px] font-black uppercase text-white/28">Watched</span> : null}
                      {airDate ? <time dateTime={episode.airDate || undefined} className={`ml-auto text-[9px] font-medium ${active ? "text-white/85" : "text-white/32"}`}>{airDate}</time> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : episodeView === "list" ? (
          <div
            className="watch-episode-scroll h-full overflow-y-auto hide-scrollbar -mx-3"
            ref={(el) => {
              if (el) {
                const active = el.querySelector('[data-active-episode="true"]');
                if (active instanceof HTMLElement) {
                  el.scrollTop = Math.max(0, active.offsetTop - (el.clientHeight - active.offsetHeight) / 2);
                }
              }
            }}
          >
            {visibleEpisodes.map((episode) => {
              const active = episode.number === session.episode.number;
              const watched = watchedEpisodes.has(episode.number);
              return (
                <button
                  key={episode.number}
                  type="button"
                  onClick={() => goToEpisode(episode.number)}
                  onMouseEnter={() => prefetchEpisode(episode.number)}
                  onFocus={() => prefetchEpisode(episode.number)}
                  data-active-episode={active ? "true" : undefined}
                  className={`group/ep w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all border-b border-white/[0.03] last:border-0 ${
                    active
                      ? "border-l-2"
                      : watched
                        ? "border-l-2 border-l-emerald-500/30 hover:bg-white/[0.03]"
                        : "hover:bg-white/[0.03]"
                  }`}
                  style={active ? { background: accentStyle(0.08), borderLeftColor: accentColor } : undefined}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    active ? "text-white" : watched ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20" : "bg-white/5 text-white/50"
                  }`} style={active ? { backgroundColor: accentColor } : undefined}>
                    {watched && !active ? "✓" : episode.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate leading-snug ${
                      active ? "text-white" : watched ? "text-white/50 group-hover/ep:text-white/80" : "text-white/80 group-hover/ep:text-white"
                    }`}>
                      {episode.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {episode.isSubbed && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: accentStyle(0.1), color: accentColor }}>Sub</span>}
                      {episode.isDubbed && <span className="text-[9px] font-bold uppercase bg-[#4ade80]/10 text-[#4ade80] px-1.5 py-0.5 rounded">Dub</span>}
                      {watched && !active && <span className="text-[9px] font-bold uppercase text-emerald-400/50">Watched</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EpisodeNumberGrid
            episodes={visibleEpisodes}
            activeNumber={session.episode.number}
            onSelect={goToEpisode}
            onHover={prefetchEpisode}
            watchedSet={watchedEpisodes}
            accentColor={accentColor}
          />
        )}
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════ */
  return (
    <>
      {/* Focus mode backdrop */}
      {focusMode && (
        <div
          className="fixed inset-0 bg-black/90 z-40 cursor-pointer animate-in fade-in duration-300"
          onClick={() => setFocusMode(false)}
        />
      )}
    <div className={`space-y-0 ${focusMode ? "relative z-50" : ""}`}>
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
      {/* ── VIDEO PLAYER ────────────────────────── */}
      <div className="relative overflow-hidden border-y border-white/10 bg-black sm:rounded-t-2xl sm:border-x sm:border-b-0">
        <div className="relative aspect-video overflow-hidden bg-black">
          {!playerActivated && (embedAvailable || session.stale) ? (
            <button
              type="button"
              onClick={activatePlayer}
              aria-label={`Play Episode ${session.episode.number}`}
              className="group absolute inset-0 z-10 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
            >
              {playerPosterImage ? (
                <SafeWatchImage
                  key={playerPosterImage}
                  src={playerPosterImage}
                  fill
                  priority
                  fetchPriority="high"
                  quality={90}
                  sizes="(min-width: 1280px) calc(100vw - 440px), 100vw"
                  unoptimized
                  className="object-cover"
                />
              ) : null}
              <span
                className="absolute left-1/2 top-1/2 inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white text-black shadow-[0_16px_50px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-110 sm:h-20 sm:w-20"
              >
                <Play className="h-7 w-7 translate-x-0.5 fill-current sm:h-8 sm:w-8" aria-hidden="true" />
              </span>
              <span className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-4 sm:inset-x-6 sm:bottom-6">
                <span className="drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]">
                  <span className="block text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: accentColor }}>
                    Ready to watch
                  </span>
                  <span className="mt-1 block text-sm font-bold text-white sm:text-base">
                    Episode {session.episode.number}{session.episode.title !== `Episode ${session.episode.number}` ? ` · ${session.episode.title}` : ""}
                  </span>
                </span>
                {!embedAvailable && session.stale ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/65 backdrop-blur-md">
                    <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: accentColor }} />
                    Servers loading
                  </span>
                ) : null}
              </span>
            </button>
          ) : null}

          {/* Custom AnimePlayer — handles both HLS and iframe modes */}
          {playerActivated && session.source && (
            <div className="absolute inset-0 transition-opacity duration-300 opacity-100 bg-black">
              <VideoPlayer
                key={activePlayerSurfaceKey}
                source={session.source}
                subtitles={session.subtitles}
                malId={session.anime.malId}
                episodeNumber={session.episode.number}
                dubbed={session.dubbed}
                intro={session.intro}
                outro={session.outro}
                autoSkip={autoSkip}
                autoPlay
                isHardSubStream={activeIsHardSub}
                onReady={() => setLoadedSurfaceKey(activePlayerSurfaceKey)}
                onEpisodeEnd={() => {
                  if (autoAdvance && nextEpisode) {
                    queueSession({
                      episodeNumber: nextEpisode.number,
                      provider: session.provider,
                      dubbed: session.dubbed,
                      server: null,
                    });
                  }
                }}
                onPlaybackError={handlePlaybackError}
              />
            </div>
          )}


          {!embedAvailable && session.stale && (
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/90 via-black/20 to-black/30 p-4 md:p-6">
              <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/55 px-3 py-2.5 backdrop-blur-sm">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20" style={{ borderTopColor: accentColor }} />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Episode {session.episode.number}: {session.episode.title}
                  </p>
                  <p className="text-xs text-white/50">Loading player</p>
                </div>
              </div>
            </div>
          )}

          {!embedAvailable && !session.stale && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0c]/95 px-8 text-center">
              <div className="rounded-full border border-white/10 bg-white/6 p-4" style={{ color: accentColor }}>
                <Tv2 className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">
                  {mappingUnavailable ? "Not available to watch yet" : embedOnlyBlocked ? "Embedded playback unavailable" : "No stream available"}
                </h2>
                <p className="max-w-md text-sm text-white/60">
                  {mappingUnavailable
                    ? "This title exists on AniList, but we do not have a working provider mapping for it yet."
                    : embedOnlyBlocked
                      ? "This source only returned a direct stream. Phase 1 is locked to embedded playback for stability, so try another provider or server."
                      : "The active provider did not return an embedded player. Try refreshing or switching providers."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {mappingUnavailable ? (
                  <Link
                    href={session.anime.href}
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-colors hover:brightness-110"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Info className="h-4 w-4" aria-hidden="true" />
                    Back to details
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => queueSession({ episodeNumber: session.episode.number, provider: session.provider, dubbed: session.dubbed, server: null })}
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-colors hover:brightness-110"
                    style={{ backgroundColor: accentColor }}
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    Refresh source
                  </button>
                )}
              </div>
            </div>
          )}

          {showPlayerFeedback && (
            <div className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300">
              <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
              <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.06),transparent)] opacity-70 animate-pulse" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute inset-x-4 bottom-4 md:inset-x-6 md:bottom-6 flex items-end justify-between gap-4">
                <div className="max-w-md space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">
                    <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: accentColor }} />
                    {playerFeedbackTitle}
                  </div>
                  <div>
                    <p className="text-white text-sm md:text-base font-semibold">
                      Episode {session.episode.number}: {session.episode.title}
                    </p>
                    <p className="text-white/55 text-xs md:text-sm">
                      {playerFeedbackHint}
                    </p>
                  </div>
                </div>
                <div className="hidden md:flex flex-col items-end gap-2">
                  <div className="h-2 w-24 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-full animate-[bufferBar_1.8s_ease-in-out_infinite]" style={{ background: `linear-gradient(to right, ${accentColor}, ${accentStyle(0.7)}, ${accentColor})` }} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/35">
                    Tatakai
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {pendingSession && pendingEmbedUrl && (
          <div className="pointer-events-none absolute inset-0 opacity-0">
            <iframe
              key={sessionViewKey(pendingSession)}
              src={pendingEmbedUrl}
              className="h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              loading="eager"
              aria-hidden="true"
              tabIndex={-1}
              title="Preloading embedded player"
              onLoad={() => handlePendingPlayerReady(sessionViewKey(pendingSession))}
            />
          </div>
        )}
      </div>

      {/* ── WATCH CONTROLS ───────────────────────── */}
      <div className="relative border-x border-white/10 bg-[#0d0e10] px-2 py-1 md:px-3">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex flex-wrap items-center gap-0.5">
            <WatchPreferenceToggle
              icon={Play}
              label="Autoplay"
              active={autoPlay}
              title="After your first click, automatically start the episodes you switch to"
              accentColor={accentColor}
              onToggle={() => {
                const next = !autoPlay;
                setAutoPlay(next);
                playerPrefs.setAutoplay(next);
              }}
            />
            <WatchPreferenceToggle
              icon={SkipForward}
              label="Auto Skip"
              active={autoSkip}
              disabled={!directAvailable}
              title={!directAvailable ? "This embed controls its own intro and outro skipping" : "Automatically skip detected intros and outros"}
              accentColor={accentColor}
              onToggle={() => {
                const next = !autoSkip;
                setAutoSkip(next);
                playerPrefs.setAutoSkip(next);
              }}
            />
            <WatchPreferenceToggle
              icon={ChevronRight}
              label="Auto Next"
              active={autoAdvance}
              accentColor={accentColor}
              onToggle={() => {
                const next = !autoAdvance;
                setAutoAdvance(next);
                playerPrefs.setAutoAdvance(next);
              }}
            />
            <button
              type="button"
              onClick={() => setShowShortcuts((value) => !value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/80"
              style={showShortcuts ? { color: accentColor } : undefined}
            >
              <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
              Shortcuts
            </button>
            <ControlBtn
              icon={focusMode ? Minimize2 : Lightbulb}
              label={focusMode ? "Lights On" : "Lights Off"}
              active={focusMode}
              accent={focusMode}
              accentColor={accentColor}
              onClick={() => setFocusMode((value) => !value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-0.5">
            <ControlBtn
              icon={ChevronLeft}
              label="Prev"
              disabled={!previousEpisode}
              onClick={() => previousEpisode && goToEpisode(previousEpisode.number)}
            />
            <ControlBtn
              icon={ChevronRight}
              label="Next"
              disabled={!nextEpisode}
              onClick={() => nextEpisode && goToEpisode(nextEpisode.number)}
            />
            <div className="w-px h-5 bg-white/8 mx-1 hidden sm:block" />
            <ControlBtn
              icon={isBookmarked ? BookmarkCheck : Bookmark}
              label={isBookmarked ? "Bookmarked" : "Bookmark"}
              active={isBookmarked}
              onClick={toggleBookmark}
              disabled={!bookmarkChecked}
            />
          </div>
        </div>
        {showShortcuts ? (
          <div className="absolute bottom-full left-2 z-30 mb-2 grid min-w-64 grid-cols-2 gap-x-5 gap-y-2 rounded-xl border border-white/10 bg-[#111216]/95 p-3 text-[11px] text-white/55 shadow-2xl backdrop-blur-xl">
            <span><kbd className="text-white/90">Space</kbd> Play / pause</span>
            <span><kbd className="text-white/90">F</kbd> Fullscreen</span>
            <span><kbd className="text-white/90">← / →</kbd> Seek 10s</span>
            <span><kbd className="text-white/90">M</kbd> Mute</span>
          </div>
        ) : null}
      </div>

      {/* ── EPISODE INFO + SERVER STRIP ─────────── */}
      <div className="relative space-y-3 border-x border-b border-white/10 bg-[#131315] px-4 py-3 sm:rounded-b-2xl md:px-5">
        {/* Top row: episode info + sub/dub/server */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white text-sm font-medium">
              You are watching <strong>Episode {session.episode.number}</strong>
            </span>
            {session.episode.title && session.episode.title !== `Episode ${session.episode.number}` && (
              <span className="text-white/40 text-xs hidden lg:inline">— {session.episode.title}</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sub/Dub/Hindi mode toggle buttons */}
            <button
              type="button"
              disabled={(!session.dubbed && session.provider !== "desidub") || !hasSub}
              aria-pressed={!session.dubbed && session.provider !== "desidub"}
              onClick={() => {
                if ((session.dubbed || session.provider === "desidub") && hasSub) {
                  const targetEpNum = getFallbackEpisodeForLanguage(false, session.episode.number);
                  queueSession({ episodeNumber: targetEpNum, provider: session.provider === "desidub" ? mainFallback : session.provider, server: null, dubbed: false });
                }
              }}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                !session.dubbed && session.provider !== "desidub"
                  ? "cursor-default pointer-events-none"
                  : !hasSub
                    ? "opacity-30 cursor-not-allowed bg-white/5 text-white/30 border border-white/5"
                    : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70 cursor-pointer"
              }`}
              style={!session.dubbed && session.provider !== "desidub" ? { background: accentStyle(0.15), color: accentColor, border: `1px solid ${accentStyle(0.25)}`, boxShadow: `0 0 8px ${accentStyle(0.15)}` } : undefined}
            >
              <Captions className="w-3 h-3" aria-hidden="true" />
              Sub
            </button>
            <button
              type="button"
              disabled={(session.dubbed && session.provider !== "desidub") || !hasDub}
              aria-pressed={session.dubbed && session.provider !== "desidub"}
              onClick={() => {
                if ((!session.dubbed || session.provider === "desidub") && hasDub) {
                  const targetEpNum = getFallbackEpisodeForLanguage(true, session.episode.number);
                  queueSession({ episodeNumber: targetEpNum, provider: session.provider === "desidub" ? mainFallback : session.provider, server: null, dubbed: true });
                }
              }}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                session.dubbed && session.provider !== "desidub"
                  ? "bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/25 shadow-[0_0_8px_rgba(74,222,128,0.15)] cursor-default pointer-events-none"
                  : !hasDub
                    ? "opacity-30 cursor-not-allowed bg-white/5 text-white/30 border border-white/5"
                    : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70 cursor-pointer"
              }`}
            >
              <Captions className="w-3 h-3" aria-hidden="true" />
              Dub
            </button>
            {showHindi && (
              <button
                type="button"
                disabled={session.provider === "desidub"}
                aria-pressed={session.provider === "desidub"}
                onClick={() => {
                  if (session.provider !== "desidub") {
                    const targetEpNum = getFallbackEpisodeForLanguage(true, session.episode.number);
                    queueSession({ episodeNumber: targetEpNum, provider: "desidub", server: null, dubbed: true });
                  }
                }}
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  session.provider === "desidub"
                    ? "bg-[#ff5500]/15 text-[#ff5500] border border-[#ff5500]/25 shadow-[0_0_8px_rgba(255,85,0,0.15)] cursor-default pointer-events-none"
                    : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70 cursor-pointer"
                }`}
              >
                <Captions className="w-3 h-3" aria-hidden="true" />
                Hindi
              </button>
            )}
          </div>
        </div>

        {/* Server panel — Anivexa-style grouping, AnimePlay theme */}
        <div className="space-y-4 border-y border-white/8 bg-black/20 py-3 md:py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wider"
              style={{ color: accentColor, borderColor: accentStyle(0.45), background: accentStyle(0.12) }}
            >
              <Tv2 className="h-3.5 w-3.5" aria-hidden="true" />
              Internal
              <span className="rounded-full px-2 py-0.5 text-[10px] text-white" style={{ background: accentStyle(0.35) }}>
                {internalServerCount}
              </span>
            </div>
            {externalServerCount > 0 && (
              <button
                type="button"
                onClick={() => setShowEmbedServers((value) => !value)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white/65 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                aria-expanded={embedServersOpen}
                aria-controls="embed-server-options"
                title="External embed servers"
                style={embedServersOpen ? { color: accentColor, borderColor: accentStyle(0.35), background: accentStyle(0.08) } : undefined}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Embed
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">
                  {externalServerCount}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${embedServersOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {renderServerRow("Hard Subs", internalHardSubServers)}
            {renderServerRow("Soft Subs", internalSoftSubServers)}
            {hasDub && renderServerRow("Dub", internalDubServers, { dubbed: true, accent: "#4ade80" })}
            {showHindi && renderServerRow("Hindi", hindiServers, { dubbed: true, provider: "desidub", accent: "#ff5500" })}
          </div>

          {externalServerCount > 0 && embedServersOpen && (
            <div id="embed-server-options" className="space-y-3 border-t border-white/[0.06] pt-3">
              {renderServerRow("Sub Embeds", externalSubServers)}
              {hasDub && renderServerRow("Dub Embeds", externalDubServers, { dubbed: true, accent: "#4ade80" })}
            </div>
          )}
        </div>

        {/* Playback message */}
        {playbackMessage && (
          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p>{playbackMessage}</p>
            </div>
          </div>
        )}

        {/* Report / Refresh stream */}
        <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
          <p className="text-[10px] text-white/25">
            {reportStatus === "sent"
              ? "✓ Stream reported — refreshing in background"
              : reportStatus === "error"
                ? "⚠ Report failed — please try again"
                : "Stream not working?"}
          </p>
          <button
            id="report-stream-btn"
            type="button"
            disabled={reportStatus === "sending" || reportStatus === "sent"}
            onClick={async () => {
              if (reportStatus !== "idle" && reportStatus !== "error") return;
              setReportStatus("sending");
              try {
                const res = await fetch("/api/watch/report", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    anilistId: session.anime.anilistId,
                    episodeNumber: session.episode.number,
                    dubbed: session.dubbed,
                  }),
                });
                setReportStatus(res.ok ? "sent" : "error");
                if (res.ok) {
                  // Reset to idle after 8 seconds so user can report again if needed
                  setTimeout(() => setReportStatus("idle"), 8000);
                }
              } catch {
                setReportStatus("error");
              }
            }}
            className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded transition-all ${
              reportStatus === "sent"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 opacity-60 cursor-default"
                : reportStatus === "sending"
                  ? "bg-white/5 text-white/30 border border-white/8 cursor-wait"
                  : "bg-white/[0.04] text-white/40 border border-white/8 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/[0.06]"
            }`}
          >
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            {reportStatus === "sending" ? "Reporting…" : reportStatus === "sent" ? "Reported" : "Report stream"}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <div className="hidden xl:block space-y-5">
          <WatchAnimeDetailsPanel session={session} heroImage={heroImage} detail={deferredDetail} />

          {deferredSeasons !== null && deferredSeasons.length <= 1 ? (
            <SeasonRail seasons={session.seasons} activeHref={session.anime.href} accentColor={accentColor} />
          ) : null}

          <CommentSection
            animeId={session.anime.id}
            episodeNumber={session.episode.number}
            currentUserId={resolvedCurrentUserId}
            onTimestampClick={() => {
              document.querySelector("iframe")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </div>

        <div className="space-y-5 xl:hidden">
          {episodePanel}

          <CommentSection
            animeId={session.anime.id}
            episodeNumber={session.episode.number}
            currentUserId={resolvedCurrentUserId}
            onTimestampClick={() => {
              document.querySelector("iframe")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />

          <WatchAnimeDetailsPanel session={session} heroImage={heroImage} detail={deferredDetail} />

          {deferredSeasons !== null && deferredSeasons.length <= 1 ? (
            <SeasonRail seasons={session.seasons} activeHref={session.anime.href} accentColor={accentColor} />
          ) : null}

          <WatchRecommendationsPanel
            seasons={deferredSeasons}
            related={deferredRelated}
            recommendations={deferredRecommendations}
            accentColor={accentColor}
          />
        </div>
      </div>
        </div>

        <aside className="watch-sidebar-rail hidden space-y-4 xl:sticky xl:top-20 xl:block xl:h-[calc(100vh-5.5rem)] xl:min-h-0 xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:[scrollbar-gutter:stable]">
          {episodePanel}
          <WatchRecommendationsPanel
            seasons={deferredSeasons}
            related={deferredRelated}
            recommendations={deferredRecommendations}
            accentColor={accentColor}
            variant="sidebar"
          />
        </aside>
      </div>
    </div>
    </>
  );
}
