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
import type { AnilistMedia } from "@/lib/anilist/api";
import { humanizeProviderId } from "@/lib/anime/utils";
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
  Eye,
  Info,
  LoaderCircle,
  Minimize2,
  RefreshCcw,
  Search,
  Tv2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

interface WatchExperienceProps {
  initialSession: WatchSessionModel;
  recommendations?: AnilistMedia[] | null;
  currentUserId?: string | null;
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
  return Boolean(session.source?.proxiedUrl || session.source?.url);
}

/* ── Client-side instant episode switching for custom embeds ──────────────
   When the user switches episodes on a custom embed server (megaplay,
   animeplay, etc.) we can build the new session entirely client-side:
   just swap the episode number in the iframe URL and update the episode
   metadata. This avoids the full /api/watch-session round-trip (500-2000ms)
   making episode switching feel instant. */

const CUSTOM_EMBED_BASES = ["megaplay", "animeplay", "tryembed", "mostream"] as const;

function isCustomEmbedServer(serverId: string | null): boolean {
  if (!serverId) return false;
  const base = serverId.split("-")[0];
  return CUSTOM_EMBED_BASES.some((b) => base === b);
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
let prefetchStats = { fired: 0, used: 0, skippedBudget: 0, skippedCached: 0 };

/** Call from dev tools: (window as any).__prefetchStats?.() */
if (typeof window !== "undefined") {
  (window as any).__prefetchStats = () => ({ ...prefetchStats });
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
    left.category === right.category
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
  const serverOptions = sameServerOptionList(previous.serverOptions, next.serverOptions)
    ? previous.serverOptions
    : next.serverOptions;
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
export default function WatchExperience({ initialSession, recommendations = null, currentUserId }: WatchExperienceProps) {
  const initialRecommendations = recommendations ?? null;
  const [session, setSession] = useState(initialSession);
  const [isPending, startTransition] = useTransition();
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(initialSession.message || null);
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  // Sub-type filter for the server panel: "soft" = VTT overlay, "hard" = burnt-in subs
  const [subTypeFilter, setSubTypeFilter] = useState<"soft" | "hard">("soft");
  const [loadedSurfaceKey, setLoadedSurfaceKey] = useState<string | null>(null);
  // Optimistic server selection: turns the button green immediately on click
  // before the embed has finished loading. Cleared when the session commits.
  const [optimisticServerId, setOptimisticServerId] = useState<string | null>(null);
  const pendingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPrefetchKeyRef = useRef<string | null>(null);
  const pendingSessionKeyRef = useRef<string | null>(null);
  const nearEndPrefetchedRef = useRef<string | null>(null);
  const [deferredRecommendations, setDeferredRecommendations] = useState<AnilistMedia[] | null>(initialRecommendations);
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
  const pendingEmbedUrl = pendingSession?.source?.iframeUrl || null;
  const animeGenresKey = session.anime.genres.join("|");
  const playerType = directAvailable ? "hls" : "iframe";
  const activePlayerSurfaceKey = [
    session.anime.id,
    session.episode.number,
    playerType,
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

  const hasLanguageInfo = session.episodes.some(
    (ep) => ep.isSubbed !== undefined || ep.isDubbed !== undefined
  );

  // ── Language availability ──────────────────────────────────────────────────
  // Episodes are synthetic (from AniList) with no isDubbed/isSubbed flags.
  // We get accurate sub/dub episode counts from the Anikoto API (same library
  // as MegaPlay). When dubCount is set, we cap the episode list in dub mode
  // so users only see episodes that actually have dub available.
  const canUseEmbed = Boolean(session.anime.anilistId || session.anime.malId);
  const { dubCount, subCount } = session.anime;
  // hasDub: only true when we have CONFIRMED dub availability.
  // - Anikoto reports dubCount > 0 → dub exists, show button
  // - dubCount is 0 → no dub, hide button
  // - dubCount is null (anime not in Anikoto) → don't assume dub exists, hide button
  // - Any episode has isDubbed flag → show button (real scraped data)
  const hasDub = (dubCount != null && dubCount > 0) || session.episodes.some((ep) => ep.isDubbed);
  const hasSub = canUseEmbed || session.episodes.some((ep) => ep.isSubbed);

  // Cap episode list by dubCount when in dub mode (for synthetic episodes).
  // If dubCount is null (anime not found in Anikoto), show all episodes.
  const languageFilteredEpisodes = session.episodes.filter((episode) => {
    if (!hasLanguageInfo) {
      // Synthetic episodes (embed route): use Anikoto dubCount to cap
      if (session.dubbed && dubCount !== null && dubCount !== undefined) {
        return episode.number <= dubCount;
      }
      if (!session.dubbed && subCount !== null && subCount !== undefined) {
        return episode.number <= subCount;
      }
      return true; // no count data → show all
    }
    if (session.dubbed) return episode.isDubbed ?? false;
    return episode.isSubbed ?? true;
  });

  // Whether the dub count is known (from Anikoto) or unknown
  const dubCountKnown = dubCount !== null && dubCount !== undefined;

  const getFallbackEpisodeForLanguage = (targetDubbed: boolean, currentEpNum: number) => {
    // For embed routes, use dubCount/subCount to determine the max available episode
    if (!hasLanguageInfo) {
      const maxEp = targetDubbed
        ? (dubCountKnown ? dubCount! : Infinity)
        : (subCount !== null && subCount !== undefined ? subCount : Infinity);
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
  const showPlayerFeedback = isSessionLoading || isPending || (embedAvailable && !activeEmbedLoaded);

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
          recommendations?: AnilistMedia[];
        }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setDeferredRecommendations(payload.recommendations ?? []);
        setResolvedCurrentUserId(payload.currentUserId ?? null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
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
    return loadWatchSession(session.anime.id, request);
  };

  const clearPendingCommit = () => {
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
  };

  const commitSession = (nextSession: WatchSessionModel) => {
    clearPendingCommit();
    pendingSessionKeyRef.current = null;
    setPendingSession(null);
    setIsSessionLoading(false);
    setOptimisticServerId(null); // real server id is now in session — clear optimistic

    startTransition(() => {
      setSession((previous) => mergeWatchSessions(previous, nextSession));
      setPlaybackMessage(nextSession.message || null);
    });
  };

  const stageOrCommitSession = (nextSession: WatchSessionModel) => {
    if (!nextSession.source?.iframeUrl) {
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

  const applySession = async (request: SessionRequest): Promise<WatchSessionModel> => {
    // Fall back to server fetch
    const nextSession = await fetchSession(request);
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

    if (
      normalizedRequest.episodeNumber === session.episode.number &&
      normalizedRequest.provider === session.provider &&
      normalizedRequest.dubbed === session.dubbed &&
      (normalizedRequest.server ?? null) === (session.activeServerId ?? null)
    ) {
      return;
    }

    clearPendingCommit();
    if (hoverPrefetchTimerRef.current) {
      clearTimeout(hoverPrefetchTimerRef.current);
      hoverPrefetchTimerRef.current = null;
    }
    hoverPrefetchKeyRef.current = null;
    pendingSessionKeyRef.current = null;
    setPendingSession(null);

    // ⚡ Optimistic server selection — turn the button green immediately on click
    // so the user gets instant visual feedback that their selection was registered.
    // The actual embed will load behind it. Cleared in commitSession.
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

    // Otherwise, do a server-side load
    setIsSessionLoading(true);
    void applySession(normalizedRequest)
      .catch((error) => {
        setPlaybackMessage(error instanceof Error ? error.message : "Unable to refresh watch session.");
        setIsSessionLoading(false);
        setOptimisticServerId(null); // revert optimistic on error
      })
      .finally(() => undefined);
  };

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
    if (!activeEmbedLoaded || isSessionLoading || isPending || nextEpisodeNumber === null) {
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
    isPending,
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

  /* ── Background Resolve Polling ──────────────── */
  useEffect(() => {
    if (!session.stale) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const delays = [1000, 2000, 3000, 5000, 5000];

    const poll = async () => {
      const delay = delays[Math.min(attempts, delays.length - 1)];
      attempts++;
      
      timeoutId = setTimeout(async () => {
        try {
          const nextSession = await fetchSession({
            episodeNumber: session.episode.number,
            provider: session.provider,
            dubbed: session.dubbed,
            server: session.activeServerId,
          });
          
          if (nextSession.stale) {
            poll();
          } else {
            // Re-merge session to clear stale state and show video
            commitSession(nextSession);
          }
        } catch (error) {
          setPlaybackMessage(error instanceof Error ? error.message : "Failed to poll watch session");
        }
      }, delay);
    };

    poll();

    return () => clearTimeout(timeoutId);
  }, [session.stale, session.anime.id, session.episode.number, session.provider, session.dubbed, session.activeServerId]);


  const heroImage =
    session.anime.banner ||
    session.anime.poster ||
    "https://placehold.co/1600x900/09090b/f5f5f5?text=AnimeKAI";
  const isSessionTransitioning = isSessionLoading;

  const filteredEpisodes = languageFilteredEpisodes.filter((episode) => {
    const query = episodeQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      String(episode.number).includes(query) ||
      episode.title.toLowerCase().includes(query)
    );
  });

  const goToEpisode = (num: number) => {
    queueSession({
      episodeNumber: num,
      provider: session.provider,
      dubbed: session.dubbed,
      server: null,
    });
  };

  /* ── Server buttons helper ───────────────────── */
  // Priority: optimistic click → pending staged session → committed session
  const effectiveActiveServerId = optimisticServerId || pendingSession?.activeServerId || session.activeServerId;
  const { isDesidub, subServers, softSubServers, hardSubServers, dubServers, hindiServers } = summarizeServerGroups(session.serverOptions);
  const mainFallback = session.availableProviders.find((p) => p !== "desidub") || "animekai";
  const showHindi = session.availableProviders.includes("desidub") || session.provider === "desidub";
  const floatingStatus = isSessionTransitioning ? "Refreshing session…" : null;
  const playerFeedbackTitle = activeEmbedLoaded ? "Player ready" : "Opening player";
  const playerFeedbackHint = isSessionTransitioning
    ? "Loading the next session…"
    : "Opening the player…";

  /* ════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════ */
  return (
    <>
      <link rel="preconnect" href="https://megaplay.buzz" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://animeplay.cfd" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://tryembed.us.cc" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://mostream.us" crossOrigin="anonymous" />

      {/* Focus mode backdrop */}
      {focusMode && (
        <div
          className="fixed inset-0 bg-black/90 z-40 cursor-pointer animate-in fade-in duration-300"
          onClick={() => setFocusMode(false)}
        />
      )}
    <div className={`space-y-0 ${focusMode ? "relative z-50" : ""}`}>
      {/* ── VIDEO PLAYER ────────────────────────── */}
      <div className="rounded-t-2xl overflow-hidden border border-white/8 border-b-0 bg-black relative">
        <div className="relative aspect-video overflow-hidden bg-black">
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20 blur-xl scale-[1.04]"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.78)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/45" />

          {/* Custom AnimePlayer — handles both HLS and iframe modes */}
          {session.source && (
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
                isHardSubStream={effectiveActiveServerId === "hls-hardsub"}
                onReady={() => setLoadedSurfaceKey(activePlayerSurfaceKey)}
                onEpisodeEnd={() => {
                  if (nextEpisode) {
                    queueSession({
                      episodeNumber: nextEpisode.number,
                      provider: session.provider,
                      dubbed: session.dubbed,
                      server: null,
                    });
                  }
                }}
              />
            </div>
          )}


          {!embedAvailable && session.stale && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0c]/95 px-8 text-center">
              <div className="rounded-full border border-white/10 bg-white/6 p-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20" style={{ borderTopColor: accentColor }} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Resolving stream…</h2>
                <p className="max-w-md text-sm text-white/60">
                  Please wait while we locate the best source for this episode.
                </p>
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
                    AnimeKAI
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

      {/* ── CONTROLS BAR (AnimeKAI-style) ───────── */}
      <div className="bg-[#111113] border-x border-white/8 px-2 md:px-4 py-1.5">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <div className="flex items-center gap-0.5 flex-wrap">
            <ControlBtn
              icon={focusMode ? Minimize2 : Eye}
              label={focusMode ? "Exit Focus" : "Focus"}
              active={focusMode}
              accent={focusMode}
              accentColor={accentColor}
              onClick={() => {
                setFocusMode((v) => !v);
                const el = document.querySelector("iframe");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          </div>

          <div className="flex items-center gap-0.5 flex-wrap">
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
      </div>

      {/* ── EPISODE INFO + SERVER STRIP ─────────── */}
      <div className="relative bg-[#131315] border-x border-white/8 px-4 md:px-5 py-3 space-y-3">
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

        {/* Server rows */}
        <div className="space-y-2">
          {/* Sub servers — with Soft/Hard filter pills when both types exist */}
          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-[11px] font-bold text-white/40 w-12 uppercase tracking-wider shrink-0 pt-1">Sub</span>
            <div className="flex flex-col gap-2 flex-1">
              {/* Sub-type filter pills — only shown when both soft and hard sub streams exist */}
              {softSubServers.length > 0 && hardSubServers.length > 0 && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSubTypeFilter("soft");
                      // Switch to soft sub server if currently on hard sub
                      if (effectiveActiveServerId === "hls-hardsub") {
                        queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: "hls-softsub", dubbed: false });
                      }
                    }}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                      subTypeFilter === "soft"
                        ? "border-white/25 text-white/80 bg-white/10"
                        : "border-white/10 text-white/35 bg-transparent hover:border-white/18 hover:text-white/55"
                    }`}
                  >
                    📄 Soft Sub
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubTypeFilter("hard");
                      // Switch to hard sub server immediately
                      if (effectiveActiveServerId !== "hls-hardsub") {
                        queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: "hls-hardsub", dubbed: false });
                      }
                    }}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                      subTypeFilter === "hard"
                        ? "border-amber-400/40 text-amber-300/90 bg-amber-400/10"
                        : "border-white/10 text-white/35 bg-transparent hover:border-white/18 hover:text-white/55"
                    }`}
                    title="Subtitles are burnt into the video and cannot be restyled"
                  >
                    🔒 Hard Sub
                  </button>
                </div>
              )}
              {/* Filtered server buttons */}
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  // Determine which servers to show based on filter
                  const hasBothTypes = softSubServers.length > 0 && hardSubServers.length > 0;
                  const serversToShow = hasBothTypes
                    ? (subTypeFilter === "hard" ? hardSubServers : softSubServers)
                    : subServers; // only one type — show all
                  return serversToShow.length > 0 ? (
                    serversToShow.map((entry) => (
                      <ServerButton
                        key={entry.id}
                        label={entry.label}
                        active={!session.dubbed && effectiveActiveServerId === entry.id}
                        onClick={() => queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: entry.id, dubbed: false })}
                      />
                    ))
                  ) : (
                    <ServerButton
                      label={`Try ${humanizeProviderId(mainFallback)} sub`}
                      active={false}
                      onClick={() => queueSession({ episodeNumber: session.episode.number, provider: mainFallback, server: null, dubbed: false })}
                    />
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Dub servers — hidden entirely when no dub is available */}
          {hasDub && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-bold text-white/40 w-12 uppercase tracking-wider shrink-0">Dub</span>
            <div className="flex flex-wrap gap-1.5">
              {dubServers.length > 0 ? (
                dubServers.map((entry) => (
                  <ServerButton
                    key={entry.id}
                    label={entry.label}
                    active={session.dubbed && effectiveActiveServerId === entry.id && !isDesidub}
                    onClick={() => queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: entry.id, dubbed: true })}
                  />
                ))
              ) : (
                <ServerButton
                  label={`Try ${humanizeProviderId(mainFallback)} dub`}
                  active={false}
                  onClick={() => queueSession({ episodeNumber: session.episode.number, provider: mainFallback, server: null, dubbed: true })}
                />
              )}
            </div>
          </div>
          )}

          {/* Hindi servers */}
          {showHindi && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-bold text-[#ff5500]/80 w-12 uppercase tracking-wider shrink-0">Hindi</span>
              <div className="flex flex-wrap gap-1.5">
                {hindiServers.length > 0 ? (
                  hindiServers.map((entry) => (
                    <ServerButton
                      key={entry.id}
                      label={entry.label}
                      active={isDesidub && effectiveActiveServerId === entry.id}
                      onClick={() => queueSession({ episodeNumber: session.episode.number, provider: "desidub", server: entry.id, dubbed: true })}
                    />
                  ))
                ) : (
                  <ServerButton
                    label="DesiDub"
                    active={false}
                    onClick={() => queueSession({ episodeNumber: session.episode.number, provider: "desidub", server: null, dubbed: true })}
                  />
                )}
              </div>
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

      {/* ── EPISODE GRID ─────────────────────────── */}
      <div className="rounded-b-2xl border border-white/8 border-t-0 bg-[#111113] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">Episodes</h2>
            <span className="text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
              {languageFilteredEpisodes.length}
            </span>
            {session.dubbed && dubCountKnown && (
              <span className="text-[9px] font-bold text-[#4ade80]/60 bg-[#4ade80]/8 border border-[#4ade80]/15 px-2 py-0.5 rounded-full">
                {dubCount} DUB
              </span>
            )}
            {session.dubbed && !dubCountKnown && (
              <span className="text-[9px] font-bold text-amber-400/60 bg-amber-400/8 border border-amber-400/15 px-2 py-0.5 rounded-full">
                Dub availability varies
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" aria-hidden="true" />
              <input
                type="text"
                placeholder="Find…"
                value={episodeQuery}
                onChange={(e) => setEpisodeQuery(e.target.value)}
                className="bg-white/[0.04] border border-white/8 rounded-lg text-xs text-white/80 pl-7 pr-3 py-1.5 w-28 focus:w-40 transition-all outline-none"
                style={{ '--tw-ring-color': accentStyle(0.4) } as React.CSSProperties}
              />
            </div>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${
                showEpisodeList
                  ? ""
                  : "bg-white/[0.04] text-white/50 border-white/8 hover:text-white"
              }`}
              style={showEpisodeList ? { background: accentStyle(0.1), color: accentColor, borderColor: accentStyle(0.25) } : undefined}
              onClick={() => setShowEpisodeList(!showEpisodeList)}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showEpisodeList ? "rotate-180" : ""}`} aria-hidden="true" />
              List
            </button>
          </div>
        </div>


        {/* Number grid */}
        <div className="px-4 py-3">
          {filteredEpisodes.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">
              No episodes match "{episodeQuery}"
            </p>
          ) : (
            <EpisodeNumberGrid
              episodes={filteredEpisodes}
              activeNumber={session.episode.number}
              onSelect={goToEpisode}
              onHover={prefetchEpisode}
              watchedSet={watchedEpisodes}
              accentColor={accentColor}
            />
          )}
        </div>

        {/* Expandable list view */}
        {showEpisodeList && (
          <div
            className="max-h-[400px] overflow-y-auto hide-scrollbar border-t border-white/5"
            ref={(el) => {
              if (el) {
                const active = el.querySelector('[data-active-episode="true"]');
                if (active) active.scrollIntoView({ block: "center", behavior: "instant" });
              }
            }}
          >
            {filteredEpisodes.map((episode) => {
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
                  {episode.image && (
                    <div className={`w-20 h-12 rounded-lg overflow-hidden shrink-0 border border-white/5 ${watched && !active ? "opacity-60" : ""}`}>
                      <img src={episode.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate leading-snug ${
                      active ? "text-white" : watched ? "text-white/50 group-hover/ep:text-white/80" : "text-white/80 group-hover/ep:text-white"
                    }`}>
                      {episode.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {episode.isFiller && <span className="text-[9px] font-bold uppercase bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">Filler</span>}
                      {episode.isSubbed && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: accentStyle(0.1), color: accentColor }}>Sub</span>}
                      {episode.isDubbed && <span className="text-[9px] font-bold uppercase bg-[#4ade80]/10 text-[#4ade80] px-1.5 py-0.5 rounded">Dub</span>}
                      {watched && !active && <span className="text-[9px] font-bold uppercase text-emerald-400/50 flex items-center gap-0.5">✓ Watched</span>}
                    </div>
                  </div>
                  {active && <div className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: accentColor }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SEASONS ─────────────────────────────── */}
      <SeasonRail seasons={session.seasons} activeHref={session.anime.href} accentColor={accentColor} />

      {/* ── ANIME INFO + RECOMMENDATIONS ─────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <WatchAnimeDetailsPanel session={session} heroImage={heroImage}>
          <CommentSection
            animeId={session.anime.id}
            episodeNumber={session.episode.number}
            currentUserId={resolvedCurrentUserId}
            onTimestampClick={() => {
              document.querySelector("iframe")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </WatchAnimeDetailsPanel>
        <div>
          <WatchRecommendationsPanel recommendations={deferredRecommendations} />
        </div>
      </div>
    </div>
    </>
  );
}
