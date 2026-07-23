export type AnimeListStatus =
  | "WATCHING"
  | "COMPLETED"
  | "PLAN_TO_WATCH"
  | "ON_HOLD"
  | "DROPPED";

export function fromAnilistListStatus(status: string | null | undefined): AnimeListStatus {
  switch (String(status || "").toUpperCase()) {
    case "CURRENT":
    case "REPEATING":
      return "WATCHING";
    case "COMPLETED":
      return "COMPLETED";
    case "PAUSED":
      return "ON_HOLD";
    case "DROPPED":
      return "DROPPED";
    case "PLANNING":
    default:
      return "PLAN_TO_WATCH";
  }
}
