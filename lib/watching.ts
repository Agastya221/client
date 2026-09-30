/**
 * The "N watching" number. It is a display figure, not a measurement: it follows a daily
 * rhythm (busiest late evening, quietest before dawn in the configured time zone), drifts
 * smoothly instead of jumping, and differs per anime. Pure and deterministic for a given
 * moment, so the browser computes it locally with no request and no loading state.
 *
 * The peak is set in the admin panel and clamped there to well under the member limit.
 */
import { DEFAULT_WATCHING, type WatchingSettings } from "@/lib/access/settings";

/** Local hour (0-24, fractional) with the busiest traffic. */
const PEAK_HOUR = 21.5;
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

export function localHour(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return hour + minute / 60;
  } catch {
    return now.getUTCHours() + now.getUTCMinutes() / 60;
  }
}

/** 0 at the quietest hour, 1 at the busiest. */
export function activityAt(hour: number): number {
  const wave = 0.5 + 0.5 * Math.cos(((hour - PEAK_HOUR) / 24) * 2 * Math.PI);
  return Math.pow(wave, 1.25);
}

/** People "on the site" right now, always within [min, max]. */
export function siteWatching(now: Date, settings: WatchingSettings = DEFAULT_WATCHING): number {
  const min = Math.max(0, Math.min(settings.min, settings.max));
  const max = Math.max(settings.min, settings.max);
  const level = min + (max - min) * activityAt(localHour(now, settings.timezone));
  const spread = Math.max(1, (max - min) * 0.08);
  return Math.round(Math.min(max, Math.max(min, level + drift("site", now.getTime()) * spread)));
}

/** People "watching this anime": a slice of the site total, most titles small, a few popular. */
export function animeWatching(seed: string, now: Date, settings: WatchingSettings = DEFAULT_WATCHING): number {
  const total = siteWatching(now, settings);
  if (total <= 0) return 0;
  // Every title gets a real-looking slice (20-60% of the site), never a lonely "1".
  const popularity = 0.2 + 0.4 * Math.pow(hash(`pop:${seed}`), 2);
  const wobble = 1 + drift(`anime:${seed}`, now.getTime()) * 0.2;
  return Math.min(total, Math.max(Math.min(2, total), Math.round(total * popularity * wobble)));
}
