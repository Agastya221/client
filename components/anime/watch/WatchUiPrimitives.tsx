"use client";

import type { AnimeSeasonEntry, EpisodeModel, ServerOption } from "@/lib/anime/types";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";

export function ControlBtn({
  icon: Icon,
  label,
  active,
  accent,
  disabled,
  onClick,
  accentColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  accentColor?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={`
        flex items-center justify-center gap-1.5 p-2.5 sm:px-2.5 sm:py-1.5 text-[11px] font-semibold tracking-wide transition-all duration-200
        rounded-md select-none whitespace-nowrap min-w-[2.5rem] min-h-[2.5rem] sm:min-w-0 sm:min-h-0
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:-translate-y-px hover:bg-white/8 hover:text-white active:translate-y-0 active:scale-[0.98]"}
        ${active && !accent ? "text-white" : !active ? "text-white/60" : ""}
      `}
      style={active && accent && accentColor ? { color: accentColor } : undefined}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function ServerButton({
  label,
  active,
  onClick,
  subType,
  tag,
  accentColor = "#8b5cf6",
  disabled = false,
  isHostLocked = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** If set, shows a S-SUB or H-SUB badge chip on the button */
  subType?: "soft" | "hard";
  tag?: string;
  accentColor?: string;
  disabled?: boolean;
  isHostLocked?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || isHostLocked}
      onClick={onClick}
      title={isHostLocked ? "Playback is controlled by the room host" : undefined}
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 sm:text-[11px] ${
        disabled || isHostLocked ? "opacity-40 cursor-not-allowed" : ""
      } ${
        active
          ? "text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          : "bg-white/[0.04] text-white/62 border-white/10 hover:-translate-y-px hover:bg-white/[0.09] hover:text-white hover:border-white/25 hover:shadow-[0_8px_20px_rgba(0,0,0,0.24)] active:translate-y-0 active:scale-[0.98]"
      }`}
      style={active ? {
        background: `${accentColor}24`,
        borderColor: `${accentColor}88`,
        boxShadow: `0 0 0 1px ${accentColor}30, 0 0 18px ${accentColor}18`,
      } : { "--tw-ring-color": `${accentColor}88` } as React.CSSProperties}
    >
      <span className="truncate">{label}</span>
      {tag && (
        <span
          className="shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-black tracking-widest sm:text-[9px]"
          style={{ background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}40` }}
        >
          {tag}
        </span>
      )}
      {subType === "soft" && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black tracking-widest sm:text-[9px]"
          style={{ background: "rgba(34,211,238,0.15)", color: "rgba(34,211,238,0.9)", border: "1px solid rgba(34,211,238,0.25)" }}
        >
          S-SUB
        </span>
      )}
      {subType === "hard" && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black tracking-widest sm:text-[9px]"
          style={{ background: "rgba(251,191,36,0.12)", color: "rgba(251,191,36,0.85)", border: "1px solid rgba(251,191,36,0.25)" }}
        >
          H-SUB
        </span>
      )}
    </button>
  );
}

export function SeasonRail({ seasons, activeHref, accentColor = "#ff5500" }: { seasons: AnimeSeasonEntry[]; activeHref: string; accentColor?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accentRgb = (() => {
    const hex = accentColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r},${g},${b}`;
  })();

  if (seasons.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          Seasons
          <span className="text-xs font-medium text-white/40 bg-white/5 rounded-full px-2 py-0.5">
            {seasons.length}
          </span>
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
            aria-label="Previous seasons"
            className="w-8 h-8 md:w-7 md:h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4 md:w-3.5 md:h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
            aria-label="Next seasons"
            className="w-8 h-8 md:w-7 md:h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4 md:w-3.5 md:h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
        {seasons.map((season) => {
          const active = season.isActive || season.href === activeHref;
          return (
            <Link
              key={`${season.href}-${season.title}`}
              href={season.href}
              className={`group relative block min-w-[11rem] overflow-hidden rounded-xl border transition-all shrink-0 ${
                active
                  ? ""
                  : "border-white/8 bg-white/[0.03] hover:border-white/15"
              }`}
              style={active ? { borderColor: `rgba(${accentRgb},0.5)`, background: `rgba(${accentRgb},0.1)` } : undefined}
            >
              {season.poster ? (
                <div className="absolute inset-0">
                  <img
                    src={season.poster}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover opacity-30 transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
                </div>
              ) : null}
              <div className="relative flex flex-col justify-end p-4 min-h-[7rem]">
                <p className="text-sm font-bold text-white">{season.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    active ? "text-white" : "bg-white/10 text-white/60"
                  }`} style={active ? { backgroundColor: accentColor } : undefined}>
                    {season.episodeCount ? `${season.episodeCount} EPS` : season.episodeLabel || "Open"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function EpisodeNumberGrid({
  episodes,
  activeNumber,
  onSelect,
  onHover,
  watchedSet = new Set(),
  accentColor = "#ff5500",
  isHostLocked = false,
}: {
  episodes: Pick<EpisodeModel, "number" | "title" | "isSubbed" | "isDubbed">[];
  activeNumber: number;
  onSelect: (num: number) => void;
  onHover?: (num: number) => void;
  watchedSet?: Set<number>;
  accentColor?: string;
  isHostLocked?: boolean;
}) {
  const [rangeStart, setRangeStart] = useState(0);
  const CHUNK_SIZE = 100;
  const totalChunks = Math.ceil(episodes.length / CHUNK_SIZE);

  useEffect(() => {
    const idx = episodes.findIndex((ep) => ep.number === activeNumber);
    if (idx >= 0) {
      setRangeStart(Math.floor(idx / CHUNK_SIZE) * CHUNK_SIZE);
    } else {
      // If the active episode isn't in the list (e.g. newly airing or beyond list boundaries),
      // default to the chunk closest to the active episode or the last chunk.
      const closestIdx = episodes.findIndex((ep) => ep.number > activeNumber);
      if (closestIdx >= 0) {
        setRangeStart(Math.floor(closestIdx / CHUNK_SIZE) * CHUNK_SIZE);
      } else if (episodes.length > 0) {
        setRangeStart(Math.floor((episodes.length - 1) / CHUNK_SIZE) * CHUNK_SIZE);
      }
    }
  }, [activeNumber, episodes]);

  const visibleEpisodes = episodes.slice(rangeStart, rangeStart + CHUNK_SIZE);
  const rangeLabel = `${String(episodes[rangeStart]?.number || 1).padStart(3, "0")}-${String(
    episodes[Math.min(rangeStart + CHUNK_SIZE - 1, episodes.length - 1)]?.number || CHUNK_SIZE,
  ).padStart(3, "0")}`;

  return (
    <div>
      {totalChunks > 1 && (
        <div className="flex items-center justify-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setRangeStart(Math.max(0, rangeStart - CHUNK_SIZE))}
            disabled={rangeStart === 0}
            aria-label="Previous episode range"
            className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="text-xs text-white/50 font-medium tracking-wider min-w-[5rem] text-center">
            {rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => setRangeStart(Math.min(episodes.length - 1, rangeStart + CHUNK_SIZE))}
            disabled={rangeStart + CHUNK_SIZE >= episodes.length}
            aria-label="Next episode range"
            className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5">
        {visibleEpisodes.map((ep) => {
          const isActive = ep.number === activeNumber;
          const isWatched = watchedSet.has(ep.number);
          return (
            <button
              key={ep.number}
              type="button"
              disabled={isHostLocked}
              title={isHostLocked ? "Episode navigation is controlled by the room host" : undefined}
              onClick={() => onSelect(ep.number)}
              onMouseEnter={() => onHover?.(ep.number)}
              onFocus={() => onHover?.(ep.number)}
              aria-label={`${ep.title}${isWatched ? ", watched" : ""}`}
              data-active-episode={isActive ? "true" : undefined}
              className={`
                relative h-10 min-w-0 rounded-md text-xs font-bold transition-colors md:h-9
                ${isHostLocked ? "opacity-40 cursor-not-allowed" : ""}
                ${isActive
                  ? "text-white"
                  : isWatched
                    ? "text-white/90 border transition-all duration-200 hover:brightness-110"
                    : "bg-white/[0.06] text-white/60 hover:bg-white/12 hover:text-white border border-white/[0.06]"
                }
              `}
              style={isActive
                ? { backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}66` }
                : isWatched
                  ? { backgroundColor: `${accentColor}99`, borderColor: `${accentColor}66` }
                  : undefined}
            >
              {isActive ? <Play className="mx-auto h-4 w-4 fill-current" aria-hidden="true" /> : ep.number}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function summarizeServerGroups(serverOptions: ServerOption[]) {
  const isDesidub = serverOptions.some((entry) => entry.provider === "desidub");
  const allSubServers = isDesidub ? [] : serverOptions.filter((entry) => entry.category === "sub" || !entry.category);
  return {
    isDesidub,
    // Legacy: all sub servers combined (used for fallback displays)
    subServers: allSubServers,
    // Soft sub: clean video + external VTT overlay (subType === "soft" or untagged HLS options)
    softSubServers: allSubServers.filter((entry) => entry.subType === "soft" || !entry.subType),
    // Hard sub: subtitles burnt into the video (subType === "hard")
    hardSubServers: allSubServers.filter((entry) => entry.subType === "hard"),
    dubServers: isDesidub ? [] : serverOptions.filter((entry) => entry.category === "dub"),
    hindiServers: isDesidub ? serverOptions : [],
  };
}
