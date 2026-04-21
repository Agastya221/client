"use client";

import type { AnimeSeasonEntry, EpisodeModel, ServerOption } from "@/lib/anime/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function ControlBtn({
  icon: Icon,
  label,
  active,
  accent,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors
        rounded-md select-none whitespace-nowrap
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:bg-white/8"}
        ${active && accent ? "text-[#ff5500]" : active ? "text-white" : "text-white/60"}
      `}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function ServerButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors border ${
        active
          ? "bg-[#4ade80] text-black border-[#4ade80]/60 shadow-[0_0_10px_rgba(74,222,128,0.2)]"
          : "bg-white/[0.04] text-white/60 border-white/8 hover:bg-white/8 hover:text-white hover:border-white/15"
      }`}
    >
      {label}
    </button>
  );
}

export function SeasonRail({ seasons, activeHref }: { seasons: AnimeSeasonEntry[]; activeHref: string }) {
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
          <button type="button" className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
        {seasons.map((season) => {
          const active = season.isActive || season.href === activeHref;
          return (
            <Link
              key={`${season.href}-${season.title}`}
              href={season.href}
              className={`group relative block min-w-[11rem] overflow-hidden rounded-xl border transition-all shrink-0 ${
                active
                  ? "border-[#ff5500]/50 bg-[#ff5500]/10"
                  : "border-white/8 bg-white/[0.03] hover:border-white/15"
              }`}
            >
              {season.poster ? (
                <div className="absolute inset-0">
                  <img
                    src={season.poster}
                    alt={season.title}
                    className="h-full w-full object-cover opacity-30 transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
                </div>
              ) : null}
              <div className="relative flex flex-col justify-end p-4 min-h-[7rem]">
                <p className="text-sm font-bold text-white">{season.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    active ? "bg-[#ff5500] text-white" : "bg-white/10 text-white/60"
                  }`}>
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
}: {
  episodes: Pick<EpisodeModel, "number" | "title" | "isSubbed" | "isDubbed">[];
  activeNumber: number;
  onSelect: (num: number) => void;
  onHover?: (num: number) => void;
  watchedSet?: Set<number>;
}) {
  const [rangeStart, setRangeStart] = useState(0);
  const CHUNK_SIZE = 100;
  const totalChunks = Math.ceil(episodes.length / CHUNK_SIZE);

  useEffect(() => {
    const idx = episodes.findIndex((ep) => ep.number === activeNumber);
    if (idx >= 0) {
      setRangeStart(Math.floor(idx / CHUNK_SIZE) * CHUNK_SIZE);
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
            className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-white/50 font-medium tracking-wider min-w-[5rem] text-center">
            {rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => setRangeStart(Math.min(episodes.length - 1, rangeStart + CHUNK_SIZE))}
            disabled={rangeStart + CHUNK_SIZE >= episodes.length}
            className="w-7 h-7 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {visibleEpisodes.map((ep) => {
          const isActive = ep.number === activeNumber;
          const isWatched = watchedSet.has(ep.number);
          return (
            <button
              key={ep.number}
              type="button"
              onClick={() => onSelect(ep.number)}
              onMouseEnter={() => onHover?.(ep.number)}
              onFocus={() => onHover?.(ep.number)}
              title={`${ep.title}${isWatched ? " ✓ Watched" : ""}`}
              className={`
                relative w-10 h-9 rounded-md text-xs font-bold transition-colors
                ${isActive
                  ? "bg-[#ff5500] text-white shadow-[0_0_12px_rgba(255,85,0,0.4)]"
                  : isWatched
                    ? "bg-emerald-500/15 text-emerald-400/80 border border-emerald-500/20 hover:bg-emerald-500/25"
                    : "bg-white/[0.06] text-white/60 hover:bg-white/12 hover:text-white border border-white/[0.06]"
                }
              `}
            >
              {ep.number}
              {isWatched && !isActive && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function summarizeServerGroups(serverOptions: ServerOption[]) {
  const isDesidub = serverOptions.some((entry) => entry.provider === "desidub");
  return {
    isDesidub,
    subServers: isDesidub ? [] : serverOptions.filter((entry) => entry.category !== "dub" && entry.category !== "raw"),
    dubServers: isDesidub ? [] : serverOptions.filter((entry) => entry.category === "dub" || entry.category === "raw"),
    hindiServers: isDesidub ? serverOptions : [],
  };
}
