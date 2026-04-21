"use client";

import CommentSection from "@/components/anime/CommentSection";
import ProviderBadge from "@/components/anime/ProviderBadge";
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
import { getFallbackWatchTargets } from "@/lib/anime/fallback";
import type {
  AnimeSeasonEntry,
  CatalogAnime,
  EpisodeModel,
  ProviderId,
  ServerOption,
  SubtitleTrack,
  WatchSessionModel,
} from "@/lib/anime/types";
import type { AnilistMedia } from "@/lib/anilist/api";
import { humanizeProviderId } from "@/lib/anime/utils";
import {
  trackEpisodeWatch,
  updateEpisodeProgress,
  getEpisodeProgress,
  getWatchedEpisodes,
} from "@/lib/anime/watch-history";
import Hls from "hls.js";
import {
  AlertTriangle,
  Bookmark,
  Captions,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Expand,
  Eye,
  Info,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Play,
  PlayCircle,
  RefreshCcw,
  Search,
  SkipForward,
  Tag,
  Tv2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";

interface ResolveParams {
  animeId: string;
  episodeNumber: number;
  provider: string;
  episodeId: string;
  dubbed: boolean;
  server: string;
}

interface WatchExperienceProps {
  initialSession: WatchSessionModel;
  resolveParams?: ResolveParams;
  recommendations?: AnilistMedia[] | null;
  currentUserId?: string | null;
}

interface SessionRequest {
  episodeNumber: number;
  provider?: ProviderId | null;
  dubbed?: boolean;
  server?: string | null;
}

type SkipWindow = { start: number; end: number } | null;
type QualityOption = { value: string; label: string; level: number | null };
type AudioTrackOption = { value: string; label: string; track: number | null };
type SessionPlaybackMode = "preserve" | "embed" | "direct";

const STORAGE_KEYS = {
  preferEmbed: "animekai-watch:prefer-embed",
  autoNext: "animekai-watch:auto-next",
  autoSkip: "animekai-watch:auto-skip",
  autoPlay: "animekai-watch:auto-play",
} as const;

const PLAYER_FEEDBACK_MS = 320;
const RESOLVE_SOURCE_TIMEOUT_MS = 5500;
const DIRECT_UPGRADE_TIMEOUT_MS = 6000;

function buildWatchSessionUrl(session: WatchSessionModel, request: SessionRequest): string {
  const params = new URLSearchParams();
  params.set("animeId", session.anime.id);
  params.set("episodeNumber", String(request.episodeNumber));
  if (request.provider) params.set("provider", request.provider);
  if (request.dubbed) params.set("dub", "1");
  if (request.server) params.set("server", request.server);
  return `/api/watch-session?${params.toString()}`;
}

function hasDirectPlaybackSource(session: WatchSessionModel): boolean {
  return Boolean(session.source?.proxiedUrl || session.source?.url);
}

function shouldUseEmbedPlayback(session: WatchSessionModel): boolean {
  if (!session.source?.iframeUrl) return false;
  return true;
}

function resolveSessionShowEmbed(
  nextSession: WatchSessionModel,
  currentShowEmbed: boolean,
  mode: SessionPlaybackMode = "preserve",
): boolean {
  if (!nextSession.source?.iframeUrl) return false;
  if (!hasDirectPlaybackSource(nextSession)) return true;
  if (mode === "embed") return true;
  if (mode === "direct") return false;
  return currentShowEmbed;
}

/* ── Client-side session cache ─────────────────────
   Keeps up to 20 recently fetched sessions in memory.
   Going back to a previously visited episode is instant. */
const SESSION_CACHE_MAX = 20;
const sessionCache = new Map<string, { data: WatchSessionModel; ts: number }>();

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

function setCachedSession(url: string, data: WatchSessionModel): void {
  // Evict oldest if full
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldest = [...sessionCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) sessionCache.delete(oldest[0]);
  }
  sessionCache.set(url, { data, ts: Date.now() });
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function normalizeSkipWindow(value?: { start: number; end: number } | null): SkipWindow {
  if (!value) return null;
  const start = Number(value.start);
  const end = Number(value.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const normalizedStart = Math.min(start, end);
  const normalizedEnd = Math.max(start, end);
  if (normalizedEnd - normalizedStart < 3) return null;
  return { start: normalizedStart, end: normalizedEnd };
}

function subtitleValue(track: SubtitleTrack): string {
  return `${track.url}::${track.label}`;
}

function qualityOptionValue(level: number | null): string {
  return level === null ? "auto" : `level:${level}`;
}

function buildQualityOptions(levels: Hls["levels"]): QualityOption[] {
  if (!levels.length) return [];
  return [
    { value: qualityOptionValue(null), label: "Quality: Auto", level: null },
    ...levels.map((level, index) => {
      const parts: string[] = [];
      if (Number.isFinite(level.height) && level.height > 0) {
        parts.push(`${level.height}p`);
      }
      if (Number.isFinite(level.bitrate) && level.bitrate > 0) {
        parts.push(`${Math.round(level.bitrate / 1000)} kbps`);
      }
      return {
        value: qualityOptionValue(index),
        label: parts.length > 0 ? parts.join(" · ") : `Level ${index + 1}`,
        level: index,
      };
    }),
  ];
}

function buildAudioTrackOptions(tracks: Hls["audioTracks"]): AudioTrackOption[] {
  if (!tracks.length) return [];
  return [
    { value: "audio:auto", label: "Audio: Default", track: null },
    ...tracks.map((track, index) => {
      const label = [track.name, track.lang].filter(Boolean).join(" · ") || `Track ${index + 1}`;
      return {
        value: `audio:${index}`,
        label,
        track: index,
      };
    }),
  ];
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

/* ────────────────────────────────────────────────
   Buffering Status Text — cycles through phases
   like a real streaming player
   ──────────────────────────────────────────────── */
const BUFFERING_MESSAGES = [
  "Connecting to servers",
  "Finding best quality",
  "Buffering",
  "Almost ready",
];

function BufferingText() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((p) => (p + 1) % BUFFERING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return <>{BUFFERING_MESSAGES[idx]}</>;
}

/* ════════════════════════════════════════════════
   MAIN: WatchExperience
   ════════════════════════════════════════════════ */
export default function WatchExperience({ initialSession, resolveParams, recommendations = null, currentUserId }: WatchExperienceProps) {
  const initialDirectAvailable = hasDirectPlaybackSource(initialSession);
  const initialRecommendations = recommendations ?? null;
  const [session, setSession] = useState(initialSession);
  const [isPending, startTransition] = useTransition();
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(null);
  const [preferEmbeddedPlayback, setPreferEmbeddedPlayback] = useState(true);
  const [showEmbed, setShowEmbed] = useState(shouldUseEmbedPlayback(initialSession));
  const [autoNextEnabled, setAutoNextEnabled] = useState(true);
  const [autoSkipEnabled, setAutoSkipEnabled] = useState(true);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [playerActivated, setPlayerActivated] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isResolvingStream, setIsResolvingStream] = useState(
    Boolean(resolveParams) &&
      !initialDirectAvailable &&
      !initialSession.source?.iframeUrl &&
      Boolean(initialSession.episode.idByProvider?.[initialSession.provider]),
  );
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [selectedSubtitle, setSelectedSubtitle] = useState("off");
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(qualityOptionValue(null));
  const [audioTrackOptions, setAudioTrackOptions] = useState<AudioTrackOption[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState("audio:auto");
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<number>>(new Set());
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [activeEmbedLoaded, setActiveEmbedLoaded] = useState(false);
  const [activeDirectReady, setActiveDirectReady] = useState(initialDirectAvailable);
  const [playerFeedbackVisible, setPlayerFeedbackVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pendingVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingHlsRef = useRef<Hls | null>(null);
  const triedTargetsRef = useRef<Set<string>>(new Set());
  const skipRef = useRef({ intro: false, outro: false });
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directUpgradeTimeoutRef = useRef<number | null>(null);
  const pendingSessionKeyRef = useRef<string | null>(null);
  const pendingSessionModeRef = useRef<SessionPlaybackMode>("preserve");
  const autoResolveKeyRef = useRef<string | null>(null);
  const resolveRequestIdRef = useRef(0);
  const resolveAbortControllerRef = useRef<AbortController | null>(null);
  const resumePlaybackOnDirectRef = useRef(initialDirectAvailable);
  const playerFeedbackStartRef = useRef(Date.now());
  const manualEmbedModeRef = useRef(false);
  const [deferredRecommendations, setDeferredRecommendations] = useState<AnilistMedia[] | null>(initialRecommendations);
  const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<string | null>(currentUserId ?? null);

  const embedAvailable = Boolean(session.source?.iframeUrl);
  const directSourceUrl = session.source?.proxiedUrl || session.source?.url || null;
  const directAvailable = Boolean(directSourceUrl);
  const canRequestEnhancedPlayback = Boolean(session.episode.idByProvider?.[session.provider]);
  const canToggleDirectStream = embedAvailable && (directAvailable || canRequestEnhancedPlayback);
  const canUseEmbedFallback = embedAvailable;
  const cameFromAnilistCatalog =
    session.anime.id.startsWith("anilist~") || session.anime.href.includes("/anime/anilist~");
  const mappingUnavailable =
    cameFromAnilistCatalog &&
    (session.attempts.some(
      (attempt) => attempt.provider === "animekai" && /No provider mapping available/i.test(attempt.message),
    ) ||
      session.fallbackHistory.some((entry) => /animekai:\s*No provider mapping available/i.test(entry)));
  const introWindow = normalizeSkipWindow(session.intro);
  const outroWindow = normalizeSkipWindow(session.outro);
  const [pendingSession, setPendingSession] = useState<WatchSessionModel | null>(null);
  const pendingEmbedUrl = pendingSession?.source?.iframeUrl || null;
  const pendingDirectSourceUrl = pendingSession?.source?.proxiedUrl || pendingSession?.source?.url || null;
  const pendingDirectIsHls = Boolean(pendingSession?.source?.isM3U8);
  const animeGenresKey = session.anime.genres.join("|");
  const activePlayerSurfaceKey = [
    session.anime.id,
    session.episode.number,
    session.provider,
    session.activeServerId || "",
    session.source?.iframeUrl || "",
    directSourceUrl || "",
    showEmbed ? "embed" : "direct",
  ].join("|");
  const embedLayerVisible = Boolean(session.source?.iframeUrl) && (showEmbed || !activeDirectReady);
  const directLayerVisible = directAvailable && !showEmbed;
  const clearDirectUpgradeTimeout = useEffectEvent(() => {
    if (directUpgradeTimeoutRef.current) {
      window.clearTimeout(directUpgradeTimeoutRef.current);
      directUpgradeTimeoutRef.current = null;
    }
  });
  const cancelResolveRequest = useEffectEvent(() => {
    if (resolveAbortControllerRef.current) {
      resolveAbortControllerRef.current.abort();
      resolveAbortControllerRef.current = null;
    }
  });

  useEffect(() => {
    return () => {
      cancelResolveRequest();
      clearDirectUpgradeTimeout();
      if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
      if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
      if (pendingCommitTimerRef.current) clearTimeout(pendingCommitTimerRef.current);
    };
  }, [cancelResolveRequest, clearDirectUpgradeTimeout]);

  /* ── localStorage sync ───────────────────────── */
  useEffect(() => {
    setPreferEmbeddedPlayback(readStoredBoolean(STORAGE_KEYS.preferEmbed, true));
    setAutoNextEnabled(readStoredBoolean(STORAGE_KEYS.autoNext, true));
    setAutoSkipEnabled(readStoredBoolean(STORAGE_KEYS.autoSkip, true));
    setAutoPlayEnabled(readStoredBoolean(STORAGE_KEYS.autoPlay, false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.preferEmbed, String(preferEmbeddedPlayback));
  }, [preferEmbeddedPlayback]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.autoNext, String(autoNextEnabled));
  }, [autoNextEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.autoSkip, String(autoSkipEnabled));
  }, [autoSkipEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.autoPlay, String(autoPlayEnabled));
  }, [autoPlayEnabled]);

  /* ── Session changes ─────────────────────────── */
  useEffect(() => {
    cancelResolveRequest();
    clearDirectUpgradeTimeout();
    setSession(initialSession);
    setPendingSession(null);
    pendingSessionKeyRef.current = null;
    pendingSessionModeRef.current = "preserve";
    autoResolveKeyRef.current = null;
    resolveRequestIdRef.current += 1;
    resumePlaybackOnDirectRef.current = hasDirectPlaybackSource(initialSession);
    manualEmbedModeRef.current = false;
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
    setPlaybackMessage(null);
    setShowEmbed(shouldUseEmbedPlayback(initialSession));
    setPlayerActivated(true);
    setIsRecovering(false);
    setIsSessionLoading(false);
    setIsResolvingStream(
      Boolean(resolveParams) &&
        !hasDirectPlaybackSource(initialSession) &&
        !initialSession.source?.iframeUrl &&
        Boolean(initialSession.episode.idByProvider?.[initialSession.provider]),
    );
    setActiveEmbedLoaded(false);
    setActiveDirectReady(hasDirectPlaybackSource(initialSession) && !initialSession.source?.iframeUrl);
    setPlayerFeedbackVisible(true);
    playerFeedbackStartRef.current = Date.now();
    setSelectedSubtitle(initialSession.subtitles[0] ? subtitleValue(initialSession.subtitles[0]) : "off");
    setQualityOptions([]);
    setSelectedQuality(qualityOptionValue(null));
    setAudioTrackOptions([]);
    setSelectedAudioTrack("audio:auto");
    skipRef.current = { intro: false, outro: false };
    triedTargetsRef.current.clear();
  }, [cancelResolveRequest, clearDirectUpgradeTimeout, initialSession, resolveParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (session.anime.anilistId) params.set("anilistId", String(session.anime.anilistId));
    if (session.anime.title) params.set("title", session.anime.title);
    if (session.anime.genres.length > 0) params.set("genres", session.anime.genres.join(","));

    const controller = new AbortController();

    setDeferredRecommendations(null);

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

  useEffect(() => {
    playerFeedbackStartRef.current = Date.now();
    setPlayerFeedbackVisible(true);
    setActiveEmbedLoaded(false);
    setActiveDirectReady(showEmbed ? false : !directAvailable);
  }, [activePlayerSurfaceKey, directAvailable, showEmbed]);

  useEffect(() => {
    if (!playerFeedbackVisible) return;

    const remaining = Math.max(0, PLAYER_FEEDBACK_MS - (Date.now() - playerFeedbackStartRef.current));
    const timer = window.setTimeout(() => {
      setPlayerFeedbackVisible(false);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [activePlayerSurfaceKey, playerFeedbackVisible]);

  const resolveEnhancedPlayback = useEffectEvent(async (options?: {
    activate?: boolean;
    silent?: boolean;
    provider?: string;
    episodeNumber?: number;
    dubbed?: boolean;
    server?: string;
  }): Promise<boolean> => {
    const provider = options?.provider || session.provider;
    const body = {
      animeId: session.anime.id,
      episodeNumber: options?.episodeNumber ?? session.episode.number,
      provider,
      episodeId: session.episode.idByProvider?.[provider as ProviderId] || "",
      dubbed: options?.dubbed ?? session.dubbed,
      server: options?.server ?? session.activeServerId ?? "",
    };
    const resolveAttemptKey = [
      body.animeId,
      body.episodeNumber,
      body.provider,
      body.episodeId || "no-episode-id",
      body.dubbed ? "dub" : "sub",
      body.server || "default-server",
    ].join("|");

    if (autoResolveKeyRef.current === resolveAttemptKey) {
      if (!options?.silent) {
        setPlaybackMessage("Enhanced playback already timed out for this session, so we kept the embedded player.");
      }
      return false;
    }

    autoResolveKeyRef.current = resolveAttemptKey;
    const requestId = resolveRequestIdRef.current + 1;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, RESOLVE_SOURCE_TIMEOUT_MS);

    resolveRequestIdRef.current = requestId;
    cancelResolveRequest();
    resolveAbortControllerRef.current = controller;

    setIsResolvingStream(true);

    try {
      const res = await fetch("/api/resolve-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (!options?.silent) {
          setPlaybackMessage("Failed to load the enhanced player");
        }
        return false;
      }

      const data = await res.json();
      if (requestId !== resolveRequestIdRef.current) {
        return false;
      }

      const nextSession: WatchSessionModel = {
        ...session,
        source: data.source || session.source,
        subtitles: data.subtitles || session.subtitles,
        serverOptions: data.serverOptions || session.serverOptions,
        activeServerId: data.activeServerId || session.activeServerId,
        provider: data.provider || session.provider,
        intro: data.intro ?? session.intro,
        outro: data.outro ?? session.outro,
        watchAttempts: data.watchAttempts || session.watchAttempts,
      };

      if (data.subtitles?.[0]) {
        setSelectedSubtitle(subtitleValue(data.subtitles[0]));
      }

      const hasDirectUrl = hasDirectPlaybackSource(nextSession);
      if (hasDirectUrl) {
        const targetMode: SessionPlaybackMode =
          options?.activate ? "direct" : (nextSession.source?.iframeUrl ? "embed" : "direct");
        if (playerActivated || options?.activate) {
          resumePlaybackOnDirectRef.current = targetMode === "direct";
        }
        
        // Immediately commit without staging in the background if we're sticking to the embed
        if (targetMode === "embed") {
          commitSession(nextSession, targetMode);
        } else {
          stageOrCommitSession(nextSession, targetMode);
        }
        
        if (options?.activate) {
          setPlayerActivated(true);
          setPlaybackMessage("Enhanced player ready.");
        }
        return true;
      }

      setSession((prev) => ({
        ...prev,
        source: nextSession.source,
        subtitles: nextSession.subtitles,
        serverOptions: nextSession.serverOptions,
        activeServerId: nextSession.activeServerId,
        provider: nextSession.provider,
        intro: nextSession.intro,
        outro: nextSession.outro,
        watchAttempts: nextSession.watchAttempts,
      }));

      if (nextSession.source?.iframeUrl) {
        if (options?.activate) {
          setPlayerActivated(true);
        }
        setShowEmbed(true);
      }

      if (!options?.silent) {
        setPlaybackMessage("Enhanced player is not available for this episode yet.");
      }
      return false;
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (!options?.silent) {
        setPlaybackMessage(
          isAbort
            ? "Enhanced playback took too long, so we kept the faster embedded player."
            : "Connection error while loading the enhanced player",
        );
      }
      return false;
    } finally {
      window.clearTimeout(timeoutId);
      if (resolveAbortControllerRef.current === controller) {
        resolveAbortControllerRef.current = null;
      }
      if (requestId === resolveRequestIdRef.current) {
        setIsResolvingStream(false);
      }
    }
  });

  /* ── Auto-resolve after first paint until direct playback is ready ── */
  useEffect(() => {
    // Disabled automatic direct stream resolution if embed is available to prevent interruption
    if (!resolveParams || directAvailable || embedAvailable || !canRequestEnhancedPlayback) {
      // If we aren't going to resolve, make sure the loading state is cleared
      setIsResolvingStream(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void resolveEnhancedPlayback({
        silent: true,
        provider: resolveParams.provider || session.provider,
        episodeNumber: resolveParams.episodeNumber,
        dubbed: resolveParams.dubbed,
        server: resolveParams.server,
      }).then((ok) => {
        if (cancelled || ok || embedAvailable) return;
        setPlaybackMessage("No stream source available. Try a different server.");
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    canRequestEnhancedPlayback,
    directAvailable,
    embedAvailable,
    resolveEnhancedPlayback,
    resolveParams,
    session.activeServerId,
    session.anime.id,
    session.provider,
  ]);

  useEffect(() => {
    if (autoPlayEnabled && directAvailable && !embedAvailable) {
      setPlayerActivated(true);
    }
  }, [autoPlayEnabled, directAvailable, embedAvailable, session.episode.number]);

  const prefetchSession = useEffectEvent((request: SessionRequest) => {
    const url = buildWatchSessionUrl(session, request);
    if (getCachedSession(url)) return;

    void fetch(url, { priority: "low" as RequestPriority })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as WatchSessionModel | null;
        if (payload) {
          setCachedSession(url, payload);
        }
      })
      .catch(() => undefined);
  });

  /* ── Watch history tracking ─────────────────── */
  useEffect(() => {
    // Track episode view
    trackEpisodeWatch(session.anime.id, session.episode.number, {
      title: session.anime.title,
      poster: session.anime.poster ?? null,
      href: session.anime.href,
      provider: session.provider,
    });
    // Load watched episodes set
    setWatchedEpisodes(getWatchedEpisodes(session.anime.id));
  }, [session.anime.id, session.anime.title, session.anime.poster, session.anime.href, session.provider, session.episode.number]);

  /* ── Prefetch nearby episodes + opposite dub/sub (cache warming) ─── */
  useEffect(() => {
    const currentIdx = session.episodes.findIndex((ep) => ep.number === session.episode.number);
    if (currentIdx < 0) return;

    const nearbyEpisodes = new Set<number>();
    for (const offset of [-1, 1, 2, 3]) {
      const episode = session.episodes[currentIdx + offset];
      if (episode) nearbyEpisodes.add(episode.number);
    }

    const timer = setTimeout(() => {
      for (const episodeNumber of nearbyEpisodes) {
        prefetchSession({
          episodeNumber,
          provider: session.provider,
          dubbed: session.dubbed,
          server: null,
        });
      }
      prefetchSession({
        episodeNumber: session.episode.number,
        provider: session.provider,
        dubbed: !session.dubbed,
        server: null,
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [prefetchSession, session.anime.id, session.dubbed, session.episode.number, session.episodes, session.provider]);

  /* ── Prefetch other available servers ──────── */
  useEffect(() => {
    if (session.serverOptions.length <= 1) return;

    // Wait 4 seconds, then prefetch non-active servers
    const timer = setTimeout(() => {
      for (const srv of session.serverOptions) {
        if (srv.id === session.activeServerId) continue; // Skip the current one
        prefetchSession({
          episodeNumber: session.episode.number,
          provider: session.provider,
          dubbed: srv.category === "dub" || srv.category === "raw",
          server: srv.id,
        });
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [prefetchSession, session.anime.id, session.activeServerId, session.episode.number, session.provider, session.serverOptions]);

  /* ── Resume from saved progress ────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || showEmbed || !playerActivated) return;
    const saved = getEpisodeProgress(session.anime.id, session.episode.number);
    if (saved && saved.progress > 0.02 && saved.progress < 0.95 && saved.duration > 0) {
      const resumeTime = saved.progress * saved.duration;
      const onCanPlay = () => {
        if (video.currentTime < 5) { // Only resume if near start
          video.currentTime = resumeTime;
        }
        video.removeEventListener("canplay", onCanPlay);
      };
      video.addEventListener("canplay", onCanPlay);
      return () => video.removeEventListener("canplay", onCanPlay);
    }
  }, [playerActivated, session.anime.id, session.episode.number, showEmbed]);

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

  /* ── Keyboard shortcuts ────────────────────── */
  useEffect(() => {
    if (!playerActivated || showEmbed) return;
    const video = videoRef.current;
    if (!video) return;

    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          break;
        case "arrowleft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "arrowright":
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
          break;
        case "arrowup":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case "arrowdown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case "f":
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            video.requestFullscreen?.();
          }
          break;
        case "m":
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case "n":
          if (nextEpisode) {
            e.preventDefault();
            goToEpisode(nextEpisode.number);
          }
          break;
        case "p":
          if (previousEpisode) {
            e.preventDefault();
            goToEpisode(previousEpisode.number);
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playerActivated, showEmbed]);

  /* ── Player lifecycle ────────────────────────── */
  const destroyPlayer = useEffectEvent(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  });

  const destroyPendingPlayer = useEffectEvent(() => {
    if (pendingHlsRef.current) {
      pendingHlsRef.current.destroy();
      pendingHlsRef.current = null;
    }
    const video = pendingVideoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  });

  const syncAdaptivePlaybackUi = useEffectEvent((hls: Hls | null) => {
    if (!hls) {
      setQualityOptions([]);
      setSelectedQuality(qualityOptionValue(null));
      setAudioTrackOptions([]);
      setSelectedAudioTrack("audio:auto");
      return;
    }

    const nextQualityOptions = buildQualityOptions(hls.levels);
    setQualityOptions(nextQualityOptions);
    setSelectedQuality((current) =>
      nextQualityOptions.some((option) => option.value === current) ? current : qualityOptionValue(null),
    );

    const nextAudioTrackOptions = buildAudioTrackOptions(hls.audioTracks);
    setAudioTrackOptions(nextAudioTrackOptions);
    setSelectedAudioTrack((current) =>
      nextAudioTrackOptions.some((option) => option.value === current) ? current : "audio:auto",
    );
  });

  const fetchSession = useEffectEvent(async (request: SessionRequest): Promise<WatchSessionModel> => {
    const url = buildWatchSessionUrl(session, request);

    // Check client-side cache first (instant!)
    const cached = getCachedSession(url);
    if (cached) return cached;

    const response = await fetch(url);
    const payload = (await response.json().catch(() => null)) as WatchSessionModel | { message?: string } | null;
    if (!response.ok) {
      throw new Error(
        payload && "message" in payload && payload.message
          ? payload.message
          : `Watch session failed with ${response.status}`
      );
    }

    const result = payload as WatchSessionModel;
    setCachedSession(url, result); // Store for future use
    return result;
  });

  const clearPendingCommit = useEffectEvent(() => {
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
  });

  const commitSession = useEffectEvent((
    nextSession: WatchSessionModel,
    mode: SessionPlaybackMode = "preserve",
  ) => {
    const defaultSubtitle = nextSession.subtitles[0] ? subtitleValue(nextSession.subtitles[0]) : "off";
    clearPendingCommit();
    cancelResolveRequest();
    clearDirectUpgradeTimeout();
    destroyPendingPlayer();
    pendingSessionKeyRef.current = null;
    pendingSessionModeRef.current = "preserve";
    resolveRequestIdRef.current += 1;
    setPendingSession(null);
    setIsSessionLoading(false);

    startTransition(() => {
      setSession((previous) => mergeWatchSessions(previous, nextSession));
      setPlaybackMessage(null);
      setShowEmbed(resolveSessionShowEmbed(nextSession, showEmbed, mode));
      setSelectedSubtitle((current) =>
        current !== "off" && nextSession.subtitles.some((subtitle) => subtitleValue(subtitle) === current)
          ? current
          : defaultSubtitle,
      );
    });

    skipRef.current = { intro: false, outro: false };
  });

  const stageOrCommitSession = useEffectEvent((
    nextSession: WatchSessionModel,
    mode: SessionPlaybackMode = "preserve",
  ) => {
    const nextKey = sessionViewKey(nextSession);
    const targetEmbed = resolveSessionShowEmbed(nextSession, showEmbed, mode);
    const canStagePlayer = !targetEmbed && Boolean(nextSession.source?.proxiedUrl || nextSession.source?.url);

    if (!canStagePlayer) {
      commitSession(nextSession, mode);
      return;
    }

    clearPendingCommit();
    pendingSessionKeyRef.current = nextKey;
    pendingSessionModeRef.current = mode;
    setPendingSession(nextSession);
    pendingCommitTimerRef.current = setTimeout(() => {
      if (pendingSessionKeyRef.current === nextKey) {
        commitSession(nextSession, mode);
      }
    }, 4000);
  });

  const applySession = useEffectEvent(async (
    request: SessionRequest,
    mode: SessionPlaybackMode = "preserve",
  ): Promise<WatchSessionModel> => {
    const nextSession = await fetchSession(request);
    stageOrCommitSession(nextSession, mode);
    return nextSession;
  });

  const handlePendingPlayerReady = useEffectEvent((readyKey: string) => {
    if (pendingSessionKeyRef.current !== readyKey || !pendingSession) {
      return;
    }

    if (sessionViewKey(pendingSession) !== readyKey) {
      return;
    }

    commitSession(pendingSession, pendingSessionModeRef.current);
  });

  useEffect(() => {
    const pending = pendingSession;
    const pendingVideo = pendingVideoRef.current;

    if (!pending || !pendingDirectSourceUrl || !pendingVideo) {
      destroyPendingPlayer();
      return;
    }

    let cancelled = false;
    const readyKey = sessionViewKey(pending);
    const markReady = () => {
      if (cancelled) return;
      handlePendingPlayerReady(readyKey);
    };

    const resetPendingVideo = () => {
      pendingVideo.pause();
      pendingVideo.removeAttribute("src");
      pendingVideo.load();
    };

    if (pendingDirectIsHls) {
      if (pendingVideo.canPlayType("application/vnd.apple.mpegurl")) {
        const onCanPlay = () => {
          pendingVideo.removeEventListener("canplay", onCanPlay);
          markReady();
        };

        pendingVideo.addEventListener("canplay", onCanPlay);
        pendingVideo.src = pendingDirectSourceUrl;
        pendingVideo.load();

        return () => {
          cancelled = true;
          pendingVideo.removeEventListener("canplay", onCanPlay);
          resetPendingVideo();
        };
      }

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        pendingHlsRef.current = hls;
        hls.attachMedia(pendingVideo);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (!cancelled) {
            hls.loadSource(pendingDirectSourceUrl);
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, markReady);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal || cancelled) return;
        });

        return () => {
          cancelled = true;
          if (pendingHlsRef.current === hls) {
            pendingHlsRef.current = null;
          }
          hls.destroy();
          resetPendingVideo();
        };
      }
    }

    const onCanPlay = () => {
      pendingVideo.removeEventListener("canplay", onCanPlay);
      markReady();
    };

    pendingVideo.addEventListener("canplay", onCanPlay);
    pendingVideo.src = pendingDirectSourceUrl;
    pendingVideo.load();

    return () => {
      cancelled = true;
      pendingVideo.removeEventListener("canplay", onCanPlay);
      resetPendingVideo();
    };
  }, [destroyPendingPlayer, handlePendingPlayerReady, pendingDirectIsHls, pendingDirectSourceUrl, pendingSession]);

  const activateEmbedFallback = useEffectEvent((message?: string): boolean => {
    if (!session.source?.iframeUrl) return false;
    manualEmbedModeRef.current = true;
    cancelResolveRequest();
    clearDirectUpgradeTimeout();
    clearPendingCommit();
    destroyPendingPlayer();
    pendingSessionKeyRef.current = null;
    pendingSessionModeRef.current = "preserve";
    setPendingSession(null);
    setPreferEmbeddedPlayback(true);
    destroyPlayer();
    setPlayerActivated(true);
    setShowEmbed(true);
    setIsRecovering(false);
    setIsResolvingStream(false);
    setPlaybackMessage(message || `Switched to the embedded ${humanizeProviderId(session.provider)} player.`);
    return true;
  });

  const activateDirectMode = useEffectEvent((message?: string) => {
    if (!directAvailable) return;
    manualEmbedModeRef.current = false;
    clearDirectUpgradeTimeout();
    setPreferEmbeddedPlayback(false);
    resumePlaybackOnDirectRef.current = true;
    setPlayerActivated(true);
    setShowEmbed(false);
    setPlaybackMessage(message || "Enhanced player enabled. Auto-skip, subtitle selection, and auto-next are available here.");
  });

  useEffect(() => {
    clearDirectUpgradeTimeout();
    if (showEmbed || !directAvailable || activeDirectReady) return;

    directUpgradeTimeoutRef.current = window.setTimeout(() => {
      if (session.source?.iframeUrl) {
        activateEmbedFallback("Enhanced playback took too long, so we kept the embedded player.");
        return;
      }

      setIsResolvingStream(false);
      setPlaybackMessage("Enhanced playback is taking longer than expected.");
    }, DIRECT_UPGRADE_TIMEOUT_MS);

    return () => {
      clearDirectUpgradeTimeout();
    };
  }, [
    activateEmbedFallback,
    activeDirectReady,
    clearDirectUpgradeTimeout,
    directAvailable,
    session.source?.iframeUrl,
    showEmbed,
  ]);

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

    triedTargetsRef.current.clear();
    cancelResolveRequest();
    clearDirectUpgradeTimeout();
    autoResolveKeyRef.current = null;
    resolveRequestIdRef.current += 1;
    setIsResolvingStream(false);
    setIsSessionLoading(true);
    void applySession(normalizedRequest, showEmbed ? "embed" : "direct")
      .catch((error) => {
        setPlaybackMessage(error instanceof Error ? error.message : "Unable to refresh watch session.");
        setIsSessionLoading(false);
      })
      .finally(() => undefined);
  };

  const prefetchEpisode = useEffectEvent((episodeNumber: number) => {
    if (episodeNumber === session.episode.number) return;
    prefetchSession({
      episodeNumber,
      provider: session.provider,
      dubbed: session.dubbed,
      server: null,
    });
  });

  const recoverPlayback = useEffectEvent(async () => {
    if (!showEmbed && activateEmbedFallback(`Direct stream failed on ${humanizeProviderId(session.provider)}. Switched to the embedded player.`)) {
      return;
    }
    const fallbackTargets = getFallbackWatchTargets(session);
    setIsRecovering(true);

    for (const target of fallbackTargets) {
      const key = `${session.episode.number}:${target.provider}:${target.server || "provider"}`;
      if (triedTargetsRef.current.has(key)) continue;
      triedTargetsRef.current.add(key);

      try {
        const nextSession = await applySession({
          episodeNumber: session.episode.number,
          provider: target.provider,
          dubbed: session.dubbed,
          server: target.server ?? null,
        }, "direct");

        if (nextSession.source?.iframeUrl) {
          activateEmbedFallback(`Switched to ${humanizeProviderId(nextSession.provider)} embedded playback.`);
          return;
        }

        const nextDirectUrl = nextSession.source?.proxiedUrl || nextSession.source?.url;
        if (nextDirectUrl) {
          activateDirectMode(`Recovered playback via ${humanizeProviderId(nextSession.provider)}.`);
          setIsRecovering(false);
          return;
        }
      } catch (error) {
        setPlaybackMessage(error instanceof Error ? error.message : "Tried a fallback source and it failed.");
      }
    }

    setIsRecovering(false);
    setPlaybackMessage("All automatic fallbacks were exhausted. Try another provider or server.");
  });

  /* ── HLS / M3U8 setup ───────────────────────── */
  useEffect(() => {
    destroyPlayer();
    if (showEmbed || !playerActivated || !directAvailable) return;
    const video = videoRef.current;
    if (!video || !directSourceUrl) return;

    const maybeAutoPlay = () => {
      const shouldResumePlayback = resumePlaybackOnDirectRef.current;
      resumePlaybackOnDirectRef.current = false;
      if (!autoPlayEnabled && !shouldResumePlayback) return;
      void video.play().catch(() => undefined);
    };

    if (session.source?.isM3U8) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        setQualityOptions([]);
        setAudioTrackOptions([]);
        video.src = directSourceUrl;
        video.load();
        maybeAutoPlay();
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(directSourceUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setActiveDirectReady(true);
          syncAdaptivePlaybackUi(hls);
          maybeAutoPlay();
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          syncAdaptivePlaybackUi(hls);
        });
        hls.on(Hls.Events.LEVELS_UPDATED, () => {
          syncAdaptivePlaybackUi(hls);
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          setPlaybackMessage("The current stream failed. Trying the next fallback...");
          void recoverPlayback();
        });
      } else {
        setQualityOptions([]);
        setAudioTrackOptions([]);
        setPlaybackMessage("This browser cannot play the proxied HLS stream.");
      }
    } else {
      setQualityOptions([]);
      setAudioTrackOptions([]);
      video.src = directSourceUrl;
      video.load();
      maybeAutoPlay();
    }

    return () => { destroyPlayer(); };
  }, [autoPlayEnabled, destroyPlayer, directAvailable, directSourceUrl, playerActivated, recoverPlayback, session.source?.isM3U8, showEmbed, syncAdaptivePlaybackUi]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;

    const qualityLevel = qualityOptions.find((option) => option.value === selectedQuality)?.level ?? null;
    if (qualityLevel === null) {
      hls.currentLevel = -1;
      hls.nextLevel = -1;
      hls.loadLevel = -1;
    } else {
      hls.currentLevel = qualityLevel;
      hls.nextLevel = qualityLevel;
      hls.loadLevel = qualityLevel;
    }

    const audioTrack = audioTrackOptions.find((option) => option.value === selectedAudioTrack)?.track ?? null;
    if (audioTrack !== null && hls.audioTrack !== audioTrack) {
      hls.audioTrack = audioTrack;
    }
  }, [audioTrackOptions, qualityOptions, selectedAudioTrack, selectedQuality, session.episode.number]);

  /* ── Subtitle track sync ─────────────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || showEmbed || !playerActivated) return;

    const applyTrackSelection = () => {
      for (let index = 0; index < video.textTracks.length; index += 1) {
        const textTrack = video.textTracks[index];
        const subtitle = session.subtitles[index];
        if (!subtitle) { textTrack.mode = "disabled"; continue; }
        textTrack.mode = subtitleValue(subtitle) === selectedSubtitle ? "showing" : "disabled";
      }
    };

    applyTrackSelection();
    video.addEventListener("loadedmetadata", applyTrackSelection);
    return () => { video.removeEventListener("loadedmetadata", applyTrackSelection); };
  }, [playerActivated, selectedSubtitle, session.subtitles, showEmbed]);

  /* ── Skip logic + progress saving ──────────── */
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || showEmbed) return;

    // Save progress (throttled)
    if (video.duration > 0) {
      if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
      progressSaveTimer.current = setTimeout(() => {
        updateEpisodeProgress(
          session.anime.id,
          session.episode.number,
          video.currentTime / video.duration,
          video.duration
        );
      }, 10000); // Save every 10 seconds
    }

    // Auto-skip intro/outro
    if (!autoSkipEnabled) return;

    if (introWindow && !skipRef.current.intro && video.currentTime >= introWindow.start && video.currentTime < introWindow.end) {
      video.currentTime = introWindow.end;
      skipRef.current.intro = true;
      setPlaybackMessage("Skipped the intro.");
      return;
    }

    if (outroWindow && !skipRef.current.outro && video.currentTime >= outroWindow.start && video.currentTime < outroWindow.end) {
      video.currentTime = outroWindow.end;
      skipRef.current.outro = true;
      setPlaybackMessage("Skipped the outro.");
    }
  };

  const manualSkip = (window: SkipWindow, label: string) => {
    const video = videoRef.current;
    if (!video || !window || showEmbed) return;
    video.currentTime = window.end;
    if (label === "intro") skipRef.current.intro = true;
    if (label === "outro") skipRef.current.outro = true;
    setPlaybackMessage(`Skipped the ${label}.`);
  };

  /* ── Episode navigation ──────────────────────── */
  const currentEpisodeIndex = session.episodes.findIndex((episode) => episode.number === session.episode.number);
  const previousEpisode = currentEpisodeIndex > 0 ? session.episodes[currentEpisodeIndex - 1] : null;
  const nextEpisode =
    currentEpisodeIndex >= 0 && currentEpisodeIndex < session.episodes.length - 1
      ? session.episodes[currentEpisodeIndex + 1]
      : null;

  const handleEnded = () => {
    // Save 100% progress
    const video = videoRef.current;
    if (video && video.duration > 0) {
      updateEpisodeProgress(session.anime.id, session.episode.number, 1, video.duration);
      setWatchedEpisodes(getWatchedEpisodes(session.anime.id));
    }

    if (!autoNextEnabled || !nextEpisode) return;

    // 5-second countdown before auto-advancing
    setAutoNextCountdown(5);
    let count = 5;
    autoNextTimerRef.current = setInterval(() => {
      count -= 1;
      setAutoNextCountdown(count);
      if (count <= 0) {
        if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
        setAutoNextCountdown(null);
        queueSession({
          episodeNumber: nextEpisode.number,
          provider: session.provider,
          dubbed: session.dubbed,
          server: null,
        });
      }
    }, 1000);
  };

  const cancelAutoNext = () => {
    if (autoNextTimerRef.current) clearInterval(autoNextTimerRef.current);
    setAutoNextCountdown(null);
  };

  const onVideoError = () => {
    setPlaybackMessage("The current source failed. Trying the next fallback...");
    void recoverPlayback();
  };

  const heroImage =
    session.anime.banner ||
    session.anime.poster ||
    "https://placehold.co/1600x900/09090b/f5f5f5?text=AnimeKAI";
  const isSessionTransitioning = isSessionLoading || isPending;

  const filteredEpisodes = session.episodes.filter((episode) => {
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
  const { isDesidub, subServers, dubServers, hindiServers } = summarizeServerGroups(session.serverOptions);
  const mainFallback = session.availableProviders.find((p) => p !== "desidub") || "animekai";
  const showHindi = session.availableProviders.includes("desidub") || session.provider === "desidub";
  const floatingStatus = isRecovering
    ? "Trying fallbacks..."
    : isSessionTransitioning
      ? "Refreshing session..."
      : null;
  const playerFeedbackTitle =
    !embedAvailable && !directAvailable && isResolvingStream
      ? "Preparing playback"
      : showEmbed
        ? activeEmbedLoaded
          ? "Player ready"
          : "Opening player"
        : directAvailable && !activeDirectReady
          ? "Loading video"
          : "Player ready";
  const playerFeedbackHint =
    !embedAvailable && !directAvailable && isResolvingStream
      ? "Resolving the best stream in the background."
      : showEmbed
        ? "Starting with the fastest available player."
        : directAvailable && !activeDirectReady
          ? "Loading direct stream."
          : "Playback is ready.";

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

          {session.source?.iframeUrl && (
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                embedLayerVisible ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <iframe
                src={session.source.iframeUrl}
                className="h-full w-full"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                loading="eager"
                title={`${session.anime.title} embedded player`}
                onLoad={() => setActiveEmbedLoaded(true)}
              />
            </div>
          )}

          {directAvailable && (
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                directLayerVisible && activeDirectReady ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <video
                ref={videoRef}
                controls
                autoPlay={autoPlayEnabled}
                preload="auto"
                playsInline
                crossOrigin="anonymous"
                className="h-full w-full bg-black object-contain"
                onError={onVideoError}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                onLoadedData={() => setActiveDirectReady(true)}
                onCanPlay={() => setActiveDirectReady(true)}
                poster={heroImage}
              >
                {session.subtitles.map((subtitle, index) => {
                  const trackLang = subtitle.lang.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6) || `sub${index}`;
                  return (
                    <track
                      key={subtitleValue(subtitle)}
                      src={subtitle.url}
                      kind="subtitles"
                      srcLang={trackLang}
                      label={subtitle.label}
                      default={index === 0}
                    />
                  );
                })}
              </video>

              {autoNextCountdown !== null && nextEpisode && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-20 animate-in fade-in duration-300">
                  <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                      <circle
                        cx="40" cy="40" r="36" fill="none" stroke="#ff5500" strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 36}`}
                        strokeDashoffset={`${2 * Math.PI * 36 * (1 - autoNextCountdown / 5)}`}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-linear"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">
                      {autoNextCountdown}
                    </span>
                  </div>
                  <p className="text-white/80 text-sm font-medium">
                    Next: <span className="text-white font-bold">Episode {nextEpisode.number}</span>
                  </p>
                  <p className="text-white/50 text-xs">{nextEpisode.title}</p>
                  <div className="flex gap-3 mt-2">
                    <button
                      type="button"
                      onClick={cancelAutoNext}
                      className="px-4 py-2 text-xs font-bold text-white/70 bg-white/10 rounded-lg hover:bg-white/15 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        cancelAutoNext();
                        goToEpisode(nextEpisode.number);
                      }}
                      className="px-4 py-2 text-xs font-bold text-white bg-[#ff5500] rounded-lg hover:bg-[#ff6600] transition-colors"
                    >
                      Play Now
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!embedAvailable && !directAvailable && !isResolvingStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0c]/95 px-8 text-center">
              <div className="rounded-full border border-white/10 bg-white/6 p-4 text-[#ff5500]">
                <Tv2 className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">
                  {mappingUnavailable ? "Not available to watch yet" : "No stream available"}
                </h2>
                <p className="max-w-md text-sm text-white/60">
                  {mappingUnavailable
                    ? "This title exists on AniList, but we do not have a working provider mapping for it yet."
                    : "The active provider did not return a source. Try refreshing or switching providers."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {mappingUnavailable ? (
                  <Link
                    href={session.anime.href}
                    className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#e64d00] transition-colors"
                  >
                    <Info className="h-4 w-4" />
                    Back to details
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => queueSession({ episodeNumber: session.episode.number, provider: session.provider, dubbed: session.dubbed, server: null })}
                    className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#e64d00] transition-colors"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Refresh source
                  </button>
                )}
                {canUseEmbedFallback && (
                  <button
                    type="button"
                    onClick={() => activateEmbedFallback("Switched to the embedded player.")}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
                  >
                    <MonitorPlay className="h-4 w-4" />
                    Embed fallback
                  </button>
                )}
              </div>
            </div>
          )}

          {playerFeedbackVisible && (embedAvailable || directAvailable || isResolvingStream) && (
            <div className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300">
              <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
              <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.06),transparent)] opacity-70 animate-pulse" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute inset-x-4 bottom-4 md:inset-x-6 md:bottom-6 flex items-end justify-between gap-4">
                <div className="max-w-md space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">
                    <span className="h-2 w-2 rounded-full bg-[#ff5500] animate-pulse" />
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
                    <div className="h-full w-full bg-gradient-to-r from-[#ff5500] via-[#ff7733] to-[#ff5500] animate-[bufferBar_1.8s_ease-in-out_infinite]" />
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
        {pendingSession && pendingDirectSourceUrl && (
          <div className="pointer-events-none absolute inset-0 opacity-0">
            <video
              key={sessionViewKey(pendingSession)}
              ref={pendingVideoRef}
              preload="auto"
              playsInline
              muted
              crossOrigin="anonymous"
              className="h-full w-full"
            />
          </div>
        )}
      </div>

      {/* ── CONTROLS BAR (AnimeKAI-style) ───────── */}
      <div className="bg-[#111113] border-x border-white/8 px-2 md:px-4 py-1.5">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <div className="flex items-center gap-0.5 flex-wrap">
            {canToggleDirectStream && (
              <ControlBtn
                icon={showEmbed ? (isResolvingStream ? LoaderCircle : Maximize2) : MonitorPlay}
                label={showEmbed ? (isResolvingStream ? "Loading..." : "Enhanced") : "Embed"}
                disabled={showEmbed ? isResolvingStream : false}
                onClick={() => {
                  if (showEmbed) {
                    if (directAvailable) {
                      activateDirectMode("Enhanced player enabled.");
                    } else if (canRequestEnhancedPlayback) {
                      void resolveEnhancedPlayback({ activate: true });
                    }
                  } else {
                    activateEmbedFallback("Embed player restored.");
                  }
                }}
              />
            )}
            <ControlBtn
              icon={focusMode ? Minimize2 : Eye}
              label={focusMode ? "Exit Focus" : "Focus"}
              active={focusMode}
              accent={focusMode}
              onClick={() => {
                setFocusMode((v) => !v);
                const el = document.querySelector("video") || document.querySelector("iframe");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
            <div className="w-px h-5 bg-white/8 mx-1 hidden sm:block" />
            <ControlBtn
              icon={SkipForward}
              label="AutoNext"
              active={autoNextEnabled}
              accent
              disabled={!directAvailable}
              onClick={() => setAutoNextEnabled((v) => !v)}
            />
            <ControlBtn
              icon={Play}
              label="AutoPlay"
              active={autoPlayEnabled}
              accent
              disabled={!directAvailable}
              onClick={() => setAutoPlayEnabled((v) => !v)}
            />
            <ControlBtn
              icon={SkipForward}
              label="AutoSkip"
              active={autoSkipEnabled}
              accent
              disabled={!directAvailable || (!introWindow && !outroWindow)}
              onClick={() => setAutoSkipEnabled((v) => !v)}
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
            <ControlBtn icon={Bookmark} label="Bookmark" />
            {session.source?.iframeUrl && (
              <a
                href={session.source.iframeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/8 rounded-md transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Source</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── EPISODE INFO + SERVER STRIP ─────────── */}
      <div className="relative bg-[#131315] border-x border-white/8 px-4 md:px-5 py-3 space-y-3">
        {floatingStatus && (
          <div className="pointer-events-none absolute right-4 top-3 z-10 hidden items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white/60 backdrop-blur md:inline-flex">
            <LoaderCircle className="h-3 w-3 animate-spin text-[#ff5500]" />
            <span>{floatingStatus}</span>
          </div>
        )}
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
            {/* Sub/Dub mode toggle buttons */}
            <button
              type="button"
              onClick={() => {
                if (session.dubbed) {
                  queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: null, dubbed: false });
                }
              }}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                !session.dubbed
                  ? "bg-[#ff5500]/15 text-[#ff5500] border border-[#ff5500]/25 shadow-[0_0_8px_rgba(255,85,0,0.15)]"
                  : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <Captions className="w-3 h-3" />
              Sub
            </button>
            <button
              type="button"
              onClick={() => {
                if (!session.dubbed) {
                  queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: null, dubbed: true });
                }
              }}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                session.dubbed
                  ? "bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/25 shadow-[0_0_8px_rgba(74,222,128,0.15)]"
                  : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <Captions className="w-3 h-3" />
              Dub
            </button>
          </div>
        </div>

        {/* Server rows */}
        <div className="space-y-2">
          {/* Sub servers */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-bold text-white/40 w-12 uppercase tracking-wider shrink-0">Sub</span>
            <div className="flex flex-wrap gap-1.5">
              {subServers.length > 0 ? (
                subServers.map((entry) => (
                  <ServerButton
                    key={entry.id}
                    label={entry.label}
                    active={!session.dubbed && session.activeServerId === entry.id}
                    onClick={() => queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: entry.id, dubbed: false })}
                  />
                ))
              ) : (
                <ServerButton
                  label={`Try ${humanizeProviderId(mainFallback)} sub`}
                  active={false}
                  onClick={() => queueSession({ episodeNumber: session.episode.number, provider: mainFallback, server: null, dubbed: false })}
                />
              )}
            </div>
          </div>

          {/* Dub servers */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-bold text-white/40 w-12 uppercase tracking-wider shrink-0">Dub</span>
            <div className="flex flex-wrap gap-1.5">
              {dubServers.length > 0 ? (
                dubServers.map((entry) => (
                  <ServerButton
                    key={entry.id}
                    label={entry.label}
                    active={session.dubbed && session.activeServerId === entry.id && !isDesidub}
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
                      active={isDesidub && session.activeServerId === entry.id}
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
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{playbackMessage}</p>
            </div>
          </div>
        )}

        {/* Subtitles & skip */}
        {playerActivated && !showEmbed && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {introWindow && (
              <button
                type="button"
                onClick={() => manualSkip(introWindow, "intro")}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#ff5500]/20 bg-[#ff5500]/8 px-3 py-1.5 text-[11px] font-semibold text-[#ff5500] hover:bg-[#ff5500]/15 transition-colors"
              >
                <SkipForward className="h-3 w-3" />
                Skip Intro
              </button>
            )}
            {outroWindow && (
              <button
                type="button"
                onClick={() => manualSkip(outroWindow, "outro")}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#ff5500]/20 bg-[#ff5500]/8 px-3 py-1.5 text-[11px] font-semibold text-[#ff5500] hover:bg-[#ff5500]/15 transition-colors"
              >
                <SkipForward className="h-3 w-3" />
                Skip Outro
              </button>
            )}
            {directAvailable && qualityOptions.length > 1 && (
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-[#ff5500]/30 transition-colors"
              >
                {qualityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            {directAvailable && audioTrackOptions.length > 1 && (
              <select
                value={selectedAudioTrack}
                onChange={(e) => setSelectedAudioTrack(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-[#ff5500]/30 transition-colors"
              >
                {audioTrackOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            {session.subtitles.length > 0 && (
              <select
                value={selectedSubtitle}
                onChange={(e) => setSelectedSubtitle(e.target.value)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-[#ff5500]/30 transition-colors"
              >
                <option value="off">Subtitles Off</option>
                {session.subtitles.map((sub) => (
                  <option key={subtitleValue(sub)} value={subtitleValue(sub)}>
                    {sub.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ── EPISODE GRID ─────────────────────────── */}
      <div className="rounded-b-2xl border border-white/8 border-t-0 bg-[#111113] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">Episodes</h2>
            <span className="text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
              {session.episodes.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
              <input
                type="text"
                placeholder="Find..."
                value={episodeQuery}
                onChange={(e) => setEpisodeQuery(e.target.value)}
                className="bg-white/[0.04] border border-white/8 rounded-lg text-xs text-white/80 pl-7 pr-3 py-1.5 w-28 focus:w-40 transition-all outline-none focus:border-[#ff5500]/40"
              />
            </div>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${
                showEpisodeList
                  ? "bg-[#ff5500]/10 text-[#ff5500] border-[#ff5500]/25"
                  : "bg-white/[0.04] text-white/50 border-white/8 hover:text-white"
              }`}
              onClick={() => setShowEpisodeList(!showEpisodeList)}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showEpisodeList ? "rotate-180" : ""}`} />
              List
            </button>
          </div>
        </div>

        {/* Number grid */}
        <div className="px-4 py-3">
          <EpisodeNumberGrid
            episodes={filteredEpisodes}
            activeNumber={session.episode.number}
            onSelect={goToEpisode}
            onHover={prefetchEpisode}
            watchedSet={watchedEpisodes}
          />
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
                      ? "bg-[#ff5500]/8 border-l-2 border-l-[#ff5500]"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    active ? "bg-[#ff5500] text-white" : watched ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/50"
                  }`}>
                    {watched && !active ? "✓" : episode.number}
                  </div>
                  {episode.image && (
                    <div className="w-20 h-12 rounded-lg overflow-hidden shrink-0 border border-white/5">
                      <img src={episode.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate leading-snug ${
                      active ? "text-white" : "text-white/80 group-hover/ep:text-white"
                    }`}>
                      {episode.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {episode.isFiller && <span className="text-[9px] font-bold uppercase bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">Filler</span>}
                      {episode.isSubbed && <span className="text-[9px] font-bold uppercase bg-[#ff5500]/10 text-[#ff5500] px-1.5 py-0.5 rounded">Sub</span>}
                      {episode.isDubbed && <span className="text-[9px] font-bold uppercase bg-[#4ade80]/10 text-[#4ade80] px-1.5 py-0.5 rounded">Dub</span>}
                      {watched && <span className="text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Watched</span>}
                    </div>
                  </div>
                  {active && <div className="w-2 h-2 rounded-full bg-[#ff5500] animate-pulse shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SEASONS ─────────────────────────────── */}
      <SeasonRail seasons={session.seasons} activeHref={session.anime.href} />

      {/* ── ANIME INFO + RECOMMENDATIONS ─────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <WatchAnimeDetailsPanel session={session} heroImage={heroImage} />
        <div>
          <WatchRecommendationsPanel recommendations={deferredRecommendations} />
        </div>
      </div>

      {/* ── COMMENTS ─────────────────────────────── */}
      <div className="mt-6">
        <CommentSection
          animeId={session.anime.id}
          episodeNumber={session.episode.number}
          currentUserId={resolvedCurrentUserId}
          onTimestampClick={(time) => {
            const video = videoRef.current;
            if (video) {
              video.currentTime = time;
              video.play().catch(() => undefined);
              video.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
        />
      </div>
    </div>
    </>
  );
}
