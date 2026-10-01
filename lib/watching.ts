/**
 * The "N watching" number in the header. It is a display figure, not a measurement, and it
 * needs no settings: it follows the viewer's own clock (busiest late evening, quietest before
 * dawn, a little livelier on Friday to Sunday) and drifts smoothly instead of jumping.
 * It always stays between WATCHING_MIN and WATCHING_MAX.
 *
 * Pure and deterministic for a given moment, so the browser computes it locally with no
 * request and no loading state.
 */

export interface WatchingModel {
  /** IANA zone whose clock drives the daily rhythm; defaults to the viewer's own. */
  timezone?: string;
}

/** Local hour (0-24, fractional) with the busiest traffic. */
const PEAK_HOUR = 21.5;
/** The number never goes below or above these. */
export const WATCHING_MIN = 9;
export const WATCHING_MAX = 45;
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

/** People "on the site" right now, always between WATCHING_MIN and WATCHING_MAX. */
export function siteWatching(now: Date, model: WatchingModel = {}): number {
  const { hour, weekend } = localClock(now, model.timezone);
  const level = WATCHING_MIN + (WATCHING_MAX - WATCHING_MIN) * activityAt(hour) * (weekend ? 1 : WEEKDAY_FACTOR);
  const spread = (WATCHING_MAX - WATCHING_MIN) * 0.08;
  return Math.round(Math.min(WATCHING_MAX, Math.max(WATCHING_MIN, level + drift("site", now.getTime()) * spread)));
}
