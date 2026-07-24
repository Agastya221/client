import { NextRequest, NextResponse } from "next/server";
import { cacheFetch } from "@/lib/cache";
import type { SkipTimes } from "@/lib/player/aniskip";

const ANISKIP_BASE_URL = "https://api.aniskip.com/v2";
const EMPTY_SKIP_TIMES: SkipTimes = { op: null, ed: null, recap: null };
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type AniSkipResult = {
  interval?: {
    startTime?: number;
    endTime?: number;
  };
  skipType?: "op" | "ed" | "mixed-op" | "mixed-ed" | "recap";
};

type AniSkipResponse = {
  found?: boolean;
  results?: AniSkipResult[];
};

function positiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeInterval(entry: AniSkipResult): { start: number; end: number } | null {
  const start = Number(entry.interval?.startTime);
  const end = Number(entry.interval?.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start
    ? { start, end }
    : null;
}

function normalizeSkipTimes(payload: AniSkipResponse): SkipTimes {
  const result: SkipTimes = { ...EMPTY_SKIP_TIMES };
  if (!payload.found || !Array.isArray(payload.results)) return result;

  for (const entry of payload.results) {
    const interval = normalizeInterval(entry);
    if (!interval) continue;
    if (entry.skipType === "op" || entry.skipType === "mixed-op") result.op = interval;
    if (entry.skipType === "ed" || entry.skipType === "mixed-ed") result.ed = interval;
    if (entry.skipType === "recap") result.recap = interval;
  }

  return result;
}

export async function GET(request: NextRequest) {
  const malId = positiveInteger(request.nextUrl.searchParams.get("malId"));
  const episode = positiveInteger(request.nextUrl.searchParams.get("episode"));
  const rawDuration = positiveInteger(request.nextUrl.searchParams.get("duration"));

  if (!malId || !episode || !rawDuration || rawDuration < 60 || rawDuration > 4 * 60 * 60) {
    return NextResponse.json(
      { error: "Valid malId, episode and duration are required" },
      { status: 400 },
    );
  }

  // Different releases can vary by a few seconds. Bucketing prevents duplicate
  // KV entries without losing AniSkip's duration-based matching.
  const duration = Math.max(60, Math.round(rawDuration / 10) * 10);

  try {
    const skipTimes = await cacheFetch(
      `aniskip:v2:${malId}:${episode}:${duration}`,
      async () => {
        const params = new URLSearchParams({ episodeLength: String(duration) });
        for (const type of ["op", "ed", "mixed-op", "mixed-ed", "recap"]) {
          params.append("types[]", type);
        }

        const response = await fetch(
          `${ANISKIP_BASE_URL}/skip-times/${malId}/${episode}?${params.toString()}`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8_000),
          },
        );

        // A correct request with no community timestamp is a valid cacheable
        // result. Invalid requests and upstream failures must never be cached.
        if (response.status === 404) return { ...EMPTY_SKIP_TIMES };
        if (!response.ok) throw new Error(`AniSkip returned ${response.status}`);
        return normalizeSkipTimes(await response.json() as AniSkipResponse);
      },
      {
        freshMs: SIX_HOURS_MS,
        staleMs: SIX_HOURS_MS,
        expireMs: ONE_DAY_MS,
      },
    );

    return NextResponse.json(skipTimes, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=21600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Skip-time provider unavailable" },
      { status: 502 },
    );
  }
}
