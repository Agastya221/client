import type { NextAiringEpisode } from "./airing";

/** AniList-style fuzzy date: any part may be missing. */
export interface FuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

/**
 * When an upcoming release is expected, as precisely as the data allows.
 * - `exact`: a broadcast timestamp (unix seconds) from AniList's airing schedule.
 * - `day` / `month` / `year`: a calendar date of decreasing precision (no time of day).
 * - `unknown`: nothing usable.
 */
export type ReleaseSchedule =
  | { kind: "exact"; airingAt: number }
  | { kind: "day"; year: number; month: number; day: number }
  | { kind: "month"; year: number; month: number }
  | { kind: "year"; year: number }
  | { kind: "unknown" };

function normalizeStatus(status: string | null | undefined): string {
  return String(status || "").toUpperCase().replace(/[ -]+/g, "_");
}

export function isUnreleasedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized.includes("NOT_YET_RELEASED") || normalized.includes("UPCOMING");
}

function validNextAiring(value: NextAiringEpisode | null | undefined): NextAiringEpisode | null {
  if (
    !value ||
    !Number.isInteger(value.episode) ||
    value.episode <= 0 ||
    !Number.isFinite(value.airingAt) ||
    value.airingAt <= 0
  ) {
    return null;
  }
  return value;
}

function validPart(value: number | null | undefined, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** Best-known schedule for an episode, from a broadcast slot or a (fuzzy) start date. */
export function resolveReleaseSchedule(input: {
  episodeNumber?: number;
  nextAiringEpisode?: NextAiringEpisode | null;
  startDate?: FuzzyDate | null;
  airDate?: string | null;
}): ReleaseSchedule {
  const episodeNumber = input.episodeNumber ?? 1;
  const next = validNextAiring(input.nextAiringEpisode);
  if (next && next.episode === episodeNumber) {
    return { kind: "exact", airingAt: next.airingAt };
  }

  if (input.airDate) {
    const parsed = Date.parse(input.airDate);
    if (Number.isFinite(parsed) && parsed > 0) {
      // A bare YYYY-MM-DD has no broadcast time; keep it a calendar day so it is
      // not shown as midnight UTC shifted into the viewer's zone.
      const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.airDate.trim());
      if (dayOnly) {
        return { kind: "day", year: Number(dayOnly[1]), month: Number(dayOnly[2]), day: Number(dayOnly[3]) };
      }
      return { kind: "exact", airingAt: Math.floor(parsed / 1000) };
    }
  }

  // The start date only describes the premiere.
  if (episodeNumber === 1 && input.startDate) {
    const year = validPart(input.startDate.year, 1900, 3000);
    const month = validPart(input.startDate.month, 1, 12);
    const day = validPart(input.startDate.day, 1, 31);
    if (year && month && day) return { kind: "day", year, month, day };
    if (year && month) return { kind: "month", year, month };
    if (year) return { kind: "year", year };
  }

  return { kind: "unknown" };
}

export interface NotAiredEpisodeState {
  episodeNumber: number;
  schedule: ReleaseSchedule;
  /** Highest episode that has aired, or null when nothing has aired yet. */
  latestAiredEpisode: number | null;
}

const NOT_AIRED_MESSAGE = /not aired yet|not available yet/i;

/**
 * Decides whether a watch request is for an episode that has not aired yet,
 * using only data the watch page already has. Returns null for anything that
 * has (or may have) a stream, so ordinary "no stream" failures are unaffected.
 */
export function resolveNotAiredEpisode(input: {
  episodeNumber: number;
  hasSource: boolean;
  status?: string | null;
  message?: string | null;
  nextAiringEpisode?: NextAiringEpisode | null;
  subCount?: number | null;
  startDate?: FuzzyDate | null;
  airDate?: string | null;
}): NotAiredEpisodeState | null {
  if (input.hasSource) return null;

  const unreleased = isUnreleasedStatus(input.status);
  const next = validNextAiring(input.nextAiringEpisode);
  const beyondSchedule = next !== null && input.episodeNumber >= next.episode;
  const serverSaysNotAired = NOT_AIRED_MESSAGE.test(input.message || "");

  if (!unreleased && !beyondSchedule && !serverSaysNotAired) return null;

  let latestAiredEpisode: number | null = null;
  if (!unreleased) {
    const fromSchedule = next ? next.episode - 1 : 0;
    const fromCount = typeof input.subCount === "number" ? input.subCount : 0;
    const latest = Math.max(fromSchedule, fromCount);
    latestAiredEpisode = latest > 0 && latest < input.episodeNumber ? latest : null;
  }

  return {
    episodeNumber: input.episodeNumber,
    schedule: resolveReleaseSchedule({
      episodeNumber: input.episodeNumber,
      nextAiringEpisode: next,
      startDate: input.startDate,
      airDate: input.airDate,
    }),
    latestAiredEpisode,
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Human label for a schedule. `exact` times are formatted in the runtime's local
 * time zone, so call it on the client (after hydration) for exact schedules.
 */
export function formatReleaseSchedule(schedule: ReleaseSchedule, locale?: string): string {
  switch (schedule.kind) {
    case "exact":
      return new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(schedule.airingAt * 1000));
    case "day":
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(schedule.year, schedule.month - 1, schedule.day)));
    case "month":
      return `${MONTHS[schedule.month - 1]} ${schedule.year}`;
    case "year":
      return String(schedule.year);
    default:
      return "";
  }
}
