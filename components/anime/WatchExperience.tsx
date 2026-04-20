"use client";

import AttemptTrail from "@/components/anime/AttemptTrail";
import CommentSection from "@/components/anime/CommentSection";
import ProviderBadge from "@/components/anime/ProviderBadge";
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
import { anilistTitle, anilistRating, anilistFormat, encodeAnilistRouteId, type AnilistMedia } from "@/lib/anilist/api";
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
  Calendar,
  Captions,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Expand,
  Eye,
  Film,
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
  Star,
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
  recommendations?: AnilistMedia[];
  currentUserId?: string | null;
}

interface SessionRequest {
  episodeNumber: number;
  provider?: ProviderId | null;
  dubbed?: boolean;
  server?: string | null;
}

type SkipWindow = { start: number; end: number } | null;

const STORAGE_KEYS = {
  preferEmbed: "animekai-watch:prefer-embed",
  autoNext: "animekai-watch:auto-next",
  autoSkip: "animekai-watch:auto-skip",
  autoPlay: "animekai-watch:auto-play",
} as const;

function buildWatchSessionUrl(session: WatchSessionModel, request: SessionRequest): string {
  const params = new URLSearchParams();
  params.set("animeId", session.anime.id);
  params.set("episodeNumber", String(request.episodeNumber));
  if (request.provider) params.set("provider", request.provider);
  if (request.dubbed) params.set("dub", "1");
  if (request.server) params.set("server", request.server);
  return `/api/watch-session?${params.toString()}`;
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
   Reusable: compact control button (icon + text)
   ──────────────────────────────────────────────── */
function ControlBtn({
  icon: Icon,
  label,
  active,
  accent,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-all
        rounded-md select-none whitespace-nowrap
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:bg-white/8"}
        ${active && accent ? "text-[#ff5500]" : active ? "text-white" : "text-white/60"}
      `}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────
   Season Rail 
   ──────────────────────────────────────────────── */
function SeasonRail({ seasons, activeHref }: { seasons: AnimeSeasonEntry[]; activeHref: string }) {
  if (seasons.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          Seasons
          <span className="text-xs font-medium text-white/40 bg-white/5 rounded-full px-2 py-0.5">
            {seasons.length}
          </span>
        </h2>
        <div className="flex gap-2">
          <button type="button" className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
        {seasons.map((season) => {
          const active = season.isActive || season.href === activeHref;
          return (
            <Link
              key={`${season.href}-${season.title}`}
              href={season.href}
              className={`group relative block min-w-[11rem] overflow-hidden rounded-xl border transition-all shrink-0 ${
                active
                  ? "border-[#ff5500]/50 bg-[#ff5500]/10"
                  : "border-white/8 bg-white/[0.03] hover:border-white/15"
              }`}
            >
              {season.poster ? (
                <div className="absolute inset-0">
                  <img
                    src={season.poster}
                    alt={season.title}
                    className="h-full w-full object-cover opacity-30 transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
                </div>
              ) : null}
              <div className="relative flex flex-col justify-end p-4 min-h-[7rem]">
                <p className="text-sm font-bold text-white">{season.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    active ? "bg-[#ff5500] text-white" : "bg-white/10 text-white/60"
                  }`}>
                    {season.episodeCount ? `${season.episodeCount} EPS` : season.episodeLabel || "Open"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   Episode Number Grid (AnimeKAI-style compact grid)
   ──────────────────────────────────────────────── */
function EpisodeNumberGrid({
  episodes,
  activeNumber,
  onSelect,
  onHover,
  watchedSet = new Set(),
}: {
  episodes: { number: number; title: string; isSubbed?: boolean; isDubbed?: boolean }[];
  activeNumber: number;
  onSelect: (num: number) => void;
  onHover?: (num: number) => void;
  watchedSet?: Set<number>;
}) {
  const [rangeStart, setRangeStart] = useState(0);
  const CHUNK_SIZE = 100;
  const totalChunks = Math.ceil(episodes.length / CHUNK_SIZE);

  // Auto-select the range containing the active episode
  useEffect(() => {
    const idx = episodes.findIndex((ep) => ep.number === activeNumber);
    if (idx >= 0) {
      setRangeStart(Math.floor(idx / CHUNK_SIZE) * CHUNK_SIZE);
    }
  }, [activeNumber, episodes]);

  const visibleEpisodes = episodes.slice(rangeStart, rangeStart + CHUNK_SIZE);
  const rangeLabel = `${String(episodes[rangeStart]?.number || 1).padStart(3, "0")}-${String(
    episodes[Math.min(rangeStart + CHUNK_SIZE - 1, episodes.length - 1)]?.number || CHUNK_SIZE
  ).padStart(3, "0")}`;

  return (
    <div>
      {/* Range selector */}
      {totalChunks > 1 && (
        <div className="flex items-center justify-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setRangeStart(Math.max(0, rangeStart - CHUNK_SIZE))}
            disabled={rangeStart === 0}
            className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-white/50 font-medium tracking-wider min-w-[5rem] text-center">
            {rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => setRangeStart(Math.min(episodes.length - 1, rangeStart + CHUNK_SIZE))}
            disabled={rangeStart + CHUNK_SIZE >= episodes.length}
            className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Episode grid */}
      <div className="flex flex-wrap gap-1.5">
        {visibleEpisodes.map((ep) => {
          const isActive = ep.number === activeNumber;
          const isWatched = watchedSet.has(ep.number);
          return (
            <button
              key={ep.number}
              type="button"
              onClick={() => onSelect(ep.number)}
              onMouseEnter={() => onHover?.(ep.number)}
              onFocus={() => onHover?.(ep.number)}
              title={`${ep.title}${isWatched ? " ✓ Watched" : ""}`}
              className={`
                relative w-10 h-9 rounded-md text-xs font-bold transition-all
                ${isActive
                  ? "bg-[#ff5500] text-white shadow-[0_0_12px_rgba(255,85,0,0.4)]"
                  : isWatched
                    ? "bg-emerald-500/15 text-emerald-400/80 border border-emerald-500/20 hover:bg-emerald-500/25"
                    : "bg-white/[0.06] text-white/60 hover:bg-white/12 hover:text-white border border-white/[0.06]"
                }
              `}
            >
              {ep.number}
              {isWatched && !isActive && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
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
export default function WatchExperience({ initialSession, resolveParams, recommendations = [], currentUserId }: WatchExperienceProps) {
  const [session, setSession] = useState(initialSession);
  const [isPending, startTransition] = useTransition();
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(null);
  const [preferEmbeddedPlayback, setPreferEmbeddedPlayback] = useState(true);
  const [showEmbed, setShowEmbed] = useState(Boolean(initialSession.source?.iframeUrl));
  const [autoNextEnabled, setAutoNextEnabled] = useState(true);
  const [autoSkipEnabled, setAutoSkipEnabled] = useState(true);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [playerActivated, setPlayerActivated] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isResolvingStream, setIsResolvingStream] = useState(!initialSession.source && !!resolveParams);
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [selectedSubtitle, setSelectedSubtitle] = useState("off");
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<number>>(new Set());
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const triedTargetsRef = useRef<Set<string>>(new Set());
  const skipRef = useRef({ intro: false, outro: false });
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSession(initialSession);
    setPlaybackMessage(null);
    setShowEmbed(Boolean(initialSession.source?.iframeUrl) && preferEmbeddedPlayback);
    setIsRecovering(false);
    setSelectedSubtitle(initialSession.subtitles[0] ? subtitleValue(initialSession.subtitles[0]) : "off");
    skipRef.current = { intro: false, outro: false };
    triedTargetsRef.current.clear();
  }, [initialSession, preferEmbeddedPlayback]);

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

    setIsResolvingStream(true);

    try {
      const res = await fetch("/api/resolve-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (!options?.silent) {
          setPlaybackMessage("Failed to load the enhanced player");
        }
        return false;
      }

      const data = await res.json();
      setSession((prev) => ({
        ...prev,
        source: data.source || prev.source,
        subtitles: data.subtitles || prev.subtitles,
        serverOptions: data.serverOptions || prev.serverOptions,
        activeServerId: data.activeServerId || prev.activeServerId,
        provider: data.provider || prev.provider,
        intro: data.intro ?? prev.intro,
        outro: data.outro ?? prev.outro,
        watchAttempts: data.watchAttempts || prev.watchAttempts,
      }));
      if (data.subtitles?.[0]) {
        setSelectedSubtitle(subtitleValue(data.subtitles[0]));
      }

      const hasDirectUrl = Boolean(data.source?.proxiedUrl || data.source?.url);
      if (hasDirectUrl) {
        if (options?.activate) {
          setPlayerActivated(true);
          setShowEmbed(false);
          setPlaybackMessage("Enhanced player ready.");
        }
        return true;
      }

      if (data.source?.iframeUrl && preferEmbeddedPlayback) {
        setShowEmbed(true);
      }

      if (!options?.silent) {
        setPlaybackMessage("Enhanced player is not available for this episode yet.");
      }
      return false;
    } catch {
      if (!options?.silent) {
        setPlaybackMessage("Connection error while loading the enhanced player");
      }
      return false;
    } finally {
      setIsResolvingStream(false);
    }
  });

  /* ── Auto-resolve only when no embed/direct source exists ── */
  useEffect(() => {
    if (!resolveParams || initialSession.source) return;

    let cancelled = false;

    (async () => {
      const ok = await resolveEnhancedPlayback({
        silent: true,
        provider: resolveParams.provider || session.provider,
        episodeNumber: resolveParams.episodeNumber,
        dubbed: resolveParams.dubbed,
        server: resolveParams.server,
      });
      if (cancelled || ok) return;
      setPlaybackMessage("No stream source available. Try a different server.");
    })();

    return () => { cancelled = true; };
  }, [initialSession.source, resolveEnhancedPlayback, resolveParams, session.provider]);

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

  const applySession = useEffectEvent(async (request: SessionRequest): Promise<WatchSessionModel> => {
    const nextSession = await fetchSession(request);
    const hasDirectUrl = Boolean(nextSession.source?.proxiedUrl || nextSession.source?.url);
    const defaultSubtitle = nextSession.subtitles[0] ? subtitleValue(nextSession.subtitles[0]) : "off";

    startTransition(() => {
      setSession((previous) => mergeWatchSessions(previous, nextSession));
      setPlaybackMessage(null);
      setShowEmbed(!hasDirectUrl && Boolean(nextSession.source?.iframeUrl) && preferEmbeddedPlayback);
      setSelectedSubtitle((current) =>
        current !== "off" && nextSession.subtitles.some((subtitle) => subtitleValue(subtitle) === current)
          ? current
          : defaultSubtitle,
      );
    });

    skipRef.current = { intro: false, outro: false };
    return nextSession;
  });

  const activateEmbedFallback = useEffectEvent((message?: string): boolean => {
    if (!session.source?.iframeUrl) return false;
    destroyPlayer();
    setPlayerActivated(true);
    setShowEmbed(true);
    setIsRecovering(false);
    setPlaybackMessage(message || `Switched to the embedded ${humanizeProviderId(session.provider)} player.`);
    return true;
  });

  const activateDirectMode = useEffectEvent((message?: string) => {
    if (!directAvailable) return;
    setPlayerActivated(true);
    setShowEmbed(false);
    setPlaybackMessage(message || "Enhanced player enabled. Auto-skip, subtitle selection, and auto-next are available here.");
  });

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
    setIsSessionLoading(true);
    void applySession(normalizedRequest)
      .catch((error) => {
        setPlaybackMessage(error instanceof Error ? error.message : "Unable to refresh watch session.");
      })
      .finally(() => {
        setIsSessionLoading(false);
      });
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
        });

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
      if (!autoPlayEnabled) return;
      void video.play().catch(() => undefined);
    };

    if (session.source?.isM3U8) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = directSourceUrl;
        video.load();
        maybeAutoPlay();
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(directSourceUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, maybeAutoPlay);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          setPlaybackMessage("The current stream failed. Trying the next fallback...");
          void recoverPlayback();
        });
      } else {
        setPlaybackMessage("This browser cannot play the proxied HLS stream.");
      }
    } else {
      video.src = directSourceUrl;
      video.load();
      maybeAutoPlay();
    }

    return () => { destroyPlayer(); };
  }, [autoPlayEnabled, destroyPlayer, directAvailable, directSourceUrl, playerActivated, recoverPlayback, session.source?.isM3U8, showEmbed]);

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
  const isDesidub = session.provider === "desidub";
  const subServers = isDesidub ? [] : session.serverOptions.filter((e) => e.category !== "dub" && e.category !== "raw");
  const dubServers = isDesidub ? [] : session.serverOptions.filter((e) => e.category === "dub" || e.category === "raw");
  const hindiServers = isDesidub ? session.serverOptions : [];
  const mainFallback = session.availableProviders.find((p) => p !== "desidub") || "animekai";
  const showHindi = session.availableProviders.includes("desidub") || isDesidub;

  const ServerBtn = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
        active
          ? "bg-[#4ade80] text-black border-[#4ade80]/60 shadow-[0_0_10px_rgba(74,222,128,0.2)]"
          : "bg-white/[0.04] text-white/60 border-white/8 hover:bg-white/8 hover:text-white hover:border-white/15"
      }`}
    >
      {label}
    </button>
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
      {/* ── VIDEO PLAYER ────────────────────────── */}
      <div className="rounded-t-2xl overflow-hidden border border-white/8 border-b-0 bg-black relative">
        {!playerActivated ? (
          /* ── THUMBNAIL + PLAY OVERLAY ── */
          <div
            role="button"
            tabIndex={0}
            aria-label="Play video"
            className="relative aspect-video bg-black group cursor-pointer"
            onClick={() => {
              // Always activate immediately — if source resolved, use best mode
              if (directAvailable) {
                activateDirectMode();
              } else if (embedAvailable) {
                setPlayerActivated(true);
                setShowEmbed(true);
              } else {
                // Still resolving — show loading animation, player will activate when ready
                setPlayerActivated(true);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (directAvailable) {
                  activateDirectMode();
                } else if (embedAvailable) {
                  setPlayerActivated(true);
                  setShowEmbed(true);
                } else {
                  setPlayerActivated(true);
                }
              }
            }}
          >
            <img
              src={heroImage}
              alt={session.anime.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
            {/* Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]" />

            {/* Play button — always clickable */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Pulse ring */}
                <div className="absolute inset-0 rounded-full bg-[#ff5500]/20 animate-ping" style={{ animationDuration: "2s" }} />
                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#ff5500]/90 backdrop-blur-sm flex items-center justify-center shadow-[0_0_40px_rgba(255,85,0,0.4)] transition-transform duration-300 group-hover:scale-110">
                  <Play className="w-7 h-7 md:w-8 md:h-8 text-white fill-white ml-1" />
                </div>
              </div>
            </div>

            {/* Bottom info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
              <p className="text-white/60 text-xs font-medium mb-1">
                {session.anime.title}
              </p>
              <p className="text-white text-sm md:text-base font-semibold">
                Episode {session.episode.number}: {session.episode.title}
              </p>
            </div>

            {/* Loading overlay (only during isPending episode switch) */}
            {isSessionTransitioning && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                <LoaderCircle className="w-10 h-10 text-[#ff5500] animate-spin" />
              </div>
            )}
          </div>
        ) : showEmbed && session.source?.iframeUrl ? (
          /* ── EMBEDDED PLAYER ── */
          <div className="aspect-video bg-black">
            <iframe
              src={session.source.iframeUrl}
              className="h-full w-full"
              allowFullScreen
              title={`${session.anime.title} embedded player`}
            />
          </div>
        ) : directAvailable ? (
          /* ── DIRECT / ENHANCED PLAYER ── */
          <div className="relative aspect-video bg-black">
            <video
              ref={videoRef}
              controls
              playsInline
              crossOrigin="anonymous"
              className="h-full w-full bg-black object-contain"
              onError={onVideoError}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
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

            {/* Auto-next countdown overlay */}
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
        ) : isResolvingStream ? (
          /* ── BUFFERING SCREEN (Netflix/Crunchyroll style) ── */
          <div className="relative aspect-video bg-black overflow-hidden">
            {/* Blurred poster background */}
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-20"
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/75" />

            {/* Center: Spinning ring + logo */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10">
              <div className="relative w-16 h-16 md:w-20 md:h-20">
                {/* Outer spinner ring */}
                <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 80 80" style={{ animationDuration: "1.5s" }}>
                  <defs>
                    <linearGradient id="spinnerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ff5500" stopOpacity="1" />
                      <stop offset="100%" stopColor="#ff5500" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  <circle
                    cx="40" cy="40" r="36" fill="none"
                    stroke="url(#spinnerGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.PI * 72 * 0.75} ${Math.PI * 72 * 0.25}`}
                  />
                </svg>
                {/* Inner pulse dot */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ff5500] animate-pulse" />
                </div>
              </div>

              {/* Status text with animated dots */}
              <div className="text-center space-y-1.5">
                <p className="text-white/90 text-sm font-semibold tracking-wide">
                  <BufferingText />
                </p>
                <div className="flex items-center justify-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#ff5500] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-[#ff5500] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 rounded-full bg-[#ff5500] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>

            {/* Bottom episode info (like Crunchyroll) */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-10">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-semibold mb-1">
                    Now Loading
                  </p>
                  <p className="text-white/80 text-xs md:text-sm font-medium">
                    {session.anime.title}
                  </p>
                  <p className="text-white text-sm md:text-base font-bold">
                    E{session.episode.number} · {session.episode.title}
                  </p>
                </div>
                <div className="text-[#ff5500] text-[10px] font-bold tracking-widest uppercase opacity-60">
                  AnimeKAI
                </div>
              </div>
              {/* Fake progress bar */}
              <div className="mt-3 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#ff5500] to-[#ff7733] rounded-full"
                  style={{
                    width: "100%",
                    animation: "bufferBar 3s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* ── NO SOURCE ── */
          <div className="flex aspect-video flex-col items-center justify-center gap-4 bg-[#0a0a0c] px-8 text-center">
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
      <div className="bg-[#131315] border-x border-white/8 px-4 md:px-5 py-3 space-y-3">
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
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
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
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
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
                  <ServerBtn
                    key={entry.id}
                    label={entry.label}
                    active={!session.dubbed && session.activeServerId === entry.id}
                    onClick={() => queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: entry.id, dubbed: false })}
                  />
                ))
              ) : (
                <ServerBtn
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
                  <ServerBtn
                    key={entry.id}
                    label={entry.label}
                    active={session.dubbed && session.activeServerId === entry.id && !isDesidub}
                    onClick={() => queueSession({ episodeNumber: session.episode.number, provider: session.provider, server: entry.id, dubbed: true })}
                  />
                ))
              ) : (
                <ServerBtn
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
                    <ServerBtn
                      key={entry.id}
                      label={entry.label}
                      active={isDesidub && session.activeServerId === entry.id}
                      onClick={() => queueSession({ episodeNumber: session.episode.number, provider: "desidub", server: entry.id, dubbed: true })}
                    />
                  ))
                ) : (
                  <ServerBtn
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
        {(playbackMessage || isSessionTransitioning || isRecovering) && (
          <div className="space-y-2 pt-1">
            {playbackMessage && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 p-3 text-xs text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>{playbackMessage}</p>
              </div>
            )}
            {(isSessionTransitioning || isRecovering) && (
              <div className="flex items-center gap-2 text-xs text-white/50">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                <span>{isRecovering ? "Trying fallbacks..." : "Refreshing session..."}</span>
              </div>
            )}
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
        {/* ── LEFT: Anime Details ── */}
        <div className="space-y-5">
          {/* Info Card */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="flex gap-5">
              {/* Poster */}
              <div className="shrink-0">
                <div className="w-28 md:w-36 aspect-[2/3] rounded-xl overflow-hidden border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative group/poster">
                  <img
                    src={session.anime.poster || heroImage}
                    alt={session.anime.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/poster:scale-105"
                  />
                  {session.anime.rating && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="text-[10px] font-bold text-white">{session.anime.rating}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <Link href={session.anime.href} className="group/title">
                    <h2 className="text-lg md:text-xl font-bold text-white group-hover/title:text-[#ff5500] transition-colors leading-tight">
                      {session.anime.title}
                    </h2>
                  </Link>
                  {session.anime.subtitle && (
                    <p className="text-xs text-white/30 mt-1">{session.anime.subtitle}</p>
                  )}
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {session.anime.type && (
                    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                      <Film className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Type</p>
                      <p className="text-xs font-bold text-white/80">{session.anime.type}</p>
                    </div>
                  )}
                  {session.anime.year && (
                    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                      <Calendar className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Year</p>
                      <p className="text-xs font-bold text-white/80">{session.anime.year}</p>
                    </div>
                  )}
                  {session.anime.status && (
                    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                      <Clock className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Status</p>
                      <p className={`text-xs font-bold ${
                        session.anime.status.toLowerCase().includes("airing") || session.anime.status.toLowerCase().includes("ongoing")
                          ? "text-green-400"
                          : "text-white/80"
                      }`}>{session.anime.status}</p>
                    </div>
                  )}
                  {session.anime.episodeCount && (
                    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                      <Tv2 className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Episodes</p>
                      <p className="text-xs font-bold text-white/80">{session.anime.episodeCount}</p>
                    </div>
                  )}
                </div>

                {/* Genres */}
                {session.anime.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {session.anime.genres.map((genre) => (
                      <Link
                        key={genre}
                        href={`/search?genre=${genre}`}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
                        style={{ color: "#ff5500", background: "rgba(255,85,0,0.1)", border: "1px solid rgba(255,85,0,0.15)" }}
                      >
                        {genre}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Quick links */}
                <div className="flex items-center gap-4 pt-2 border-t border-white/5">
                  <Link href={session.anime.href} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#ff5500] hover:text-[#ff7733] transition-colors">
                    <Info className="w-3.5 h-3.5" /> Full Details
                  </Link>
                  {session.anime.anilistId && (
                    <a href={`https://anilist.co/anime/${session.anime.anilistId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-white/35 hover:text-white/60 transition-colors">
                      <ExternalLink className="w-3 h-3" /> AniList
                    </a>
                  )}
                  {session.anime.malId && (
                    <a href={`https://myanimelist.net/anime/${session.anime.malId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-white/35 hover:text-white/60 transition-colors">
                      <ExternalLink className="w-3 h-3" /> MAL
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Synopsis */}
            {session.anime.description && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Synopsis</h3>
                <p className="text-[13px] text-white/50 leading-relaxed">
                  {session.anime.description.replace(/<[^>]+>/g, "")}
                </p>
              </div>
            )}
          </div>

          {/* Attempt Trail */}
          <AttemptTrail attempts={session.attempts} activeProvider={session.provider} label="Catalog fallback trail" />
        </div>

        {/* ── RIGHT: Recommendations ── */}
        <div>
          <div className="sticky top-20 space-y-4">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-white/40">
              {recommendations.length > 0 ? "Recommended for You" : "Trending Now"}
            </h2>

            {recommendations.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {recommendations.slice(0, 8).map((rec) => {
                  const recTitle = anilistTitle(rec);
                  const recRating = anilistRating(rec);
                  const recFormat = anilistFormat(rec);
                  const recHref = `/anime/${encodeAnilistRouteId(rec.id)}`;
                  const recImage = rec.coverImage.extraLarge || rec.coverImage.large;
                  const recColor = rec.coverImage.color || "#ff5500";
                  const isAiring = rec.status === "RELEASING";
                  return (
                    <Link
                      key={rec.id}
                      href={recHref}
                      className="group/rec flex flex-col gap-1.5 transition-all duration-300"
                    >
                      <div className="relative overflow-hidden rounded-xl bg-[#1a1c22]" style={{ aspectRatio: "2/3" }}>
                        <img
                          src={recImage}
                          alt={recTitle}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover/rec:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/rec:opacity-100 transition-opacity duration-300" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/rec:opacity-100 transition-opacity duration-300">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-2xl pl-0.5" style={{ backgroundColor: recColor }}>
                            <Play className="w-4 h-4 text-white fill-current" />
                          </div>
                        </div>
                        {/* Badges */}
                        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                          {isAiring && (
                            <span className="flex items-center gap-1 bg-[#ff5500] text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                              Airing
                            </span>
                          )}
                        </div>
                        {recRating && (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 backdrop-blur text-yellow-400 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            {recRating}
                          </div>
                        )}
                        {rec.episodes && (
                          <div className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur text-white/80 text-[8px] font-bold px-1.5 py-0.5 rounded-md">
                            {rec.nextAiringEpisode
                              ? `EP ${rec.nextAiringEpisode.episode - 1}/${rec.episodes}`
                              : `${rec.episodes} EP`}
                          </div>
                        )}
                      </div>
                      <div className="px-0.5">
                        <h3 className="text-[11px] font-bold text-white/80 group-hover/rec:text-white line-clamp-2 leading-tight transition-colors">
                          {recTitle}
                        </h3>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[9px] text-white/30 font-semibold uppercase tracking-wider">
                            {recFormat}
                          </span>
                          {rec.genres[0] && (
                            <span
                              className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ color: recColor, background: `${recColor}20` }}
                            >
                              {rec.genres[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── COMMENTS ─────────────────────────────── */}
      <div className="mt-6">
        <CommentSection
          animeId={session.anime.id}
          episodeNumber={session.episode.number}
          currentUserId={currentUserId}
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
