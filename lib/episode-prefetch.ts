/**
 * The episode pre-fetcher's pure helpers (app/api/cron/prefetch-episodes uses them).
 *
 * Why it exists: the first viewer of a new episode waits 3-6 s while Render scrapes the
 * provider, and when many first lookups arrive at once (a new episode of a popular show) the
 * free Render server queues them, up to a minute in the load test. A cron job looks up the
 * latest episode of airing shows ahead of time, a few per run, so viewers find the link stored.
 */

export interface AiringTitle {
  id: number;
  status?: string | null;
  episodes?: number | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
}

/** The newest episode that has aired, or null when it cannot be told. */
export function latestAiredEpisode(media: AiringTitle, nowSeconds = Date.now() / 1000): number | null {
  const next = media.nextAiringEpisode;
  if (next && Number.isFinite(next.episode)) {
    // The scheduled time may already have passed (AniList updates late): then that one is out too.
    const latest = next.airingAt <= nowSeconds ? next.episode : next.episode - 1;
    return latest >= 1 ? latest : null;
  }
  if (String(media.status || "").toUpperCase() === "FINISHED" && media.episodes) return media.episodes;
  return null;
}

/** Each run checks the next `size` titles of the list, so the whole list is covered every few runs. */
export function pickPrefetchWindow<T>(items: readonly T[], nowMs: number, size: number, slotMs = 10 * 60_000): T[] {
  if (items.length === 0 || size <= 0) return [];
  const take = Math.min(size, items.length);
  const start = (Math.floor(nowMs / slotMs) * take) % items.length;
  return Array.from({ length: take }, (_, i) => items[(start + i) % items.length]);
}

/** Marks an episode that had no stream, so it is not asked for again on every run. */
export function prefetchMissKey(animeId: string, episode: number, kind: "any" | "solaris" = "any"): string {
  return `stream-link:prefetch-miss:v1:${animeId}:ep${episode}${kind === "solaris" ? ":solaris" : ""}`;
}

export const PREFETCH_LIST_KEY = "stream-link:prefetch:airing:v1";
/** How long the list of airing shows is reused (one AniList call an hour, not one per run). */
export const PREFETCH_LIST_SECONDS = 60 * 60;
/** How long a "no stream yet" answer keeps an episode from being retried. */
export const PREFETCH_MISS_SECONDS = 2 * 60 * 60;
