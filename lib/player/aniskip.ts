/**
 * AniSkip API client — fetches community-contributed intro/outro timestamps.
 * @see https://api.aniskip.com/api-docs
 */

export interface SkipInterval {
  start: number; // seconds
  end: number;   // seconds
}

export interface SkipTimes {
  op: SkipInterval | null;
  ed: SkipInterval | null;
  recap: SkipInterval | null;
}

// Module-scope cache and in-flight map avoid duplicate requests when React
// effects re-run or the player surface changes.
const skipCache = new Map<string, SkipTimes>();
const skipRequests = new Map<string, Promise<SkipTimes>>();
const EMPTY_SKIP_TIMES: SkipTimes = { op: null, ed: null, recap: null };

/**
 * Fetch intro/outro/recap timestamps for a given episode.
 * Results are cached in module memory — safe to call repeatedly.
 *
 * @param malId    MyAnimeList numeric ID
 * @param episode  Episode number (1-based)
 * @param episodeLength  Total episode duration in seconds (required by AniSkip)
 */
export async function fetchSkipTimes(
  malId: number,
  episode: number,
  episodeLength: number,
): Promise<SkipTimes> {
  if (
    !Number.isInteger(malId) ||
    malId <= 0 ||
    !Number.isInteger(episode) ||
    episode <= 0 ||
    !Number.isFinite(episodeLength) ||
    episodeLength < 60
  ) {
    // Duration is initially unknown. Do not request or cache an invalid lookup;
    // the player effect runs again as soon as loaded metadata supplies it.
    return { ...EMPTY_SKIP_TIMES };
  }

  const duration = Math.round(episodeLength / 10) * 10;
  const cacheKey = `${malId}:${episode}:${duration}`;
  const cached = skipCache.get(cacheKey);
  if (cached) return cached;
  const pending = skipRequests.get(cacheKey);
  if (pending) return pending;

  const params = new URLSearchParams({
    malId: String(malId),
    episode: String(episode),
    duration: String(duration),
  });
  const request = fetch(`/api/player/skip-times?${params.toString()}`, {
    cache: "force-cache",
  })
    .then(async (response): Promise<SkipTimes> => {
      if (!response.ok) return { ...EMPTY_SKIP_TIMES };
      const result = await response.json() as SkipTimes;
      skipCache.set(cacheKey, result);
      return result;
    })
    .catch(() => ({ ...EMPTY_SKIP_TIMES }))
    .finally(() => skipRequests.delete(cacheKey));

  skipRequests.set(cacheKey, request);
  return request;
}

/**
 * Check if the current playback time is inside an intro/outro/recap zone.
 */
export function getActiveSkipZone(
  time: number,
  skipTimes: SkipTimes,
): { type: "op" | "ed" | "recap"; interval: SkipInterval } | null {
  if (skipTimes.op && time >= skipTimes.op.start && time < skipTimes.op.end) {
    return { type: "op", interval: skipTimes.op };
  }
  if (skipTimes.ed && time >= skipTimes.ed.start && time < skipTimes.ed.end) {
    return { type: "ed", interval: skipTimes.ed };
  }
  if (skipTimes.recap && time >= skipTimes.recap.start && time < skipTimes.recap.end) {
    return { type: "recap", interval: skipTimes.recap };
  }
  return null;
}
