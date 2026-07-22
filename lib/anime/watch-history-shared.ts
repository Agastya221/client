export type EpisodeProgress = {
  progress: number;
  duration: number;
  timestamp: number;
};

export type WatchHistoryEntry = {
  title: string;
  poster: string | null;
  href: string;
  provider: string;
  anilistId?: number | null;
  episodeCount?: number | null;
  animeStatus?: string | null;
  lastEpisode: number;
  lastUpdated: number;
  episodes: Record<string, EpisodeProgress>;
};

export type WatchHistory = Record<string, WatchHistoryEntry>;

export type WatchHistoryListEntry = WatchHistoryEntry & { animeId: string };

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeEpisodeProgress(value: Partial<EpisodeProgress> | null | undefined): EpisodeProgress {
  return {
    progress: clampNumber(Number(value?.progress || 0), 0, 1),
    duration: Math.max(0, Number(value?.duration || 0)),
    timestamp: Math.max(0, Number(value?.timestamp || 0)),
  };
}

export function mergeEpisodeProgress(
  current: EpisodeProgress | null | undefined,
  incoming: EpisodeProgress | null | undefined,
): EpisodeProgress {
  const left = current ? normalizeEpisodeProgress(current) : null;
  const right = incoming ? normalizeEpisodeProgress(incoming) : null;

  if (!left) return right || normalizeEpisodeProgress(null);
  if (!right) return left;

  if (right.timestamp > left.timestamp) return right;
  if (left.timestamp > right.timestamp) return left;

  if (right.progress > left.progress) return right;
  if (left.progress > right.progress) return left;

  return right.duration >= left.duration ? right : left;
}

export function mergeWatchHistoryEntries(
  current: WatchHistoryEntry | null | undefined,
  incoming: WatchHistoryEntry | null | undefined,
): WatchHistoryEntry {
  const fallback: WatchHistoryEntry = {
    title: incoming?.title || current?.title || "",
    poster: incoming?.poster || current?.poster || null,
    href: incoming?.href || current?.href || "",
    provider: incoming?.provider || current?.provider || "animekai",
    anilistId: incoming?.anilistId ?? current?.anilistId ?? null,
    episodeCount: incoming?.episodeCount ?? current?.episodeCount ?? null,
    animeStatus: incoming?.animeStatus ?? current?.animeStatus ?? null,
    lastEpisode: incoming?.lastEpisode || current?.lastEpisode || 1,
    lastUpdated: Math.max(current?.lastUpdated || 0, incoming?.lastUpdated || 0),
    episodes: {},
  };

  const episodes = new Set([
    ...Object.keys(current?.episodes || {}),
    ...Object.keys(incoming?.episodes || {}),
  ]);

  const mergedEpisodes: Record<string, EpisodeProgress> = {};
  for (const episodeKey of episodes) {
    mergedEpisodes[episodeKey] = mergeEpisodeProgress(
      current?.episodes?.[episodeKey],
      incoming?.episodes?.[episodeKey],
    );
  }

  const lastEpisode = Object.entries(mergedEpisodes).sort((left, right) => {
    const delta = right[1].timestamp - left[1].timestamp;
    if (delta !== 0) return delta;
    return Number(right[0]) - Number(left[0]);
  })[0]?.[0];

  return {
    title: incoming?.title || current?.title || fallback.title,
    poster: incoming?.poster ?? current?.poster ?? fallback.poster,
    href: incoming?.href || current?.href || fallback.href,
    provider: incoming?.provider || current?.provider || fallback.provider,
    anilistId: incoming?.anilistId ?? current?.anilistId ?? fallback.anilistId ?? null,
    episodeCount: incoming?.episodeCount ?? current?.episodeCount ?? fallback.episodeCount ?? null,
    animeStatus: incoming?.animeStatus ?? current?.animeStatus ?? fallback.animeStatus ?? null,
    lastEpisode: Number(lastEpisode || incoming?.lastEpisode || current?.lastEpisode || fallback.lastEpisode),
    lastUpdated: Math.max(
      fallback.lastUpdated,
      ...Object.values(mergedEpisodes).map((episode) => episode.timestamp),
    ),
    episodes: mergedEpisodes,
  };
}

export function mergeWatchHistories(current: WatchHistory, incoming: WatchHistory): WatchHistory {
  const animeIds = new Set([...Object.keys(current), ...Object.keys(incoming)]);
  const merged: WatchHistory = {};

  for (const animeId of animeIds) {
    merged[animeId] = mergeWatchHistoryEntries(current[animeId], incoming[animeId]);
  }

  return merged;
}

export function watchHistoryToList(history: WatchHistory): WatchHistoryListEntry[] {
  return Object.entries(history)
    .map(([animeId, entry]) => ({ ...entry, animeId }))
    .sort((left, right) => right.lastUpdated - left.lastUpdated);
}
