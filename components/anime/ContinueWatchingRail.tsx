"use client";

import {
  getRecentlyWatched,
  removeFromHistory,
  subscribeToWatchHistory,
  type WatchHistoryEntry,
} from "@/lib/anime/watch-history";
import type { AnilistWatchingEntry } from "@/lib/anilist/user";
import { Clock, Play, Trash2, X, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function ContinueWatchingRail() {
  const [localItems, setLocalItems] = useState<(WatchHistoryEntry & { animeId: string })[]>([]);
  const [anilistItems, setAnilistItems] = useState<AnilistWatchingEntry[]>([]);
  const [dismissed, setDismissed] = useState(false);

  // Load local watch history (from localStorage)
  useEffect(() => {
    const syncItems = () => setLocalItems(getRecentlyWatched(12));
    syncItems();
    return subscribeToWatchHistory(syncItems);
  }, []);

  // Load AniList watching list if user is logged in with AniList
  useEffect(() => {
    async function fetchAnilistWatching() {
      try {
        const res = await fetch("/api/anilist-watching", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.entries) && data.entries.length > 0) {
          setAnilistItems(data.entries.slice(0, 12));
        }
      } catch {
        // silently fail — AniList sync is a bonus feature
      }
    }
    fetchAnilistWatching();
  }, []);

  const hasContent = localItems.length > 0 || anilistItems.length > 0;
  if (!hasContent || dismissed) return null;

  const handleRemove = (animeId: string) => {
    removeFromHistory(animeId);
    setLocalItems((prev) => prev.filter((item) => item.animeId !== animeId));
  };

  return (
    <section className="relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center">
            <Clock className="w-4 h-4 text-white/60" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Continue Watching</h2>
            <p className="text-[11px] text-white/40 font-medium">
              Pick up where you left off
              {anilistItems.length > 0 && (
                <span className="ml-2 text-[#02A9FF]/70 font-bold">· AniList synced</span>
              )}
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

      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar -mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16">
        {/* AniList watching entries (shown first if available) */}
        {anilistItems.map((item) => (
          <div
            key={`anilist-${item.anilistId}`}
            className="group relative min-w-[160px] max-w-[160px] shrink-0"
          >
            <Link href={item.watchHref} className="block">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-[#02A9FF]/20 bg-white/[0.03]">
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

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                {/* AniList badge */}
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-[#02A9FF]/90 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  <Zap className="w-2 h-2" />
                  AL
                </div>

                {/* Hover play */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-[#02A9FF]/90 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(2,169,255,0.4)]">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-[11px] text-white/60 font-medium mb-0.5">
                    EP {item.progress + 1}
                    {item.totalEpisodes ? ` / ${item.totalEpisodes}` : ""}
                  </p>
                  <p className="text-xs font-bold text-white line-clamp-2 leading-tight">
                    {item.title}
                  </p>
                  {/* Progress bar */}
                  {item.totalEpisodes && item.totalEpisodes > 0 && (
                    <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#02A9FF] transition-all"
                        style={{ width: `${Math.min(100, (item.progress / item.totalEpisodes) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </div>
        ))}

        {/* Local watch history entries */}
        {localItems.map((item) => {
          const watchedCount = Object.values(item.episodes).filter((ep) => ep.progress >= 0.8).length;
          const lastProgress = item.episodes[String(item.lastEpisode)];
          const progressPercent = lastProgress ? Math.round(lastProgress.progress * 100) : 0;

          return (
            <div
              key={item.animeId}
              className="group relative min-w-[160px] max-w-[160px] shrink-0"
            >
              <Link
                href={`${item.href}/watch?ep=${item.lastEpisode}&provider=${item.provider}`}
                className="block"
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-white/8 bg-white/[0.03]">
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

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.15)] ring-1 ring-white/20">
                      <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-[11px] text-white/60 font-medium mb-0.5">
                      EP {item.lastEpisode} {watchedCount > 1 ? `· ${watchedCount} watched` : ""}
                    </p>
                    <p className="text-xs font-bold text-white line-clamp-2 leading-tight">
                      {item.title}
                    </p>

                    {progressPercent > 0 && progressPercent < 100 && (
                      <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-white/50 transition-all"
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

              <button
                type="button"
                onClick={() => handleRemove(item.animeId)}
                className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                title="Remove from history"
              >
                <Trash2 className="w-3 h-3 text-white" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
