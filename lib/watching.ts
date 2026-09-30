/**
 * The "N watching" number. It is a display figure, not a measurement, and it needs no
 * settings: everything is worked out from three things it already knows.
 *
 *   - How many spots are open (`maxMembers`): the busiest the counter ever gets is 70% of
 *     that, the quietest hour is a sixth of the peak. Open more spots and the numbers grow
 *     by themselves.
 *   - The viewer's own clock: busiest late evening, quietest before dawn, a little livelier
 *     on Friday to Sunday. Whoever is looking sees their own night as the busy time.
 *   - The title: each anime gets its own steady share, and one that is airing right now
 *     gets a larger one.
 *
 * Pure and deterministic for a given moment, so the browser computes it locally with no
 * request and no loading state; it drifts smoothly rather than jumping.
 */

export interface WatchingModel {
  /** Spots currently open (SITE_MAX_MEMBERS). Sets the scale of every number. */
  maxMembers: number;
  /** IANA zone whose clock drives the daily rhythm; defaults to the viewer's own. */
  timezone?: string;
}

/** Local hour (0-24, fractional) with the busiest traffic. */
const PEAK_HOUR = 21.5;
/** Share of the open spots that can ever be "watching" at once, at the busiest moment. */
const PEAK_SHARE = 0.7;
/** The quietest hour shows this fraction of the peak. */
const QUIET_SHARE = 0.15;
/** Friday to Sunday run at full strength, the rest of the week a little below. */
const WEEKDAY_FACTOR = 0.9;
/** The number drifts once per this many milliseconds. */
const DRIFT_MS = 40_000;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Smooth value in [-1, 1] that changes gradually over time. */
function drift(key: string, nowMs: number): number {
  const slot = nowMs / DRIFT_MS;
  const base = Math.floor(slot);
  const t = slot - base;
  const eased = t * t * (3 - 2 * t);
  const a = hash(`${key}:${base}`) * 2 - 1;
  const b = hash(`${key}:${base + 1}`) * 2 - 1;
  return a + (b - a) * eased;
}

export function viewerTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Local hour (fractional) and whether it is Friday, Saturday or Sunday there. */
export function localClock(now: Date, timezone?: string): { hour: number; weekend: boolean } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    return { hour: hour + minute / 60, weekend: ["Fri", "Sat", "Sun"].includes(weekday) };
  } catch {
    const day = now.getUTCDay();
    return { hour: now.getUTCHours() + now.getUTCMinutes() / 60, weekend: day === 0 || day === 5 || day === 6 };
  }
}

/** 0 at the quietest hour, 1 at the busiest. */
export function activityAt(hour: number): number {
  const wave = 0.5 + 0.5 * Math.cos(((hour - PEAK_HOUR) / 24) * 2 * Math.PI);
  return Math.pow(wave, 1.25);
}

/** The lowest and highest the site-wide number can be for this many open spots. */
export function watchingRange(maxMembers: number): { min: number; max: number } {
  const max = Math.max(3, Math.round(Math.max(1, maxMembers) * PEAK_SHARE));
  return { min: Math.max(2, Math.round(max * QUIET_SHARE)), max };
}

/**
 * Whether a status string from AniList or a provider means "airing now". Careful with
 * "Finished Airing" (MAL/Jikan style), which contains AIRING but is the opposite.
 */
export function isAiringStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  if (/FINISHED|COMPLETED|CANCELLED|NOT_YET|UPCOMING|HIATUS/.test(normalized)) return false;
  return /RELEASING|ONGOING|AIRING/.test(normalized);
}

/** People "on the site" right now, always within the range for the open spots. */
export function siteWatching(now: Date, model: WatchingModel): number {
  const { min, max } = watchingRange(model.maxMembers);
  const { hour, weekend } = localClock(now, model.timezone);
  const level = min + (max - min) * activityAt(hour) * (weekend ? 1 : WEEKDAY_FACTOR);
  const spread = Math.max(1, (max - min) * 0.08);
  return Math.round(Math.min(max, Math.max(min, level + drift("site", now.getTime()) * spread)));
}

/**
 * People "watching this anime": a slice of the site total. Titles differ from each other and
 * stay that way; one that is airing now gets a bigger slice. Never a lonely 1 (unless the
 * whole site is that quiet) and never more than the site total.
 */
export function animeWatching(seed: string, now: Date, model: WatchingModel, title: { airing?: boolean } = {}): number {
  const total = siteWatching(now, model);
  // Airing titles sit in a higher band than finished ones, so "more for what is airing" holds for every title.
  const share = Math.pow(hash(`pop:${seed}`), 2);
  const popularity = title.airing ? 0.4 + 0.3 * share : 0.16 + 0.3 * share;
  const wobble = 1 + drift(`anime:${seed}`, now.getTime()) * 0.2;
  return Math.min(total, Math.max(Math.min(2, total), Math.round(total * popularity * wobble)));
}
