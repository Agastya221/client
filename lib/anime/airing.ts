export interface NextAiringEpisode {
  episode: number;
  airingAt: number;
}

export function isAiringStatus(value: string | null | undefined): boolean {
  const status = String(value || "").toUpperCase().replace(/[ -]+/g, "_");
  return status === "RELEASING" || status === "AIRING" || status === "CURRENTLY_AIRING";
}

export function resolveNextAiringEpisode(
  status: string | null | undefined,
  primary: NextAiringEpisode | null | undefined,
  fallback: NextAiringEpisode | null | undefined,
): NextAiringEpisode | null {
  if (!isAiringStatus(status)) return null;

  const candidate = primary ?? fallback;
  if (
    !candidate ||
    !Number.isInteger(candidate.episode) ||
    candidate.episode <= 0 ||
    !Number.isFinite(candidate.airingAt) ||
    candidate.airingAt <= 0
  ) {
    return null;
  }

  return candidate;
}

export function formatAiringCountdown(airingAt: number, nowMs: number): string {
  const remainingSeconds = Math.max(0, Math.floor(airingAt - nowMs / 1000));
  if (remainingSeconds <= 0) return "airing now";

  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.max(1, Math.floor((remainingSeconds % 3_600) / 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** How long after the scheduled time we keep the card up as "Should be out". */
export const AIRED_GRACE_MS = 2 * 60 * 60 * 1000;

export type AiringCardState =
  | { kind: "pending" }
  | { kind: "upcoming"; badge: string }
  | { kind: "aired"; badge: string }
  | { kind: "hidden" };

/**
 * Pure view-model for the "Next episode" card. `nowMs <= 0` means the client
 * clock is not known yet (SSR / before hydration), so nothing time-dependent
 * should be rendered. Once the scheduled time has passed we show a short
 * "Should be out" state, then hide the card instead of advertising a past date.
 */
export function resolveAiringCardState(
  airingAt: number,
  nowMs: number,
  graceMs: number = AIRED_GRACE_MS,
): AiringCardState {
  if (!(nowMs > 0)) return { kind: "pending" };
  const airingMs = airingAt * 1000;
  if (airingMs > nowMs) {
    return { kind: "upcoming", badge: `${formatAiringCountdown(airingAt, nowMs)} left` };
  }
  if (nowMs - airingMs <= graceMs) return { kind: "aired", badge: "Should be out" };
  return { kind: "hidden" };
}
