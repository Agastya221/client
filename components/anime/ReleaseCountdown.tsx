"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { formatAiringCountdown } from "@/lib/anime/airing";
import { formatReleaseSchedule, type ReleaseSchedule } from "@/lib/anime/release-schedule";

/**
 * Wall clock that is 0 during server rendering and hydration, then ticks.
 * Local-time labels and countdowns wait for it, so cached HTML never disagrees
 * with the first client render.
 */
export function useNowMs(intervalMs = 30_000): number {
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [intervalMs]);
  return nowMs;
}

/** Short "when" label for a schedule; "" until the client clock is known for exact times. */
export function describeRelease(schedule: ReleaseSchedule, nowMs: number): { when: string; countdown: string | null } {
  if (schedule.kind === "exact") {
    if (nowMs <= 0) return { when: "", countdown: null };
    return {
      when: formatReleaseSchedule(schedule),
      countdown: formatAiringCountdown(schedule.airingAt, nowMs),
    };
  }
  return { when: formatReleaseSchedule(schedule), countdown: null };
}

function shortExactLabel(airingAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(airingAt * 1000));
}

/**
 * Detail-page replacement for the Watch CTA while a title has not aired.
 * Same pill shape as the CTA, but not a link. Once an exact premiere time
 * passes (the page is cached for hours), it hands back to `airedFallback`.
 */
export function UpcomingReleaseCta({
  schedule,
  className,
  style,
  airedFallback,
}: {
  schedule: ReleaseSchedule;
  className?: string;
  style?: CSSProperties;
  airedFallback?: ReactNode;
}) {
  const nowMs = useNowMs();

  if (schedule.kind === "exact" && nowMs > 0 && nowMs >= schedule.airingAt * 1000 && airedFallback) {
    return <>{airedFallback}</>;
  }

  let primary: string;
  let secondary: string | null = null;
  let title: string | undefined;
  switch (schedule.kind) {
    case "exact":
      primary = nowMs > 0 ? `Airs ${shortExactLabel(schedule.airingAt)}` : "Airing soon";
      secondary = nowMs > 0 ? `in ${formatAiringCountdown(schedule.airingAt, nowMs)}` : null;
      title = nowMs > 0 ? `Airs ${formatReleaseSchedule(schedule)}` : undefined;
      break;
    case "day":
      primary = `Airs ${formatReleaseSchedule(schedule)}`;
      break;
    case "month":
    case "year":
      primary = `Coming ${formatReleaseSchedule(schedule)}`;
      break;
    default:
      primary = "Coming soon";
  }

  return (
    <div role="status" aria-live="polite" title={title} className={className} style={style}>
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="max-w-full truncate">{primary}</span>
        {secondary ? (
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">{secondary}</span>
        ) : null}
      </span>
    </div>
  );
}
