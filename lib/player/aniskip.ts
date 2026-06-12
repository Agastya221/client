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

interface AniSkipResult {
  interval: { startTime: number; endTime: number };
  skipType: "op" | "ed" | "mixed-op" | "mixed-ed" | "recap";
  skipId: string;
  episodeLength: number;
}

interface AniSkipResponse {
  found: boolean;
  results?: AniSkipResult[];
  statusCode: number;
}

// Module-scope cache: `malId:episode` → SkipTimes
const skipCache = new Map<string, SkipTimes>();

const ANISKIP_BASE = "https://api.aniskip.com/v2";

/**
 * Fetch intro/outro/recap timestamps for a given episode.
 * Results are cached in module memory — safe to call repeatedly.
 *
 * @param malId    MyAnimeList numeric ID
 * @param episode  Episode number (1-based)
 * @param episodeLength  Total episode duration in seconds (improves accuracy)
 */
export async function fetchSkipTimes(
  malId: number,
  episode: number,
  episodeLength?: number,
): Promise<SkipTimes> {
  const cacheKey = `${malId}:${episode}`;
  const cached = skipCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    "types[]": "op",
  });
  // URLSearchParams doesn't support duplicate keys via constructor — add manually
  params.append("types[]", "ed");
  params.append("types[]", "mixed-op");
  params.append("types[]", "mixed-ed");
  params.append("types[]", "recap");

  if (episodeLength && episodeLength > 0) {
    params.set("episodeLength", String(Math.round(episodeLength)));
  }

  try {
    const response = await fetch(
      `${ANISKIP_BASE}/skip-times/${malId}/${episode}?${params.toString()}`,
      {
        cache: "force-cache",
        next: { revalidate: 86400 }, // 24h
      } as RequestInit,
    );

    if (!response.ok) {
      const empty: SkipTimes = { op: null, ed: null, recap: null };
      skipCache.set(cacheKey, empty);
      return empty;
    }

    const data: AniSkipResponse = await response.json();
    const result: SkipTimes = { op: null, ed: null, recap: null };

    if (data.found && data.results) {
      for (const entry of data.results) {
        const interval: SkipInterval = {
          start: entry.interval.startTime,
          end: entry.interval.endTime,
        };

        if (entry.skipType === "op" || entry.skipType === "mixed-op") {
          result.op = interval;
        } else if (entry.skipType === "ed" || entry.skipType === "mixed-ed") {
          result.ed = interval;
        } else if (entry.skipType === "recap") {
          result.recap = interval;
        }
      }
    }

    skipCache.set(cacheKey, result);
    return result;
  } catch {
    const empty: SkipTimes = { op: null, ed: null, recap: null };
    skipCache.set(cacheKey, empty);
    return empty;
  }
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
