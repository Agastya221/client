"use client";

import { getRecentlyWatched, type WatchHistoryEntry } from "@/lib/anime/watch-history";
import { Clock, Play, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { removeFromHistory } from "@/lib/anime/watch-history";

export default function ContinueWatchingRail() {
  const [items, setItems] = useState<(WatchHistoryEntry & { animeId: string })[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setItems(getRecentlyWatched(12));
  }, []);

  if (items.length === 0 || dismissed) return null;

  const handleRemove = (animeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromHistory(animeId);
    setItems((prev) => prev.filter((item) => item.animeId !== animeId));
  };

  return (
    <section className="relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#ff5500]/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-[#ff5500]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Continue Watching</h2>
            <p className="text-[11px] text-white/40 font-medium">
              Pick up where you left off
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-white/30 hover:text-white/60 transition-colors p-1"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar -mx-1 px-1">
        {items.map((item) => {
          // Calculate which episodes are watched
          const watchedCount = Object.values(item.episodes).filter((ep) => ep.progress >= 0.8).length;
          const lastProgress = item.episodes[String(item.lastEpisode)];
          const progressPercent = lastProgress ? Math.round(lastProgress.progress * 100) : 0;

          return (
            <Link
              key={item.animeId}
              href={`${item.href}/watch?ep=${item.lastEpisode}&provider=${item.provider}`}
              className="group relative min-w-[160px] max-w-[160px] shrink-0"
            >
              {/* Card */}
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-white/8 bg-white/[0.03]">
                {/* Poster */}
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
                    <Play className="w-8 h-8 text-white/20" />
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => handleRemove(item.animeId, e)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                  title="Remove from history"
                >
                  <Trash2 className="w-3 h-3 text-white" />
                </button>

                {/* Hover play overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-[#ff5500]/90 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(255,85,0,0.4)]">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>

                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-[11px] text-white/60 font-medium mb-0.5">
                    EP {item.lastEpisode} {watchedCount > 1 ? `· ${watchedCount} watched` : ""}
                  </p>
                  <p className="text-xs font-bold text-white line-clamp-2 leading-tight">
                    {item.title}
                  </p>

                  {/* Progress bar */}
                  {progressPercent > 0 && progressPercent < 100 && (
                    <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#ff5500] transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                  {progressPercent >= 100 && (
                    <div className="mt-2 h-1 rounded-full bg-emerald-500/60" />
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
