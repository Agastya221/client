"use client";

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
  mergeEpisodeDisplayMetadataSources,
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
  getEpisodeProgress,
  getWatchedEpisodes,
  subscribeToWatchHistory,
  updateEpisodeProgress,
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
  Share2,
  Tv2,
  Users,
} from "lucide-react";
import Image, { type ImageProps } from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WatchPartyModal = dynamic(() => import("@/components/anime/WatchPartyModal"), { ssr: false });
const WatchPartyPanel = dynamic(() => import("@/components/anime/WatchParty"), { ssr: false });

const VideoPlayer = dynamic(
  () => import("@/components/anime/watch/VideoPlayer"),
  {
    ssr: false,
    loading: () => (
      <div
        className="absolute inset-0 bg-black"
        role="status"
        aria-label="Loading player"
      />
    ),
  },
);

const EPISODE_PAGE_SIZE = 100;
const EPISODE_METADATA_CACHE_LIMIT = 12;
const episodeMetadataRangeCache = new Map<string, EpisodeDisplayMetadata[]>();
const episodeMetadataRangeRequests = new Map<string, Promise<EpisodeDisplayMetadata[]>>();
const episodeAvailabilityCache = new Map<number, EpisodeDisplayMetadata[]>();
const episodeAvailabilityRequests = new Map<number, Promise<EpisodeDisplayMetadata[]>>();
type WatchDiscoveryPayload = {
  currentUserId?: string | null;
  detail?: AnilistMedia | null;
  seasons?: AnilistSeasonEntry[];
  related?: RelatedAnimeEntry[];
  recommendations?: AnilistMedia[];
};
const watchDiscoveryCache = new Map<string, WatchDiscoveryPayload>();
const watchDiscoveryRequests = new Map<string, Promise<WatchDiscoveryPayload>>();

function cacheEpisodeMetadataRange(key: string, entries: EpisodeDisplayMetadata[]) {
  episodeMetadataRangeCache.delete(key);
  episodeMetadataRangeCache.set(key, entries);
  while (episodeMetadataRangeCache.size > EPISODE_METADATA_CACHE_LIMIT) {
    const oldestKey = episodeMetadataRangeCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    episodeMetadataRangeCache.delete(oldestKey);
  }
}

function loadEpisodeMetadataRange(anilistId: number, episodeRangeStart: number) {
  const key = `${anilistId}:${episodeRangeStart}`;
  const cached = episodeMetadataRangeCache.get(key);
  if (cached) {
    cacheEpisodeMetadataRange(key, cached);
    return Promise.resolve(cached);
  }
  const pending = episodeMetadataRangeRequests.get(key);
  if (pending) return pending;

  const params = new URLSearchParams({
    anilistId: String(anilistId),
    episodeStart: String(episodeRangeStart),
    metadataOnly: "1",
    // Version the browser-cache key when the metadata payload shape/source
    // changes. This prevents an older description-only response from hiding
    // newly available TVMaze artwork for the full max-age window.
    v: "2",
  });
  const request = fetch(`/api/watch-page-context?${params.toString()}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Watch page context failed with ${response.status}`);
      const payload = await response.json() as { episodeMetadata?: EpisodeDisplayMetadata[] };
      const entries = payload.episodeMetadata ?? [];
      cacheEpisodeMetadataRange(key, entries);
      return entries;
    })
    .finally(() => episodeMetadataRangeRequests.delete(key));
  episodeMetadataRangeRequests.set(key, request);
  return request;
}

function loadEpisodeAvailability(anilistId: number) {
  const cached = episodeAvailabilityCache.get(anilistId);
  if (cached) return Promise.resolve(cached);
  const pending = episodeAvailabilityRequests.get(anilistId);
  if (pending) return pending;
  const params = new URLSearchParams({ anilistId: String(anilistId), availabilityOnly: "1" });
  const request = fetch(`/api/watch-page-context?${params.toString()}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Episode availability failed with ${response.status}`);
      const payload = await response.json() as { episodeMetadata?: EpisodeDisplayMetadata[] };
      const entries = payload.episodeMetadata ?? [];
      episodeAvailabilityCache.set(anilistId, entries);
      return entries;
    })
    .finally(() => episodeAvailabilityRequests.delete(anilistId));
  episodeAvailabilityRequests.set(anilistId, request);
  return request;
}

function loadWatchDiscovery(key: string, params: URLSearchParams) {
  const cached = watchDiscoveryCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = watchDiscoveryRequests.get(key);
  if (pending) return pending;
  const request = fetch(`/api/watch-page-context?${params.toString()}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Watch discovery failed with ${response.status}`);
      const payload = await response.json() as WatchDiscoveryPayload;
      watchDiscoveryCache.set(key, payload);
      return payload;
    })
    .finally(() => watchDiscoveryRequests.delete(key));
  watchDiscoveryRequests.set(key, request);
  return request;
}
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

function isKnownBrokenServerOption(serverId: string | null | undefined): boolean {
  return Boolean(serverId && /^anivexa2?-anibd-/.test(serverId));
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
  onImageLoad?: () => void;
};

function SafeWatchImage({ src, onImageLoad, ...props }: SafeWatchImageProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const activeSrc = src && !failedSources.includes(src) ? src : null;

  if (!activeSrc) return null;

  return (
    <Image
      {...props}
      src={activeSrc}
      alt=""
      onLoad={onImageLoad}
      onError={() => {
        setFailedSources((current) => current.includes(activeSrc) ? current : [...current, activeSrc]);
      }}
    />
  );
}

/**
 * Player poster with progressive loading.
 * Reuses the selected episode's cached rail thumbnail as the blurred first
 * frame, then fades the HD artwork for that same episode in on top. Series
 * artwork is intentionally never used here, so the subject cannot change while
 * the sharper image is loading.
 */
function PlayerPosterImage({
  thumbnailArtwork,
  episodeArtwork,
}: {
  thumbnailArtwork: string | null;
  episodeArtwork: string | null;
}) {
  const [hdLoaded, setHdLoaded] = useState(false);

  return (
    <>
      {!hdLoaded && thumbnailArtwork ? (
        <SafeWatchImage
          src={thumbnailArtwork}
          fill
          unoptimized
          sizes="100vw"
          className="z-[1] scale-[1.04] object-cover blur-md brightness-75"
        />
      ) : null}
      {episodeArtwork ? (
        <SafeWatchImage
          src={episodeArtwork}
          fill
          preload
          fetchPriority="high"
          unoptimized
          sizes="(min-width: 1280px) calc(100vw - 440px), 100vw"
          className={`z-[2] object-cover transition-opacity duration-300 ease-out ${
            hdLoaded ? "opacity-100" : "opacity-0"
          }`}
          onImageLoad={() => setHdLoaded(true)}
        />
      ) : null}
    </>
  );
}

function deliverEpisodeArtwork(src: string | null): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    if (url.hostname === "static.wikia.nocookie.net") {
      return `/api/proxy/episode-image?url=${encodeURIComponent(src)}`;
    }
  } catch {
    // Relative and already-proxied URLs are safe to use as-is.
  }
  return src;
}

function WatchPreferenceToggle({
  label,
  active,
  onToggle,
  accentColor,
  disabled = false,
  title,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  accentColor: string;
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
      className="group inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[10px] font-medium text-white/40 transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.07] hover:text-white/85 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 sm:h-8 sm:px-2 sm:text-[11px] sm:font-semibold"
      style={active && !disabled ? { color: accentColor, "--tw-ring-color": `${accentColor}99` } as React.CSSProperties : undefined}
    >
      <span
        className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-white/15"
        style={active && !disabled ? { borderColor: accentColor, backgroundColor: accentColor } : undefined}
      >
        {active && !disabled ? <span className="h-1.5 w-1.5 rounded-[1px] bg-white" /> : null}
      </span>
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
  const [episodeRangeStart, setEpisodeRangeStart] = useState(() => {
    const activeIndex = initialSession.episodes.findIndex((episode) => episode.number === initialSession.episode.number);
    return Math.floor(Math.max(0, activeIndex) / EPISODE_PAGE_SIZE) * EPISODE_PAGE_SIZE;
  });
  const [episodeRangeMenuOpen, setEpisodeRangeMenuOpen] = useState(false);
  const [episodeMetadataLoading, setEpisodeMetadataLoading] = useState(false);
  const [optimisticEpisodeNumber, setOptimisticEpisodeNumber] = useState<number | null>(null);
  const [, setWatchHistoryVersion] = useState(0);
  const [episodeView, setEpisodeView] = useState<"grid" | "list" | "cards">("cards");
  const [showEmbedServers, setShowEmbedServers] = useState(() => Boolean(initialSession.activeServerId && isEmbedServerOption(initialSession.activeServerId)));
  const [focusMode, setFocusMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Keep the server render and the first client render identical. Persisted
  // browser preferences are restored immediately after hydration.
  const [autoSkip, setAutoSkip] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playerActivated, setPlayerActivated] = useState(false);
  const [loadedSurfaceKey, setLoadedSurfaceKey] = useState<string | null>(null);
  // Optimistic server selection: turns the button green immediately on click
  // before the embed has finished loading. Cleared when the session commits.
  const [optimisticServerId, setOptimisticServerId] = useState<string | null>(null);
  const [optimisticDubbed, setOptimisticDubbed] = useState<boolean | null>(null);
  const [optimisticProvider, setOptimisticProvider] = useState<ProviderId | null>(null);
  const pendingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPrefetchKeyRef = useRef<string | null>(null);
  const pendingSessionKeyRef = useRef<string | null>(null);
  const nearEndPrefetchedRef = useRef<string | null>(null);
  const automaticEmbedFallbackRef = useRef<string | null>(null);
  const sessionRequestSeqRef = useRef(0);
  const userActivatedPlayerRef = useRef(false);
  const playbackProgressRef = useRef({
    animeId: initialSession.anime.id,
    episodeNumber: initialSession.episode.number,
    time: 0,
    duration: 0,
    lastPersistedAt: 0,
  });
  const episodeMetadataRef = useRef<{
    animeId: string;
    entries: EpisodeDisplayMetadata[];
  } | null>(initialEpisodeMetadata.length > 0 ? {
    animeId: initialSession.anime.id,
    entries: initialEpisodeMetadata,
  } : null);
  const activeMetadataRequestKeyRef = useRef<string | null>(null);
  const failedServerIdsRef = useRef<Set<string>>(new Set());
  const [deferredRecommendations, setDeferredRecommendations] = useState<AnilistMedia[] | null>(initialRecommendations);
  const [deferredRelated, setDeferredRelated] = useState<RelatedAnimeEntry[] | null>(initialRelated);
  const [deferredDetail, setDeferredDetail] = useState<AnilistMedia | null>(null);
  const [deferredSeasons, setDeferredSeasons] = useState<AnilistSeasonEntry[] | null>(null);
  const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<string | null>(currentUserId ?? null);

  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkChecked, setBookmarkChecked] = useState(false);
  const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [shareStatus, setShareStatus] = useState<"idle" | "shared" | "copied" | "error">("idle");

  // ── Watch Party ────────────────────────────────────────────────────
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [partyRoomCode, setPartyRoomCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("watch-party-active-room-code");
  });
  const [partyIsHost, setPartyIsHost] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("watch-party-is-host") === "true";
  });
  const [partyMemberId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    let id = localStorage.getItem("watch-party-member-id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("watch-party-member-id", id); }
    return id;
  });
  const [partyMemberName] = useState<string>(() => {
    if (typeof window === "undefined") return "Guest";
    const stored = localStorage.getItem("watch-party-member-name");
    return stored || `Guest${Math.floor(Math.random() * 9000) + 1000}`;
  });
  const [partyCurrentTime, setPartyCurrentTime] = useState(0);
  const [partyIsPlaying, setPartyIsPlaying] = useState(false);

  const handleLeaveRoom = async () => {
    if (partyRoomCode) {
      await fetch(`/api/watch-party/join?code=${partyRoomCode}&memberId=${partyMemberId}&memberName=${encodeURIComponent(partyMemberName)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("watch-party-active-room-code");
      sessionStorage.removeItem("watch-party-is-host");
    }
    setPartyRoomCode(null);
    setPartyIsHost(false);
  };

  // Sync watch party state to sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (partyRoomCode) {
      sessionStorage.setItem("watch-party-active-room-code", partyRoomCode);
      sessionStorage.setItem("watch-party-is-host", partyIsHost ? "true" : "false");
    } else {
      sessionStorage.removeItem("watch-party-active-room-code");
      sessionStorage.removeItem("watch-party-is-host");
    }
  }, [partyRoomCode, partyIsHost]);

  // Prompt before reloading or closing if connected to a Watch Party
  useEffect(() => {
    if (!partyRoomCode) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You are currently connected to a Watch Together room. Are you sure you want to leave?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [partyRoomCode]);

  // Auto-join from URL ?party=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("party");
    if (!code) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("party");
    window.history.replaceState({}, "", url.toString());
    fetch("/api/watch-party/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, memberId: partyMemberId, memberName: partyMemberName }),
    })
      .then((res) => { if (res.ok) { setPartyRoomCode(code.toUpperCase()); setPartyIsHost(false); } })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Callbacks called by WatchPartyPanel when remote events arrive
  const partyCallbacks = useCallback(() => ({
    onEpisodeChange: (epNum: number) => {
      queueSession({ episodeNumber: epNum, provider: session.provider, dubbed: session.dubbed });
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [session.provider, session.dubbed]);

  useEffect(() => {
    setAutoSkip(playerPrefs.getAutoSkip());
    setAutoAdvance(playerPrefs.getAutoAdvance());
    setAutoPlay(playerPrefs.getAutoplay());
  }, []);

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

  const shareEpisode = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("ep", String(session.episode.number));
    const title = `${session.anime.title} · Episode ${session.episode.number}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Watch ${title}`, url: url.toString() });
        setShareStatus("shared");
      } else {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("copied");
      }
      window.setTimeout(() => setShareStatus("idle"), 2500);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("copied");
        window.setTimeout(() => setShareStatus("idle"), 2500);
      } catch {
        setShareStatus("error");
      }
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

  useEffect(() => subscribeToWatchHistory(() => {
    setWatchHistoryVersion((version) => version + 1);
  }), []);

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

  // Episode artwork is useful immediately, but it must never hold back the
  // watch shell. Fetch only the active 100-episode range after hydration.
  useEffect(() => {
    if (!session.anime.anilistId) return;

    const cacheKey = `${session.anime.anilistId}:${episodeRangeStart}`;
    activeMetadataRequestKeyRef.current = cacheKey;
    const cachedMetadata = episodeMetadataRangeCache.get(cacheKey);
    setEpisodeMetadataLoading(!cachedMetadata);

    void loadEpisodeMetadataRange(session.anime.anilistId, episodeRangeStart)
      .then((episodeMetadata) => {
        const previousMetadata = episodeMetadataRef.current?.animeId === session.anime.id
          ? episodeMetadataRef.current.entries
          : [];
        const combinedMetadata = mergeEpisodeDisplayMetadataSources(previousMetadata, episodeMetadata);
        episodeMetadataRef.current = {
          animeId: session.anime.id,
          entries: combinedMetadata,
        };
        if (episodeMetadata.length > 0) {
          setSession((current) =>
            current.anime.id === session.anime.id
              ? mergeEpisodeMetadataIntoWatchSession(current, combinedMetadata)
              : current);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (activeMetadataRequestKeyRef.current === cacheKey) {
          setEpisodeMetadataLoading(false);
        }
      });
  }, [episodeRangeStart, session.anime.anilistId, session.anime.id]);

  // Resolve catalogue-wide sub/dub badges separately from artwork. This keeps
  // the episode rail fast while still exposing dub from internal or embedded
  // AniVexa providers before an episode is selected.
  useEffect(() => {
    if (!session.anime.anilistId) return;
    let cancelled = false;
    void loadEpisodeAvailability(session.anime.anilistId)
      .then((availability) => {
        if (cancelled || availability.length === 0) return;
        const previousMetadata = episodeMetadataRef.current?.animeId === session.anime.id
          ? episodeMetadataRef.current.entries
          : [];
        const combinedMetadata = mergeEpisodeDisplayMetadataSources(previousMetadata, availability);
        episodeMetadataRef.current = { animeId: session.anime.id, entries: combinedMetadata };
        setSession((current) => current.anime.id === session.anime.id
          ? mergeEpisodeMetadataIntoWatchSession(current, combinedMetadata)
          : current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.anime.anilistId, session.anime.id]);

  // Seasons, recommendations, auth state, and related anime are below the
  // fold. Let the poster, controls, and source resolver get the first network
  // turn, then fill these panels independently.
  useEffect(() => {
    const params = new URLSearchParams({ discoveryOnly: "1" });
    if (session.anime.anilistId) params.set("anilistId", String(session.anime.anilistId));
    if (session.anime.title) params.set("title", session.anime.title);
    if (animeGenresKey) params.set("genres", animeGenresKey.replaceAll("|", ","));

    let cancelled = false;
    const discoveryKey = `${session.anime.anilistId || session.anime.id}:${animeGenresKey}`;
    void loadWatchDiscovery(discoveryKey, params)
        .then((payload) => {
          if (cancelled) return;
          setDeferredDetail(payload.detail ?? null);
          setDeferredSeasons(payload.seasons ?? []);
          setDeferredRelated(payload.related ?? []);
          setDeferredRecommendations(payload.recommendations ?? []);
          setResolvedCurrentUserId(payload.currentUserId ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setDeferredDetail(null);
          setDeferredSeasons([]);
          setDeferredRelated((current) => current ?? []);
          setDeferredRecommendations((current) => current ?? []);
        });

    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    const flushProgress = () => {
      const current = playbackProgressRef.current;
      if (current.duration <= 0 || current.time < 0) return;
      updateEpisodeProgress(
        current.animeId,
        current.episodeNumber,
        current.time / current.duration,
        current.duration,
      );
      current.lastPersistedAt = Date.now();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushProgress();
    };

    window.addEventListener("pagehide", flushProgress);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      flushProgress();
      window.removeEventListener("pagehide", flushProgress);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
    setOptimisticDubbed(null);
    setOptimisticProvider(null);
    setOptimisticEpisodeNumber(null);

    if (
      playbackProgressRef.current.animeId !== nextSession.anime.id ||
      playbackProgressRef.current.episodeNumber !== nextSession.episode.number
    ) {
      const saved = getEpisodeProgress(nextSession.anime.id, nextSession.episode.number);
      playbackProgressRef.current = {
        animeId: nextSession.anime.id,
        episodeNumber: nextSession.episode.number,
        time: saved && saved.progress > 0.01 && saved.progress < 0.95 ? saved.progress * saved.duration : 0,
        duration: saved?.duration || 0,
        lastPersistedAt: 0,
      };
    }

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
      optimisticServerId === null &&
      optimisticDubbed === null &&
      optimisticProvider === null &&
      normalizedRequest.episodeNumber === session.episode.number &&
      normalizedRequest.provider === session.provider &&
      normalizedRequest.dubbed === session.dubbed &&
      (normalizedRequest.server ?? null) === (session.activeServerId ?? null)
    ) {
      return;
    }

    const currentProgress = playbackProgressRef.current;
    if (currentProgress.duration > 0 && currentProgress.time >= 0) {
      updateEpisodeProgress(
        currentProgress.animeId,
        currentProgress.episodeNumber,
        currentProgress.time / currentProgress.duration,
        currentProgress.duration,
      );
      currentProgress.lastPersistedAt = Date.now();
    }

    if (normalizedRequest.episodeNumber !== session.episode.number) {
      setOptimisticEpisodeNumber(normalizedRequest.episodeNumber);
    }
    setOptimisticDubbed(Boolean(normalizedRequest.dubbed));
    setOptimisticProvider(normalizedRequest.provider ?? session.provider);

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
          setOptimisticDubbed(null);
          setOptimisticProvider(null);
          setOptimisticEpisodeNumber(null);
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
        setOptimisticDubbed(null);
        setOptimisticProvider(null);
        setOptimisticEpisodeNumber(null);
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

    const playableCandidates = session.serverOptions.filter((entry) => {
      const sameLanguage = language === "dub"
        ? entry.category === "dub"
        : entry.category === "sub" || !entry.category;
      const failedCandidateKey = `${session.anime.id}|${session.episode.number}|${language}|${entry.id}`;
      // A generic embed is a valid escape hatch from either hard- or soft-sub
      // internal playback. Requiring the same subType previously excluded the
      // working embeds and allowed Nova's broken iframe to win instead.
      const sameSubMode = isCustomEmbedServer(entry.id) || language === "dub" || !activeServer?.subType || entry.subType === activeServer.subType;
      return sameLanguage &&
        sameSubMode &&
        entry.id !== activeServerId &&
        !isKnownBrokenServerOption(entry.id) &&
        !failedServerIdsRef.current.has(failedCandidateKey);
    }).sort((left, right) => {
      const priority = (entry: ServerOption) => isCustomEmbedServer(entry.id) ? 0 : isEmbedServerOption(entry.id) ? 2 : 1;
      return priority(left) - priority(right);
    });

    const currentIndex = playableCandidates.findIndex((entry) => entry.id === activeServerId);
    const orderedCandidates =
      currentIndex >= 0
        ? [...playableCandidates.slice(currentIndex + 1), ...playableCandidates.slice(0, currentIndex)]
        : playableCandidates;
    const next = orderedCandidates[0];

    if (!next) {
      watchDebug("playback_error.no_candidate", {
        provider: session.provider,
        activeServerId,
        language,
        subType: activeServer?.subType || "any",
      });
      setPlaybackMessage(
        activeServer?.subType === "hard"
          ? "No working hard-sub or embedded server was found for this episode."
          : "No working server was found for this episode or audio mode.",
      );
      return;
    }

    watchDebug("playback_error.try_next_server", {
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
    automaticEmbedFallbackRef.current = null;
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

  // Defensive client fallback: if a resolver response still arrives without a
  // source but already advertises an embed, select it automatically. This
  // prevents the transient "No source" state and requires no user click.
  useEffect(() => {
    if (session.stale || session.source || isSessionLoading) return;
    const category = session.dubbed ? "dub" : "sub";
    const fallback = session.serverOptions.find((option) =>
      option.category === category && isCustomEmbedServer(option.id) && !isKnownBrokenServerOption(option.id),
    );
    if (!fallback) return;
    const key = `${session.anime.id}|${session.episode.number}|${category}|${fallback.id}`;
    if (automaticEmbedFallbackRef.current === key) return;
    automaticEmbedFallbackRef.current = key;
    queueSession({
      episodeNumber: session.episode.number,
      provider: fallback.provider,
      server: fallback.id,
      dubbed: session.dubbed,
    });
  }, [isSessionLoading, session.anime.id, session.dubbed, session.episode.number, session.serverOptions, session.source, session.stale]);

  /* ── Server buttons helper ───────────────────── */
  // Priority: optimistic click → pending staged session → committed session
  const effectiveActiveServerId = optimisticServerId || pendingSession?.activeServerId || session.activeServerId;
  const effectiveDubbed = optimisticDubbed ?? pendingSession?.dubbed ?? session.dubbed;
  const effectiveProvider = optimisticProvider ?? pendingSession?.provider ?? session.provider;
  const activeIsEmbedServer = Boolean(effectiveActiveServerId && isEmbedServerOption(effectiveActiveServerId));

  // Auto-open/close embed panel based on current active server type
  useEffect(() => {
    setShowEmbedServers(activeIsEmbedServer);
  }, [activeIsEmbedServer]);

  const embedServersOpen = showEmbedServers;
  const usableServerOptions = session.serverOptions.filter((option) => !isKnownBrokenServerOption(option.id));
  const { subServers, softSubServers, hardSubServers, dubServers, hindiServers } = summarizeServerGroups(usableServerOptions);
  const effectiveActiveServer = session.serverOptions.find((entry) => entry.id === effectiveActiveServerId);
  const activeHasSoftSubtitles = !session.dubbed && session.subtitles.some((track) => Boolean(track.url));
  const activeIsHardSub = !activeHasSoftSubtitles && (
    effectiveActiveServer?.subType === "hard" ||
    effectiveActiveServerId === "hls-hardsub" ||
    (effectiveActiveServerId?.endsWith("-hard") ?? false)
  );
  const mainFallback = session.availableProviders.find((p) => p !== "desidub") || "animekai";
  const showHindi = session.availableProviders.includes("desidub") || effectiveProvider === "desidub";


  const heroImage =
    session.anime.banner ||
    session.anime.poster ||
    "https://placehold.co/1600x900/09090b/f5f5f5?text=Tatakai";
  const displayedEpisode = optimisticEpisodeNumber
    ? session.episodes.find((episode) => episode.number === optimisticEpisodeNumber) || session.episode
    : session.episode;
  const displayedEpisodeNumber = displayedEpisode.number;
  const playerThumbnailImage = deliverEpisodeArtwork(
    getEpisodeArtworkUrl(displayedEpisode.thumbnail || displayedEpisode.image, session.anime),
  );
  const playerPosterImage = deliverEpisodeArtwork(
    getEpisodeArtworkUrl(displayedEpisode.image || displayedEpisode.thumbnail, session.anime),
  );
  const savedProgress = getEpisodeProgress(session.anime.id, session.episode.number);
  const liveProgress = playbackProgressRef.current;
  const resumeTime = liveProgress.animeId === session.anime.id && liveProgress.episodeNumber === session.episode.number && liveProgress.time > 0
    ? liveProgress.time
    : savedProgress && savedProgress.progress > 0.01 && savedProgress.progress < 0.95
      ? savedProgress.progress * savedProgress.duration
      : 0;
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

    const activeIndex = filteredEpisodes.findIndex((episode) => episode.number === displayedEpisodeNumber);
    const nextRangeStart = Math.floor(Math.max(0, activeIndex) / EPISODE_PAGE_SIZE) * EPISODE_PAGE_SIZE;
    setEpisodeRangeStart(nextRangeStart);
  // Metadata hydration replaces the episode array after a range is selected.
  // Do not follow that array identity here: doing so snapped the rail back to
  // the currently-playing episode as soon as titles/artwork arrived. The range
  // should only follow an actual episode change or a search-mode change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedEpisodeNumber, episodeQuery]);

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
      <div className="grid gap-1.5 sm:grid-cols-[92px_1fr] sm:items-center sm:gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35 sm:text-right sm:text-[11px] sm:normal-case sm:tracking-normal">{label}</span>
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar sm:flex-wrap sm:overflow-visible sm:pb-0">
          {entries.length > 0 ? entries.map((entry) => {
            const isEmbedEntry = isEmbedServerOption(entry.id);
            // HLS is an implementation detail, not a useful choice for the
            // viewer. Keep the rarer MP4 distinction but remove the noisy HLS
            // badge from every normal server button.
            const transportTag = entry.transport === "mp4" ? "MP4" : undefined;
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
                    ? effectiveProvider === "desidub"
                    : Boolean(options.dubbed) === Boolean(effectiveDubbed) && (!options.dubbed || effectiveProvider !== "desidub"))
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
      <div className="space-y-3 border-b border-white/5 p-3 sm:px-4 sm:py-3">
        <div className="hidden items-start justify-between gap-3 sm:flex">
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
            className="hidden w-full rounded-xl border px-3 py-2.5 text-left transition-all hover:brightness-110 sm:block"
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
          <div className="hidden rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 sm:block">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Latest available episode</p>
            <p className="mt-1 text-sm font-bold text-white">You are caught up</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {episodeRangeCount > 1 && !episodeQuery.trim() ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setEpisodeRangeMenuOpen((open) => !open)}
                className="flex h-10 min-w-[92px] items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 text-[11px] font-bold text-white/70 outline-none transition-colors hover:border-white/15 focus-visible:border-white/25"
                aria-label="Episode range"
                aria-expanded={episodeRangeMenuOpen}
              >
                <span>{visibleEpisodes[0]?.number ?? episodeRangeStart + 1}-{visibleEpisodes.at(-1)?.number ?? episodeRangeStart + 1}</span>
                {episodeMetadataLoading ? (
                  <RefreshCcw className="h-3.5 w-3.5 animate-spin" style={{ color: accentColor }} aria-hidden="true" />
                ) : (
                  <ChevronDown className={`h-3.5 w-3.5 text-white/35 transition-transform ${episodeRangeMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                )}
              </button>
              {episodeRangeMenuOpen ? (
                <div className="absolute left-0 top-11 z-50 max-h-64 min-w-full overflow-y-auto rounded-xl border border-white/10 bg-[#151619] p-1.5 shadow-2xl shadow-black/60">
                  {Array.from({ length: episodeRangeCount }, (_, index) => {
                    const start = index * EPISODE_PAGE_SIZE;
                    const first = filteredEpisodes[start]?.number ?? start + 1;
                    const last = filteredEpisodes[Math.min(start + EPISODE_PAGE_SIZE - 1, filteredEpisodes.length - 1)]?.number ?? first;
                    const active = start === episodeRangeStart;
                    return (
                      <button
                        key={start}
                        type="button"
                        onClick={() => {
                          setEpisodeRangeMenuOpen(false);
                          setEpisodeRangeStart(start);
                        }}
                        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px] font-bold transition-colors hover:bg-white/[0.07]"
                        style={active ? { background: accentStyle(0.16), color: accentColor } : { color: "rgba(255,255,255,0.62)" }}
                      >
                        {first}-{last}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" aria-hidden="true" />
            <input
              type="text"
              placeholder="Filter episodes..."
              value={episodeQuery}
              onChange={(e) => setEpisodeQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/8 bg-white/[0.04] py-2 pl-9 pr-3 text-xs text-white/80 outline-none focus:border-white/18 sm:text-sm"
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

      <div className="watch-episode-panel-body p-2 sm:px-3 sm:py-3">
        {filteredEpisodes.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-4">
            {`No episodes match "${episodeQuery}"`}
          </p>
        ) : episodeView === "cards" ? (
          <div key={`cards-${episodeRangeStart}`} className="watch-episode-range watch-episode-scroll max-h-[244px] space-y-1.5 overflow-y-auto pr-1 hide-scrollbar sm:h-full sm:max-h-none sm:space-y-2">
            {visibleEpisodes.map((episode) => {
              const active = episode.number === displayedEpisodeNumber;
              const watched = watchedEpisodes.has(episode.number);
              const episodeArtwork = deliverEpisodeArtwork(getEpisodeArtworkUrl(episode.thumbnail || episode.image, session.anime));
              // Keep the player poster as the only critical image request. The
              // episode rail can fill in immediately afterwards without
              // competing for bandwidth during the first player paint.
              const eagerArtwork = active;
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
                  className={`watch-episode-card group/episode relative flex w-full gap-0 overflow-hidden rounded-[11px] border text-left transition-[border-color,background-color,box-shadow,filter] duration-200 ease-out hover:shadow-[0_8px_24px_rgba(0,0,0,0.28)] active:brightness-110 ${episodeArtwork ? "h-[76px] sm:h-[100px]" : "h-[58px] sm:h-[68px]"}`}
                  style={{
                    borderColor: active ? accentStyle(0.95) : watched ? accentStyle(0.38) : "rgba(255,255,255,0.07)",
                    background: active ? accentStyle(0.68) : watched ? accentStyle(0.13) : "rgba(255,255,255,0.02)",
                    "--accent-hover-shadow": `0 8px 24px ${accentStyle(0.24)}`,
                  } as React.CSSProperties}
                >
                  {episodeArtwork ? (
                    <div className="relative h-full w-[34%] shrink-0 overflow-hidden rounded-[10px] bg-black sm:w-[42%]">
                      <SafeWatchImage
                        src={episodeArtwork}
                        fill
                        priority={eagerArtwork}
                        loading={eagerArtwork ? "eager" : "lazy"}
                        fetchPriority={eagerArtwork ? "high" : "auto"}
                        quality={55}
                        sizes="(max-width: 639px) 132px, (min-width: 1280px) 160px, 150px"
                        unoptimized
                        className="object-cover transition-transform duration-300 group-hover/episode:scale-[1.025]"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[9px] font-black text-white">
                        EP {episode.number}
                      </span>
                    </div>
                  ) : (
                    <div className="flex w-12 shrink-0 items-center justify-center border-r border-white/[0.05] bg-white/[0.015] sm:w-14">
                      <span className="rounded-md bg-white/[0.08] px-1.5 py-1 text-[9px] font-black text-white/55">
                        EP {episode.number}
                      </span>
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col px-2 py-1.5 sm:py-2">
                    <p className="line-clamp-1 text-[11px] font-bold leading-4 text-white/85 group-hover/episode:text-white sm:text-[12px]">
                      {episode.title}
                    </p>
                    {description ? (
                      <p className={`mt-0.5 line-clamp-2 text-[9px] leading-[11px] sm:line-clamp-3 sm:text-[10px] sm:leading-[12px] ${active ? "text-white/72" : "text-white/38"}`}>
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
            key={`list-${episodeRangeStart}`}
            className="watch-episode-range watch-episode-scroll max-h-[244px] space-y-1 overflow-y-auto pr-1 hide-scrollbar sm:h-full sm:max-h-none"
          >
            {visibleEpisodes.map((episode) => {
              const active = episode.number === displayedEpisodeNumber;
              const watched = watchedEpisodes.has(episode.number);
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
                  className="group/ep flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left transition-all"
                  style={active
                    ? { background: accentColor, borderColor: accentStyle(0.95), color: "white" }
                    : watched
                      ? { background: accentStyle(0.12), borderColor: accentStyle(0.28) }
                      : { background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.07)" }}
                >
                  <span className={`flex w-5 shrink-0 items-center justify-center text-[11px] font-bold ${active ? "text-white" : "text-white/42"}`}>
                    {active ? <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> : `${episode.number}.`}
                  </span>
                  <p className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${active ? "text-white" : watched ? "text-white/75" : "text-white/48"}`}>
                    {episode.title}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    {languageAvailability.subbed ? <span className={`rounded-[3px] px-1 text-[7px] font-black ${active ? "bg-white/85 text-black/70" : "bg-white/45 text-black/75"}`}>CC</span> : null}
                    {languageAvailability.dubbed ? <EpisodeMicIcon className={`h-3 w-3 ${active ? "text-white" : "text-white/45"}`} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div key={`grid-${episodeRangeStart}`} className="watch-episode-range watch-episode-scroll h-full min-h-0 overflow-y-auto pr-1">
            <EpisodeNumberGrid
              episodes={visibleEpisodes}
              activeNumber={displayedEpisodeNumber}
              onSelect={goToEpisode}
              onHover={prefetchEpisode}
              watchedSet={watchedEpisodes}
              accentColor={accentColor}
            />
          </div>
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
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_12px_32px_rgba(0,0,0,0.24)] sm:rounded-2xl">
        <div className="relative aspect-video overflow-hidden bg-black">
          {!playerActivated && (embedAvailable || session.stale) ? (
            <button
              type="button"
              onClick={activatePlayer}
              aria-label={`Play Episode ${session.episode.number}`}
              className="group absolute inset-0 z-10 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
            >
              <PlayerPosterImage
                key={`${displayedEpisode.number}:${playerThumbnailImage || "none"}:${playerPosterImage || "none"}`}
                thumbnailArtwork={playerThumbnailImage}
                episodeArtwork={playerPosterImage}
              />
              <span className="absolute left-1/2 top-1/2 z-[3] inline-flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/95 text-black shadow-[0_10px_30px_rgba(0,0,0,0.38)] transition-all duration-200 group-hover:scale-105 group-hover:bg-white group-focus-visible:scale-105 sm:h-14 sm:w-14">
                <Play className="h-5 w-5 translate-x-px fill-current sm:h-6 sm:w-6" aria-hidden="true" />
              </span>
              <span className="absolute inset-x-4 bottom-4 z-[3] block truncate text-sm font-bold text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)] sm:inset-x-6 sm:bottom-6 sm:text-base">
                Episode {displayedEpisode.number}{displayedEpisode.title !== `Episode ${displayedEpisode.number}` ? ` · ${displayedEpisode.title}` : ""}
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
                startTime={resumeTime}
                isHardSubStream={activeIsHardSub}
                onTimeUpdate={(time, duration) => {
                  if (!Number.isFinite(time) || time < 0) return;
                  const current = playbackProgressRef.current;
                  current.animeId = session.anime.id;
                  current.episodeNumber = session.episode.number;
                  current.time = time;
                  if (Number.isFinite(duration) && duration > 0) current.duration = duration;
                  const now = Date.now();
                  if (current.duration > 0 && now - current.lastPersistedAt >= 5000) {
                    updateEpisodeProgress(
                      current.animeId,
                      current.episodeNumber,
                      current.time / current.duration,
                      current.duration,
                    );
                    current.lastPersistedAt = now;
                  }
                }}
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
      <div className="relative mt-1.5 rounded-lg border border-white/10 bg-[#0d0e10] px-1.5 py-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.16)] sm:px-2 sm:py-1 md:px-3">
        <div className="flex min-h-8 items-center gap-1 overflow-hidden sm:justify-between sm:overflow-visible">
          <div className="flex shrink-0 flex-nowrap items-center gap-2 sm:gap-1.5">
            <WatchPreferenceToggle
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
              className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-white/45 transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.07] hover:text-white/85 sm:inline-flex"
              style={showShortcuts ? { color: accentColor } : undefined}
            >
              <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
              Shortcuts
            </button>
            <span className="hidden sm:inline-flex">
              <ControlBtn
                icon={focusMode ? Minimize2 : Lightbulb}
                label={focusMode ? "Lights On" : "Lights Off"}
                active={focusMode}
                accent={focusMode}
                accentColor={accentColor}
                onClick={() => setFocusMode((value) => !value)}
              />
            </span>
          </div>

          <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-0.5">
            <button
              type="button"
              disabled={!previousEpisode}
              onClick={() => previousEpisode && goToEpisode(previousEpisode.number)}
              aria-label="Previous episode"
              className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[9px] font-semibold text-white/35 transition-all hover:bg-white/[0.07] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-25 sm:hidden"
            >
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              Prev
            </button>
            <button
              type="button"
              disabled={!nextEpisode}
              onClick={() => nextEpisode && goToEpisode(nextEpisode.number)}
              aria-label="Next episode"
              className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[9px] font-semibold text-white/45 transition-all hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 sm:hidden"
            >
              {nextEpisode ? `EP ${nextEpisode.number}` : "Next"}
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </button>
            <span className="hidden sm:inline-flex">
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
            </span>
            <div className="w-px h-5 bg-white/8 mx-1 hidden sm:block" />
            <span className="hidden sm:inline-flex">
              <ControlBtn
                icon={isBookmarked ? BookmarkCheck : Bookmark}
                label={isBookmarked ? "Bookmarked" : "Bookmark"}
                active={isBookmarked}
                onClick={toggleBookmark}
                disabled={!bookmarkChecked}
              />
            </span>
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
      <div className="relative mt-3 space-y-2.5 rounded-2xl border border-white/10 bg-[#111214] px-3 py-3 sm:space-y-3 sm:bg-[#131315] sm:px-4 md:px-5">
        {/* Top row: Language toggles on the left, Watch Together on the right */}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
          <div className="flex flex-wrap items-center gap-2">
            {/* Sub/Dub/Hindi mode toggle buttons */}
            <button
              type="button"
              disabled={(!effectiveDubbed && effectiveProvider !== "desidub") || !hasSub}
              aria-pressed={!effectiveDubbed && effectiveProvider !== "desidub"}
              onClick={() => {
                if ((effectiveDubbed || effectiveProvider === "desidub") && hasSub) {
                  const targetEpNum = getFallbackEpisodeForLanguage(false, session.episode.number);
                  queueSession({ episodeNumber: targetEpNum, provider: effectiveProvider === "desidub" ? mainFallback : effectiveProvider, server: null, dubbed: false });
                }
              }}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                !effectiveDubbed && effectiveProvider !== "desidub"
                  ? "cursor-default pointer-events-none"
                  : !hasSub
                    ? "opacity-30 cursor-not-allowed bg-white/5 text-white/30 border border-white/5"
                    : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70 cursor-pointer"
              }`}
              style={!effectiveDubbed && effectiveProvider !== "desidub" ? { background: accentStyle(0.15), color: accentColor, border: `1px solid ${accentStyle(0.25)}`, boxShadow: `0 0 8px ${accentStyle(0.15)}` } : undefined}
            >
              <Captions className="w-3 h-3" aria-hidden="true" />
              Sub
            </button>
            <button
              type="button"
              disabled={(effectiveDubbed && effectiveProvider !== "desidub") || !hasDub}
              aria-pressed={effectiveDubbed && effectiveProvider !== "desidub"}
              onClick={() => {
                if ((!effectiveDubbed || effectiveProvider === "desidub") && hasDub) {
                  const targetEpNum = getFallbackEpisodeForLanguage(true, session.episode.number);
                  queueSession({ episodeNumber: targetEpNum, provider: effectiveProvider === "desidub" ? mainFallback : effectiveProvider, server: null, dubbed: true });
                }
              }}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                effectiveDubbed && effectiveProvider !== "desidub"
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
                disabled={effectiveProvider === "desidub"}
                aria-pressed={effectiveProvider === "desidub"}
                onClick={() => {
                  if (effectiveProvider !== "desidub") {
                    const targetEpNum = getFallbackEpisodeForLanguage(true, session.episode.number);
                    queueSession({ episodeNumber: targetEpNum, provider: "desidub", server: null, dubbed: true });
                  }
                }}
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  effectiveProvider === "desidub"
                    ? "bg-[#ff5500]/15 text-[#ff5500] border border-[#ff5500]/25 shadow-[0_0_8px_rgba(255,85,0,0.15)] cursor-default pointer-events-none"
                    : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70 cursor-pointer"
                }`}
              >
                <Captions className="w-3 h-3" aria-hidden="true" />
                Hindi
              </button>
            )}
          </div>

          {/* Watch Together pill — aligned to the right side, prominent */}
          <div className="flex items-center ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setPartyModalOpen(true)}
              className="group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] font-bold transition-all duration-200 hover:-translate-y-px hover:shadow-lg"
              style={partyRoomCode
                ? { borderColor: "rgba(16, 185, 129, 0.4)", background: "rgba(16, 185, 129, 0.08)", color: "#10b981", boxShadow: "0 0 16px rgba(16, 185, 129, 0.15)" }
                : { borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.60)" }}
            >
              {partyRoomCode ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              ) : (
                <Users className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
              )}
              {partyRoomCode ? (
                <span className="flex items-center gap-1.5">
                  Watch Party
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-emerald-400">
                    {partyRoomCode}
                  </span>
                </span>
              ) : (
                "WatchTogether"
              )}
            </button>
          </div>
        </div>

        {/* Server panel — Anivexa-style grouping, AnimePlay theme */}
        <div className="space-y-3 rounded-xl border border-white/[0.07] bg-black/20 p-3 sm:space-y-4 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider sm:rounded-full sm:px-4 sm:py-2 sm:text-[11px] transition-all"
              style={!activeIsEmbedServer
                ? { color: accentColor, borderColor: accentStyle(0.45), background: accentStyle(0.12) }
                : { color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
              }
            >
              <Tv2 className="h-3.5 w-3.5" aria-hidden="true" />
              Internal
              <span className="rounded-full px-2 py-0.5 text-[10px]" style={!activeIsEmbedServer ? { background: accentStyle(0.35), color: "#fff" } : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                {internalServerCount}
              </span>
            </div>
            {externalServerCount > 0 && (
              <button
                type="button"
                onClick={() => setShowEmbedServers((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/65 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:rounded-full sm:px-4 sm:py-2 sm:text-[11px] btn-press-active"
                aria-expanded={embedServersOpen}
                aria-controls="embed-server-options"
                title="External embed servers"
                style={activeIsEmbedServer || embedServersOpen ? { color: accentColor, borderColor: accentStyle(0.35), background: accentStyle(0.08) } : undefined}
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

          <div className="space-y-2.5 sm:space-y-3">
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

        {/* Share and playback diagnostics */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
          <p className="text-[10px] text-white/25">
            {reportStatus === "sent"
              ? "✓ Stream reported — refreshing in background"
              : reportStatus === "error"
                ? "⚠ Report failed — please try again"
                : "Stream not working?"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shareEpisode}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[10px] font-bold text-white/55 transition-all duration-200 hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              {shareStatus === "copied" ? "Link copied" : shareStatus === "shared" ? "Shared" : shareStatus === "error" ? "Try again" : "Share"}
            </button>
            <button
              id="report-stream-btn"
              type="button"
              disabled={reportStatus === "sending" || reportStatus === "sent" || !session.anime.anilistId}
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
                  if (res.ok) window.setTimeout(() => setReportStatus("idle"), 8000);
                } catch {
                  setReportStatus("error");
                }
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                reportStatus === "sent"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : reportStatus === "sending"
                    ? "border-white/8 bg-white/5 text-white/30"
                    : "border-white/10 bg-white/[0.035] text-white/55 hover:-translate-y-px hover:border-amber-500/35 hover:bg-amber-500/[0.08] hover:text-amber-300"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {reportStatus === "sending" ? "Sending…" : reportStatus === "sent" ? "Reported" : "Bug report"}
            </button>
          </div>
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

        <div className="space-y-4 px-3 sm:space-y-5 sm:px-0 xl:hidden">
          {partyRoomCode && (
            <div className="animate-modal-in">
              <WatchPartyPanel
                roomCode={partyRoomCode}
                memberId={partyMemberId}
                memberName={partyMemberName}
                isHost={partyIsHost}
                accentColor={accentColor}
                currentTime={partyCurrentTime}
                isPlaying={partyIsPlaying}
                currentEpisode={session.episode.number}
                callbacks={partyCallbacks()}
                onLeave={handleLeaveRoom}
              />
            </div>
          )}

          <CommentSection
            animeId={session.anime.id}
            episodeNumber={session.episode.number}
            currentUserId={resolvedCurrentUserId}
            mobileSummary
            accentColor={accentColor}
            onTimestampClick={() => {
              document.querySelector("iframe")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />

          {episodePanel}

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
          {/* Watch Party panel — shown when a room is active */}
          {partyRoomCode && (
            <WatchPartyPanel
              roomCode={partyRoomCode}
              memberId={partyMemberId}
              memberName={partyMemberName}
              isHost={partyIsHost}
              accentColor={accentColor}
              currentTime={partyCurrentTime}
              isPlaying={partyIsPlaying}
              currentEpisode={session.episode.number}
              callbacks={partyCallbacks()}
              onLeave={handleLeaveRoom}
            />
          )}
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

    {/* Watch Party Modal */}
    {partyModalOpen && (
      <WatchPartyModal
        animeId={session.anime.id}
        animeTitle={session.anime.title}
        animePoster={session.anime.poster || undefined}
        episodeNumber={session.episode.number}
        memberId={partyMemberId}
        memberName={partyMemberName}
        accentColor={accentColor}
        activeRoomCode={partyRoomCode}
        onLeaveRoom={handleLeaveRoom}
        onClose={() => setPartyModalOpen(false)}
        onRoomReady={(code, isHost, roomAnimeId, roomEpisodeNumber) => {
          if (roomAnimeId && (roomAnimeId !== session.anime.id || roomEpisodeNumber !== session.episode.number)) {
            sessionStorage.setItem("watch-party-active-room-code", code);
            sessionStorage.setItem("watch-party-is-host", isHost ? "true" : "false");
            window.location.assign(`/anime/${roomAnimeId}/watch?ep=${roomEpisodeNumber}`);
          } else {
            setPartyRoomCode(code);
            setPartyIsHost(isHost);
            setPartyModalOpen(false);
          }
        }}
      />
    )}
    </>
  );
}
