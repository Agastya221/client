"use client";

import Link from "next/link";
import { ArrowLeft, CalendarClock, Play } from "lucide-react";
import { describeRelease, useNowMs } from "@/components/anime/ReleaseCountdown";
import type { NotAiredEpisodeState } from "@/lib/anime/release-schedule";

/**
 * Player-area state for an episode that has not aired yet. Replaces the
 * "No stream available" screen, which suggested a broken source.
 */
export default function NotAiredPanel({
  state,
  title,
  image,
  animeHref,
  accentColor,
  onWatchLatest,
}: {
  state: NotAiredEpisodeState;
  title: string;
  image: string | null;
  animeHref: string;
  accentColor: string;
  onWatchLatest?: (episodeNumber: number) => void;
}) {
  const nowMs = useNowMs();
  const { when, countdown } = describeRelease(state.schedule, nowMs);
  const scheduleKind = state.schedule.kind;
  const airedAlready = countdown === "airing now";

  let headline: string;
  if (scheduleKind === "exact") {
    headline = when ? `Episode ${state.episodeNumber} airs ${when}` : `Episode ${state.episodeNumber} airs soon`;
  } else if (scheduleKind === "day") {
    headline = `Episode ${state.episodeNumber} airs ${when}`;
  } else if (scheduleKind === "month" || scheduleKind === "year") {
    headline = `Episode ${state.episodeNumber} is coming ${when}`;
  } else {
    headline = `Episode ${state.episodeNumber} hasn't aired yet`;
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0a0a0c]">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-[2px]" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/80 to-[#0a0a0c]/50" />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 px-5 text-center sm:gap-4 sm:px-8">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ color: accentColor, borderColor: `${accentColor}66`, background: `${accentColor}1f` }}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Not aired yet
        </span>
        <div className="space-y-1.5">
          <p className="line-clamp-1 text-xs font-semibold text-white/50 sm:text-sm">{title}</p>
          <h2 className="text-balance text-lg font-black leading-tight text-white sm:text-2xl" aria-live="polite">
            {headline}
          </h2>
          {countdown ? (
            <p className="text-sm font-bold tabular-nums" style={{ color: accentColor }}>
              {airedAlready ? "Airing now. Streams usually appear shortly after." : `in ${countdown}`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-center gap-2.5 pt-1">
          <Link
            href={animeHref}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-bold text-white/85 transition-colors hover:bg-white/[0.12] sm:px-5 sm:py-2.5 sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Anime details
          </Link>
          {state.latestAiredEpisode && onWatchLatest ? (
            <button
              type="button"
              onClick={() => onWatchLatest(state.latestAiredEpisode as number)}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white transition-colors hover:brightness-110 sm:px-5 sm:py-2.5 sm:text-sm"
              style={{ backgroundColor: accentColor }}
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Watch episode {state.latestAiredEpisode}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
