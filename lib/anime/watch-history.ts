"use client";

/**
 * Anonymous watch tracking via localStorage.
 * Works without login — tracks what anime/episodes the user has watched,
 * their progress (video position), and provides "Continue Watching" data.
 *
 * Data shape in localStorage:
 * {
 *   "animeId1": {
 *     title: "...",
 *     poster: "...",
 *     href: "...",
 *     provider: "animekai",
 *     lastEpisode: 5,
 *     lastUpdated: 1713500000000,
 *     episodes: {
 *       "1": { progress: 0.85, duration: 1440, timestamp: 1713499000000 },
 *       "5": { progress: 0.25, duration: 1440, timestamp: 1713500000000 },
 *     }
 *   }
 * }
 */

const STORAGE_KEY = "animekai:watch-history";
const MAX_ENTRIES = 100;

export type EpisodeProgress = {
  progress: number; // 0-1 fraction
  duration: number; // total duration in seconds
  timestamp: number; // last updated timestamp ms
};

export type WatchHistoryEntry = {
  title: string;
  poster: string | null;
  href: string;
  provider: string;
  lastEpisode: number;
  lastUpdated: number;
  episodes: Record<string, EpisodeProgress>;
};

export type WatchHistory = Record<string, WatchHistoryEntry>;

function readHistory(): WatchHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeHistory(history: WatchHistory): void {
  if (typeof window === "undefined") return;
  try {
    // Evict oldest entries if over limit
    const entries = Object.entries(history);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].lastUpdated - a[1].lastUpdated);
      history = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/**
 * Record that the user is watching a specific episode.
 */
export function trackEpisodeWatch(
  animeId: string,
  episodeNumber: number,
  meta: {
    title: string;
    poster: string | null;
    href: string;
    provider: string;
  }
): void {
  const history = readHistory();
  const existing = history[animeId] || {
    title: meta.title,
    poster: meta.poster,
    href: meta.href,
    provider: meta.provider,
    lastEpisode: episodeNumber,
    lastUpdated: Date.now(),
    episodes: {},
  };

  existing.title = meta.title || existing.title;
  existing.poster = meta.poster || existing.poster;
  existing.href = meta.href || existing.href;
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
}

/**
 * Update the video progress for a specific episode.
 * Called on video `timeupdate` events (throttled).
 */
export function updateEpisodeProgress(
  animeId: string,
  episodeNumber: number,
  progress: number,
  duration: number
): void {
  const history = readHistory();
  const entry = history[animeId];
  if (!entry) return;

  entry.episodes[String(episodeNumber)] = {
    progress: Math.min(1, Math.max(0, progress)),
    duration,
    timestamp: Date.now(),
  };
  entry.lastUpdated = Date.now();

  writeHistory(history);
}

/**
 * Get the saved progress for a specific episode.
 */
export function getEpisodeProgress(
  animeId: string,
  episodeNumber: number
): EpisodeProgress | null {
  const history = readHistory();
  const entry = history[animeId];
  if (!entry) return null;
  return entry.episodes[String(episodeNumber)] || null;
}

/**
 * Check if a specific episode has been watched (>= 80% progress).
 */
export function isEpisodeWatched(animeId: string, episodeNumber: number): boolean {
  const progress = getEpisodeProgress(animeId, episodeNumber);
  return progress ? progress.progress >= 0.8 : false;
}

/**
 * Get all watched episode numbers for an anime.
 */
export function getWatchedEpisodes(animeId: string): Set<number> {
  const history = readHistory();
  const entry = history[animeId];
  if (!entry) return new Set();

  const watched = new Set<number>();
  for (const [epNum, progress] of Object.entries(entry.episodes)) {
    if (progress.progress >= 0.8) {
      watched.add(Number(epNum));
    }
  }
  return watched;
}

/**
 * Get all watch history entries, sorted by most recently watched.
 */
export function getContinueWatching(): (WatchHistoryEntry & { animeId: string })[] {
  const history = readHistory();
  return Object.entries(history)
    .map(([animeId, entry]) => ({ ...entry, animeId }))
    .sort((a, b) => b.lastUpdated - a.lastUpdated);
}

/**
 * Get the top N "Continue Watching" items.
 */
export function getRecentlyWatched(limit = 10): (WatchHistoryEntry & { animeId: string })[] {
  return getContinueWatching().slice(0, limit);
}

/**
 * Remove a specific anime from watch history.
 */
export function removeFromHistory(animeId: string): void {
  const history = readHistory();
  delete history[animeId];
  writeHistory(history);
}

/**
 * Clear all watch history.
 */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
