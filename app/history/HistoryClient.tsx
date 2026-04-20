"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Play, Trash2, ChevronRight } from "lucide-react";
import {
  clearHistory as clearWatchHistory,
  getContinueWatching,
  removeFromHistory,
  subscribeToWatchHistory,
  type WatchHistoryEntry,
} from "@/lib/anime/watch-history";

export default function HistoryPage() {
  const [history, setHistory] = useState<(WatchHistoryEntry & { animeId: string })[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const syncHistory = () => {
      setHistory(getContinueWatching());
      setLoaded(true);
    };

    syncHistory();

    return subscribeToWatchHistory(syncHistory);
  }, []);

  const clearHistory = () => {
    clearWatchHistory();
    setHistory([]);
  };

  const removeEntry = (animeId: string) => {
    removeFromHistory(animeId);
    setHistory((prev) => prev.filter((entry) => entry.animeId !== animeId));
  };

  const formatTime = (ms: number) => {
    const date = new Date(ms);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <Clock className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-purple-400">Your Activity</p>
            </div>
            <h1 className="text-4xl font-black text-white mb-2">Watch History</h1>
            <p className="text-white/40 text-sm">{history.length} anime watched • Stored locally in your browser</p>
          </div>

          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          )}
        </div>

        {!loaded ? (
          <div className="grid gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-6xl mb-4">📺</p>
            <p className="text-white/40 text-lg font-semibold">No watch history yet</p>
            <p className="text-white/20 text-sm mt-2">Start watching anime and your history will appear here.</p>
            <Link href="/" className="mt-6 inline-flex items-center gap-2 text-[#ff5500] text-sm font-bold hover:underline">
              Browse anime <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {history.map((entry) => {
              const animeId = entry.animeId;
              const epKeys = Object.keys(entry.episodes);
              const latestEpKey = epKeys.sort((a, b) => (entry.episodes[b]?.timestamp || 0) - (entry.episodes[a]?.timestamp || 0))[0];
              const latestProgress = latestEpKey ? entry.episodes[latestEpKey] : null;
              const progressPercent = latestProgress ? Math.round(latestProgress.progress * 100) : 0;

              return (
                <div
                  key={animeId}
                  className="flex items-center gap-4 rounded-xl bg-white/[0.03] border border-white/5 p-3 hover:bg-white/[0.06] transition-all group"
                >
                  {/* Poster */}
                  <Link href={entry.href} className="shrink-0">
                    {entry.poster ? (
                      <img src={entry.poster} alt={entry.title} className="w-16 h-22 rounded-lg object-cover" />
                    ) : (
                      <div className="w-16 h-22 rounded-lg bg-white/10 flex items-center justify-center text-white/20 text-xs">No img</div>
                    )}
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link href={entry.href} className="text-sm font-bold text-white group-hover:text-[#ff5500] transition-colors truncate block">
                      {entry.title}
                    </Link>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-white/40">
                      <span>EP {entry.lastEpisode}</span>
                      <span>•</span>
                      <span>{epKeys.length} ep{epKeys.length !== 1 ? "s" : ""} watched</span>
                      <span>•</span>
                      <span>{formatTime(entry.lastUpdated)}</span>
                    </div>
                    {/* Progress bar */}
                    {latestProgress && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-white/10 max-w-[200px]">
                          <div
                            className="h-full rounded-full bg-[#ff5500]"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/30">{progressPercent}%</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`${entry.href}/watch?ep=${entry.lastEpisode}&provider=${entry.provider}`}
                      className="w-8 h-8 rounded-full bg-[#ff5500]/15 flex items-center justify-center hover:bg-[#ff5500]/30 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-[#ff5500] fill-[#ff5500] ml-0.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeEntry(animeId)}
                      className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-red-500/15 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
