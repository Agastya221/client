"use client";

/**
 * Local-first watch tracking.
 *
 * Guests:
 * - everything stays in localStorage
 *
 * Signed-in users:
 * - local history stays available
 * - account history is merged into local on load
 * - local updates are mirrored back to the account in the background
 */

import {
  mergeWatchHistories,
  normalizeEpisodeProgress,
  watchHistoryToList,
  type EpisodeProgress,
  type WatchHistory,
  type WatchHistoryEntry,
} from "@/lib/anime/watch-history-shared";

const STORAGE_KEY = "animekai:watch-history";
const MAX_ENTRIES = 100;
const REMOTE_SYNC_DEBOUNCE_MS = 900;
const ANILIST_SYNC_THRESHOLD = 0.8;
export const WATCH_HISTORY_UPDATED_EVENT = "animekai:watch-history-updated";

type RemoteEpisodePayload = {
  animeId: string;
  anilistId?: number | null;
  episodeNumber: number;
  progress: number;
  duration: number;
  title: string;
  poster: string | null;
  href: string;
  provider: string;
  timestamp: number;
};

type AniListProgressPayload = {
  key: string;
  animeId: string;
  rawMediaId?: number;
  title: string;
  progress: number;
  status: "CURRENT" | "COMPLETED";
};

let authState: "unknown" | "guest" | "authenticated" = "unknown";
let hasHydratedFromAccount = false;
let hydrationPromise: Promise<void> | null = null;
let flushTimer: number | null = null;
let aniListFlushTimer: number | null = null;
let aniListFlushPromise: Promise<void> | null = null;
let aniListRetryDelayMs = 1_500;
let pendingClear = false;
const pendingAnimeRemovals = new Set<string>();
const pendingEpisodeUpserts = new Map<string, RemoteEpisodePayload>();
const pendingAniListProgress = new Map<string, AniListProgressPayload>();
const acknowledgedAniListProgress = new Map<string, number>();

const ANILIST_SYNC_RETRY_MAX_MS = 30_000;

/**
 * Keep the background queues aligned with Auth.js instead of trying to infer
 * authentication from cookies (the session cookie is HttpOnly).
 *
 * A user can be classified as a guest while Auth.js is still loading. When the
 * real session becomes authenticated, immediately resume every pending write,
 * including AniList progress that was queued before the session resolved.
 */
export function setWatchHistoryAuthentication(authenticated: boolean): void {
  authState = authenticated ? "authenticated" : "guest";

  if (!authenticated || typeof window === "undefined") return;

  if (pendingClear || pendingAnimeRemovals.size > 0 || pendingEpisodeUpserts.size > 0) {
    queueRemoteFlush();
  }
  if (pendingAniListProgress.size > 0) {
    scheduleAniListFlush();
  }
}

function scoreHistoryTitleQuality(title: string | null | undefined): number {
  const normalized = title?.trim();
  if (!normalized) return 0;

  let score = 1;
  if (/\s/.test(normalized)) score += 2;
  if (/[A-Z]/.test(normalized)) score += 1;
  if (normalized.length >= 12) score += 1;
  if (/^(anilist|animekai|desidub|hianime)[:~]/i.test(normalized)) score -= 4;
  if (/^[a-z0-9-]+$/i.test(normalized)) score -= 1;

  return score;
}

function shouldReplaceHistoryTitle(current: string | null | undefined, incoming: string | null | undefined): boolean {
  const normalizedIncoming = incoming?.trim();
  if (!normalizedIncoming) return false;
  return scoreHistoryTitleQuality(normalizedIncoming) >= scoreHistoryTitleQuality(current);
}

function readHistory(): WatchHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchHistory) : {};
  } catch {
    return {};
  }
}

function writeHistory(history: WatchHistory): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(history);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((left, right) => right[1].lastUpdated - left[1].lastUpdated);
      history = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    window.dispatchEvent(new CustomEvent(WATCH_HISTORY_UPDATED_EVENT));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function flattenHistory(history: WatchHistory): RemoteEpisodePayload[] {
  return Object.entries(history).flatMap(([animeId, entry]) =>
    Object.entries(entry.episodes).map(([episodeNumber, progress]) => ({
      animeId,
      episodeNumber: Number(episodeNumber),
      progress: normalizeEpisodeProgress(progress).progress,
      duration: normalizeEpisodeProgress(progress).duration,
      title: entry.title,
      poster: entry.poster,
      href: entry.href,
      provider: entry.provider,
      timestamp: normalizeEpisodeProgress(progress).timestamp || entry.lastUpdated,
    })),
  );
}

function queueRemoteFlush(): void {
  if (typeof window === "undefined") return;
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushRemoteSync();
  }, REMOTE_SYNC_DEBOUNCE_MS);
}

function isFinishedAnimeStatus(status: string | null | undefined): boolean {
  const normalized = String(status || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return normalized === "FINISHED" || normalized === "COMPLETED";
}

function resolveAniListMediaId(animeId: string, entry: WatchHistoryEntry): number | undefined {
  const explicitId = Number(entry.anilistId);
  if (Number.isInteger(explicitId) && explicitId > 0) return explicitId;

  const directMatch = animeId.match(/^anilist~(\d+)$/i);
  if (!directMatch) return undefined;
  const directId = Number(directMatch[1]);
  return Number.isInteger(directId) && directId > 0 ? directId : undefined;
}

function scheduleAniListFlush(delayMs = 0): void {
  if (typeof window === "undefined" || aniListFlushTimer !== null) return;
  aniListFlushTimer = window.setTimeout(() => {
    aniListFlushTimer = null;
    void flushAniListProgress();
  }, delayMs);
}

function queueAniListProgress(
  animeId: string,
  entry: WatchHistoryEntry,
  episodeNumber: number,
): void {
  if (typeof window === "undefined" || episodeNumber <= 0) return;

  const rawMediaId = resolveAniListMediaId(animeId, entry);
  const key = rawMediaId ? `anilist:${rawMediaId}` : `anime:${animeId}`;
  if ((acknowledgedAniListProgress.get(key) || 0) >= episodeNumber) return;

  const episodeCount = Number(entry.episodeCount);
  const completed =
    Number.isInteger(episodeCount) &&
    episodeCount > 0 &&
    episodeNumber >= episodeCount &&
    isFinishedAnimeStatus(entry.animeStatus);
  const existing = pendingAniListProgress.get(key);
  if (existing && existing.progress > episodeNumber) return;

  pendingAniListProgress.set(key, {
    key,
    animeId,
    rawMediaId,
    title: entry.title,
    progress: Math.max(existing?.progress || 0, episodeNumber),
    status: completed || existing?.status === "COMPLETED" ? "COMPLETED" : "CURRENT",
  });
  scheduleAniListFlush();
}

function queueLatestWatchedProgress(animeId: string, entry: WatchHistoryEntry): void {
  let latestWatchedEpisode = 0;
  for (const [episodeNumber, progress] of Object.entries(entry.episodes)) {
    if (normalizeEpisodeProgress(progress).progress >= ANILIST_SYNC_THRESHOLD) {
      latestWatchedEpisode = Math.max(latestWatchedEpisode, Number(episodeNumber) || 0);
    }
  }
  if (latestWatchedEpisode > 0) {
    queueAniListProgress(animeId, entry, latestWatchedEpisode);
  }
}

async function flushAniListProgress(): Promise<void> {
  if (typeof window === "undefined" || pendingAniListProgress.size === 0) return;
  if (aniListFlushPromise) return aniListFlushPromise;
  if (authState === "guest") return;

  aniListFlushPromise = (async () => {
    let shouldRetry = false;

    for (const pending of Array.from(pendingAniListProgress.values())) {
      try {
        const response = await fetch("/api/anilist/save-entry", {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawMediaId: pending.rawMediaId,
            animeId: pending.animeId,
            title: pending.title,
            progress: pending.progress,
            status: pending.status,
            monotonicProgress: true,
          }),
        });

        if (response.status === 401) {
          authState = "guest";
          return;
        }

        const payload = await response.json().catch(() => null) as {
          success?: boolean;
          entry?: { progress?: number };
          error?: string;
        } | null;

        if (!response.ok || !payload?.success) {
          shouldRetry = response.status >= 500 || response.status === 429;
          console.warn("[anilist-sync] Progress update failed", {
            status: response.status,
            animeId: pending.animeId,
            progress: pending.progress,
            error: payload?.error,
          });
          continue;
        }

        const acknowledgedProgress = Math.max(
          pending.progress,
          Number(payload.entry?.progress || 0),
        );
        acknowledgedAniListProgress.set(pending.key, acknowledgedProgress);
        if (pendingAniListProgress.get(pending.key) === pending) {
          pendingAniListProgress.delete(pending.key);
        }
        aniListRetryDelayMs = 1_500;
        authState = "authenticated";
      } catch (error) {
        shouldRetry = true;
        console.warn("[anilist-sync] Progress request failed", error);
      }
    }

    if (shouldRetry && pendingAniListProgress.size > 0) {
      scheduleAniListFlush(aniListRetryDelayMs);
      aniListRetryDelayMs = Math.min(ANILIST_SYNC_RETRY_MAX_MS, aniListRetryDelayMs * 2);
    }
  })().finally(() => {
    aniListFlushPromise = null;
  });

  return aniListFlushPromise;
}

function queueEpisodeUpsert(animeId: string, episodeNumber: number, syncToAniList = false): void {
  const history = readHistory();
  const entry = history[animeId];
  const episode = entry?.episodes?.[String(episodeNumber)];
  if (!entry || !episode) return;

  pendingAnimeRemovals.delete(animeId);
  pendingClear = false;
  pendingEpisodeUpserts.set(`${animeId}:${episodeNumber}`, {
    animeId,
    anilistId: entry.anilistId ?? null,
    episodeNumber,
    progress: normalizeEpisodeProgress(episode).progress,
    duration: normalizeEpisodeProgress(episode).duration,
    title: entry.title,
    poster: entry.poster,
    href: entry.href,
    provider: entry.provider,
    timestamp: normalizeEpisodeProgress(episode).timestamp || entry.lastUpdated,
  });

  if (syncToAniList) {
    queueAniListProgress(animeId, entry, episodeNumber);
  }

  queueRemoteFlush();
}

function queueAnimeRemoval(animeId: string): void {
  pendingAnimeRemovals.add(animeId);
  for (const key of Array.from(pendingEpisodeUpserts.keys())) {
    if (key.startsWith(`${animeId}:`)) {
      pendingEpisodeUpserts.delete(key);
    }
  }
  queueRemoteFlush();
}

async function flushRemoteSync(): Promise<void> {
  if (typeof window === "undefined") return;
  if (authState === "guest") return;

  try {
    if (pendingClear) {
      const response = await fetch("/api/watch-history", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        authState = "guest";
        return;
      }
      pendingClear = false;
    }

    for (const animeId of Array.from(pendingAnimeRemovals)) {
      const response = await fetch(`/api/watch-history?animeId=${encodeURIComponent(animeId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        authState = "guest";
        return;
      }
      pendingAnimeRemovals.delete(animeId);
    }

    if (pendingEpisodeUpserts.size > 0) {
      const response = await fetch("/api/watch-history", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: Array.from(pendingEpisodeUpserts.values()),
        }),
      });
      if (response.status === 401) {
        authState = "guest";
        return;
      }
      if (response.ok) {
        pendingEpisodeUpserts.clear();
        authState = "authenticated";
      }
    }
  } catch {
    // keep pending changes for the next successful flush
  }
}

export async function ensureWatchHistoryHydrated(): Promise<void> {
  if (typeof window === "undefined") return;
  if (hasHydratedFromAccount || authState === "guest") return;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      const response = await fetch("/api/watch-history", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 401) {
        authState = "guest";
        return;
      }

      if (!response.ok) {
        return;
      }

      authState = "authenticated";
      const payload = (await response.json().catch(() => null)) as { history?: WatchHistory } | null;
      const remoteHistory = payload?.history || {};
      const localHistory = readHistory();
      const merged = mergeWatchHistories(remoteHistory, localHistory);

      writeHistory(merged);
      hasHydratedFromAccount = true;

      const entries = flattenHistory(merged);
      if (entries.length > 0) {
        await fetch("/api/watch-history", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        }).catch(() => undefined);
      }
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

export function subscribeToWatchHistory(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleCustomUpdate = () => listener();
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(WATCH_HISTORY_UPDATED_EVENT, handleCustomUpdate);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(WATCH_HISTORY_UPDATED_EVENT, handleCustomUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}

export function trackEpisodeWatch(
  animeId: string,
  episodeNumber: number,
  meta: {
    title: string;
    poster: string | null;
    href: string;
    provider: string;
    anilistId?: number | null;
    episodeCount?: number | null;
    animeStatus?: string | null;
  },
): void {
  const history = readHistory();
  const existing = history[animeId] || {
    title: meta.title,
    poster: meta.poster,
    href: meta.href,
    provider: meta.provider,
    anilistId: meta.anilistId ?? null,
    episodeCount: meta.episodeCount ?? null,
    animeStatus: meta.animeStatus ?? null,
    lastEpisode: episodeNumber,
    lastUpdated: Date.now(),
    episodes: {},
  };

  const shouldAdoptIncomingIdentity = shouldReplaceHistoryTitle(existing.title, meta.title);

  if (shouldAdoptIncomingIdentity) {
    existing.title = meta.title.trim();
  }
  if (meta.poster && (!existing.poster || shouldAdoptIncomingIdentity)) {
    existing.poster = meta.poster;
  }
  if (meta.href && (!existing.href || shouldAdoptIncomingIdentity)) {
    existing.href = meta.href;
  }
  // Always update anilistId when we have a fresh numeric value
  if (meta.anilistId && !existing.anilistId) {
    existing.anilistId = meta.anilistId;
  }
  if (meta.episodeCount && meta.episodeCount > 0) {
    existing.episodeCount = meta.episodeCount;
  }
  if (meta.animeStatus) {
    existing.animeStatus = meta.animeStatus;
  }
  existing.provider = meta.provider || existing.provider;
  existing.lastEpisode = episodeNumber;
  existing.lastUpdated = Date.now();

  if (!existing.episodes[String(episodeNumber)]) {
    existing.episodes[String(episodeNumber)] = {
      progress: 0,
      duration: 0,
      timestamp: Date.now(),
    };
  }

  history[animeId] = existing;
  writeHistory(history);
  // Don't trigger AniList sync on page load — only when user actually watches (at threshold)
  queueEpisodeUpsert(animeId, episodeNumber, false);
  // Repair any completed local progress that a previous one-shot sync failed to
  // deliver. The server enforces monotonic progress, so this never moves a
  // user's AniList entry backwards.
  queueLatestWatchedProgress(animeId, existing);
}

export function updateEpisodeProgress(
  animeId: string,
  episodeNumber: number,
  progress: number,
  duration: number,
): void {
  const history = readHistory();
  const entry = history[animeId];
  if (!entry) return;

  const newProgress = Math.min(1, Math.max(0, progress));

  entry.episodes[String(episodeNumber)] = {
    progress: newProgress,
    duration,
    timestamp: Date.now(),
  };
  entry.lastEpisode = episodeNumber;
  entry.lastUpdated = Date.now();

  writeHistory(history);

  // Keep queueing while the episode is considered watched until AniList
  // acknowledges it. The queue deduplicates successful and in-flight updates.
  const shouldSyncToAniList = newProgress >= ANILIST_SYNC_THRESHOLD;
  queueEpisodeUpsert(animeId, episodeNumber, shouldSyncToAniList);
}

export function getEpisodeProgress(animeId: string, episodeNumber: number): EpisodeProgress | null {
  const history = readHistory();
  const entry = history[animeId];
  if (!entry) return null;
  return entry.episodes[String(episodeNumber)] || null;
}

export function isEpisodeWatched(animeId: string, episodeNumber: number): boolean {
  const progress = getEpisodeProgress(animeId, episodeNumber);
  return progress ? progress.progress >= 0.8 : false;
}

export function getWatchedEpisodes(animeId: string): Set<number> {
  const history = readHistory();
  const entry = history[animeId];
  if (!entry) return new Set();

  const watched = new Set<number>();
  for (const [episodeNumber, progress] of Object.entries(entry.episodes)) {
    if (progress.progress >= 0.8) {
      watched.add(Number(episodeNumber));
    }
  }
  return watched;
}

export function getContinueWatching(): (WatchHistoryEntry & { animeId: string })[] {
  return watchHistoryToList(readHistory());
}

export function getRecentlyWatched(limit = 10): (WatchHistoryEntry & { animeId: string })[] {
  return getContinueWatching().slice(0, limit);
}

export function removeFromHistory(animeId: string): void {
  const history = readHistory();
  delete history[animeId];
  writeHistory(history);
  queueAnimeRemoval(animeId);
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(WATCH_HISTORY_UPDATED_EVENT));
  pendingClear = true;
  pendingAnimeRemovals.clear();
  pendingEpisodeUpserts.clear();
  queueRemoteFlush();
}

export type { EpisodeProgress, WatchHistory, WatchHistoryEntry };
