"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { BellRing, Play, Sparkles, Bookmark } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import type { FollowedReleaseUpdate } from "@/lib/anilist/release-updates";
import { getBookmarks, BOOKMARKS_UPDATED_EVENT } from "@/lib/anime/bookmarks";
import { getRecentlyWatched, subscribeToWatchHistory } from "@/lib/anime/watch-history";

function parseAnilistId(rawId: string | number): number {
  if (typeof rawId === "number") return rawId;
  if (!rawId) return 0;
  const str = String(rawId).trim();
  if (str.startsWith("anilist~")) {
    const num = Number(str.replace("anilist~", ""));
    return Number.isInteger(num) ? num : 0;
  }
  const num = Number(str);
  return Number.isInteger(num) ? num : 0;
}

export default function FollowedReleaseUpdatesRail() {
  const { status } = useSession();
  const [updates, setUpdates] = useState<FollowedReleaseUpdate[]>([]);
  const [isAnilistSynced, setIsAnilistSynced] = useState(false);

  const fetchAllUpdates = useCallback(async () => {
    const combinedUpdates: FollowedReleaseUpdate[] = [];
    const seenKeys = new Set<string>();

    // 1. If signed in with AniList, fetch remote AniList updates
    if (status === "authenticated") {
      try {
        const response = await fetch("/api/anilist/release-updates", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.ok) {
          const payload = await response.json();
          if (Array.isArray(payload?.updates) && payload.updates.length > 0) {
            for (const item of payload.updates) {
              if (!seenKeys.has(item.key)) {
                seenKeys.add(item.key);
                combinedUpdates.push(item);
              }
            }
            setIsAnilistSynced(true);
          }
        }
      } catch (err) {
        console.error("[FollowedReleaseUpdatesRail] AniList fetch error:", err);
      }
    }

    // 2. Fetch local updates from local bookmarks & watch history
    try {
      const localBookmarks = getBookmarks();
      const localHistory = getRecentlyWatched(30);

      const localItemsMap = new Map<number, { id: number; progress: number; status: string }>();

      for (const item of localHistory) {
        const id = parseAnilistId(item.animeId);
        if (id > 0) {
          localItemsMap.set(id, {
            id,
            progress: item.lastEpisode || 0,
            status: "CURRENT",
          });
        }
      }

      for (const entry of localBookmarks) {
        const id = parseAnilistId(entry.animeId);
        if (id > 0 && !localItemsMap.has(id)) {
          localItemsMap.set(id, {
            id,
            progress: 0,
            status: (entry.status || "PLANNING").toUpperCase(),
          });
        }
      }

      const items = Array.from(localItemsMap.values());
      if (items.length > 0) {
        const res = await fetch("/api/anilist/release-updates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });

        if (res.ok) {
          const payload = await res.json();
          if (Array.isArray(payload?.updates)) {
            for (const item of payload.updates) {
              if (!seenKeys.has(item.key)) {
                seenKeys.add(item.key);
                combinedUpdates.push(item);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[FollowedReleaseUpdatesRail] Local updates error:", err);
    }

    combinedUpdates.sort((a, b) => b.sortAt - a.sortAt);
    setUpdates(combinedUpdates.slice(0, 16));
  }, [status]);

  useEffect(() => {
    fetchAllUpdates();

    const unsubHistory = subscribeToWatchHistory(() => fetchAllUpdates());
    const handleBookmarkUpdate = () => fetchAllUpdates();
    if (typeof window !== "undefined") {
      window.addEventListener(BOOKMARKS_UPDATED_EVENT, handleBookmarkUpdate);
    }

    return () => {
      unsubHistory();
      if (typeof window !== "undefined") {
        window.removeEventListener(BOOKMARKS_UPDATED_EVENT, handleBookmarkUpdate);
      }
    };
  }, [fetchAllUpdates]);

  if (updates.length === 0) return null;

  return (
    <section className="relative">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#22d3ee]/15 text-[#22d3ee]">
            <BellRing className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-white">New from Your List</h2>
            <p className="truncate text-[11px] font-medium text-white/40">
              New episodes and seasons from anime you follow
            </p>
          </div>
        </div>

        {isAnilistSynced ? (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[10px] font-bold text-white/50 sm:inline-flex">
            <Sparkles className="h-3 w-3 text-cyan-400" aria-hidden="true" />
            AniList Synced
          </span>
        ) : (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[10px] font-bold text-white/50 sm:inline-flex">
            <Bookmark className="h-3 w-3 text-[#22d3ee]" aria-hidden="true" />
            My Watchlist
          </span>
        )}
      </div>

      {/* Horizontal Rail of Anime Poster Cards */}
      <div className="flex gap-3.5 sm:gap-4 overflow-x-auto pb-2 hide-scrollbar -mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16">
        {updates.map((update) => {
          const accent = update.accentColor || "#22d3ee";
          const badgeText =
            update.kind === "season"
              ? "New Season"
              : update.newEpisodeCount === 1
                ? `Ep ${update.latestEpisode} Out`
                : `${update.newEpisodeCount} New Eps`;

          return (
            <div
              key={update.key}
              className="group relative min-w-[145px] sm:min-w-[165px] max-w-[145px] sm:max-w-[165px] aspect-[2/3] shrink-0"
            >
              <Link href={update.href} className="block w-full h-full">
                <div
                  className="relative w-full h-full rounded-2xl overflow-hidden border bg-[#121316] transition-all duration-300 shadow-lg hover:shadow-2xl group-hover:-translate-y-1"
                  style={{
                    borderColor: "rgba(255, 255, 255, 0.08)",
                    ["--accent-color" as any]: accent,
                  }}
                >
                  {/* Poster Image */}
                  {update.poster ? (
                    <img
                      src={update.poster}
                      alt={update.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                      <Play className="w-8 h-8 text-white/20" />
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />

                  {/* Pill Tag — Top Left (Matching User Reference Image) */}
                  <div className="absolute top-2.5 left-2.5 z-10">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider backdrop-blur-md bg-black/60 shadow-md"
                      style={{
                        color: accent,
                        borderColor: `${accent}60`,
                        boxShadow: `0 2px 10px ${accent}25`,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
                      {badgeText}
                    </span>
                  </div>

                  {/* Hover Play Button Overlay — Translucent Glass with Accent Border & Icon */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md bg-black/60 border shadow-xl scale-90 group-hover:scale-105 transition-transform"
                      style={{
                        borderColor: `${accent}80`,
                        color: accent,
                        boxShadow: `0 0 20px ${accent}40, inset 0 0 12px ${accent}15`,
                      }}
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" style={{ color: accent }} />
                    </div>
                  </div>

                  {/* Bottom Details */}
                  <div className="absolute bottom-0 left-0 right-0 p-3.5 z-10">
                    <h3 className="text-xs sm:text-sm font-extrabold text-white line-clamp-2 leading-tight transition-colors mb-1 group-hover:text-[var(--accent-color)]">
                      {update.title}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] font-medium text-white/60 line-clamp-1">
                      {update.kind === "season"
                        ? `New season available`
                        : update.progress > 0
                          ? `Watched ep ${update.progress}`
                          : `Ep ${update.latestEpisode} available`}
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
