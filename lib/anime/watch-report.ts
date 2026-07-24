export const WATCH_REPORT_ISSUES = [
  { id: "missing_servers", label: "Missing servers or providers" },
  { id: "episode_not_playing", label: "Selected episode won't play" },
  { id: "missing_download", label: "Missing download option" },
  { id: "wrong_show", label: "Wrong show, title, or episode" },
  { id: "subtitle_problem", label: "Subtitle or caption problem" },
  { id: "audio_problem", label: "Audio or dub problem" },
] as const;

export type WatchReportIssue = (typeof WATCH_REPORT_ISSUES)[number]["id"];

const WATCH_REPORT_ISSUE_IDS = new Set<string>(
  WATCH_REPORT_ISSUES.map((issue) => issue.id),
);

export function isWatchReportIssue(value: unknown): value is WatchReportIssue {
  return typeof value === "string" && WATCH_REPORT_ISSUE_IDS.has(value);
}

export function affectsPlaybackCache(issues: WatchReportIssue[]): boolean {
  return issues.some((issue) =>
    issue === "missing_servers" ||
    issue === "episode_not_playing" ||
    issue === "subtitle_problem" ||
    issue === "audio_problem"
  );
}
