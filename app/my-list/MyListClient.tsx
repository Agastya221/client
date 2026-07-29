"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Trash2, ChevronRight, RefreshCw, CheckCircle2, Play, LogIn, Zap } from "lucide-react";
import {
  clearBookmarks,
  ensureBookmarksHydrated,
  getBookmarks,
  removeBookmark as removeStoredBookmark,
  subscribeToBookmarks,
  type BookmarkEntry,
} from "@/lib/anime/bookmarks";
import { getWatchedEpisodes } from "@/lib/anime/watch-history";

interface AniListEntry {
  animeId: string;
  rawId: number;
  title: string;
  poster: string | null;
  banner: string | null;
  href: string;
  status: string;
  progress: number;
  episodes: number | null;
  score: number;
  format: string | null;
  genres: string[];
  updatedAt: number;
}

type UnifiedListItem = {
  animeId: string;
  title: string;
  poster: string | null;
  href: string;
  status: string;
  progress?: number;
  episodes?: number | null;
  score?: number;
  source: "ANILIST" | "LOCAL";
};

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "WATCHING", label: "Watching" },
  { key: "COMPLETED", label: "Completed" },
  { key: "PLAN_TO_WATCH", label: "Plan to Watch" },
  { key: "ON_HOLD", label: "On Hold" },
  { key: "DROPPED", label: "Dropped" },
] as const;

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; id?: string };

interface MyListClientProps {
  user: SessionUser | null;
}

export default function MyListClient({ user }: MyListClientProps) {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(user);
  const [localBookmarks, setLocalBookmarks] = useState<BookmarkEntry[]>([]);
  const [anilistEntries, setAnilistEntries] = useState<AniListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingAnilist, setIsFetchingAnilist] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "ANILIST" | "LOCAL">("ALL");

  useEffect(() => {
    if (user) {
      setSessionUser(user);
    } else {
      fetch("/api/auth/session", { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setSessionUser(data?.user ?? null))
        .catch(() => setSessionUser(null));
    }
  }, [user]);

  useEffect(() => {
    const syncBookmarks = () => {
      setLocalBookmarks(getBookmarks());
      setLoading(false);
    };

    syncBookmarks();
    void ensureBookmarksHydrated().finally(syncBookmarks);

    return subscribeToBookmarks(syncBookmarks);
  }, []);

  // Fetch AniList MediaList Collection when user is signed in
  useEffect(() => {
    if (!sessionUser) return;

    const userName = sessionUser.name || "";
    const userId = (sessionUser as any).id || "";

    let isMounted = true;
    setIsFetchingAnilist(true);

    const queryParams = new URLSearchParams();
    if (userName) queryParams.set("userName", userName);
    if (userId) queryParams.set("userId", String(userId));

    fetch(`/api/anilist/user-list?${queryParams.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.entries) {
          setAnilistEntries(data.entries);
        }
      })
      .catch((err) => console.error("[MyList] Failed to fetch AniList collection:", err))
      .finally(() => {
        if (isMounted) setIsFetchingAnilist(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sessionUser?.id, sessionUser?.name]);

  const removeBookmark = (animeId: string) => {
    removeStoredBookmark(animeId);
    setLocalBookmarks((prev) => prev.filter((b) => b.animeId !== animeId));
  };

  // Combine AniList & Local Bookmarks cleanly (avoiding duplicates)
  const combinedList: UnifiedListItem[] = [];
  const seenIds = new Set<string>();

  // Add AniList entries first
  for (const entry of anilistEntries) {
    seenIds.add(entry.animeId);

    // Compute max progress between AniList server progress and local watch history
    const watchedSet = getWatchedEpisodes(entry.animeId);
    const maxLocalEp = watchedSet.size > 0 ? Math.max(...Array.from(watchedSet)) : 0;
    const effectiveProgress = Math.max(entry.progress || 0, maxLocalEp);

    const targetEp = effectiveProgress > 0 ? effectiveProgress : 1;
    const watchHref = entry.href.includes("/watch")
      ? entry.href.replace(/ep=\d+/, `ep=${targetEp}`)
      : `${entry.href.replace(/\/$/, "")}/watch?ep=${targetEp}`;

    combinedList.push({
      animeId: entry.animeId,
      title: entry.title,
      poster: entry.poster,
      href: watchHref,
      status: entry.status,
      progress: effectiveProgress,
      episodes: entry.episodes,
      score: entry.score,
      source: "ANILIST",
    });
  }

  // Add Local Bookmarks if not already in AniList
  for (const local of localBookmarks) {
    if (!seenIds.has(local.animeId)) {
      seenIds.add(local.animeId);

      const watchedSet = getWatchedEpisodes(local.animeId);
      const maxLocalEp = watchedSet.size > 0 ? Math.max(...Array.from(watchedSet)) : 0;

      combinedList.push({
        animeId: local.animeId,
        title: local.title,
        poster: local.poster,
        href: local.href,
        status: local.status,
        progress: maxLocalEp,
        source: "LOCAL",
      });
    }
  }

  // Apply Source filter
  const sourceFiltered = sourceFilter === "ALL"
    ? combinedList
    : combinedList.filter((item) => item.source === sourceFilter);

  // Apply Status filter
  const filtered = activeTab === "ALL"
    ? sourceFiltered
    : sourceFiltered.filter((item) => item.status === activeTab);

  return (
    <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16 min-h-[85vh]">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Bookmark className="w-4.5 h-4.5 text-amber-400" aria-hidden="true" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">My Collection</p>
          </div>
          <h1 className="text-4xl font-black text-white mb-2">My List</h1>
          <p className="text-white/50 text-sm max-w-xl">
            {sessionUser
              ? `Synced with your AniList account (${sessionUser.name || "User"}).`
              : "Your personal anime watchlist."}
          </p>
        </div>

        {/* AniList Sync Status Badge */}
        {sessionUser && (
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 backdrop-blur-md">
            <img src="https://anilist.co/img/icons/android-chrome-512x512.png" alt="AniList" className="w-6 h-6 rounded-lg" />
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <span>{sessionUser.name || "AniList User"}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 fill-sky-400/20" />
              </div>
              <p className="text-[10px] text-sky-400/80 font-medium">
                {isFetchingAnilist ? "Syncing collection..." : `${anilistEntries.length} items synced`}
              </p>
            </div>
            {isFetchingAnilist && <RefreshCw className="w-4 h-4 text-sky-400 animate-spin ml-2" />}
          </div>
        )}
      </div>

      {/* Premium sign-in CTA for guests — shows above filter bar */}
      {!sessionUser && (
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-[#02A9FF]/20 bg-gradient-to-br from-[#02A9FF]/8 via-[#111215] to-[#0a0b0c] p-6">
          {/* Glow */}
          <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-32 w-64 rounded-full bg-[#02A9FF]/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#02A9FF]/15 border border-[#02A9FF]/20">
              <Zap className="h-6 w-6 text-[#02A9FF]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-black text-white mb-1">Sync with AniList for the full experience</p>
              <p className="text-sm text-white/50 leading-relaxed">
                Sign in to sync your complete AniList watchlist — all your WATCHING, COMPLETED, and PLAN_TO_WATCH entries appear here automatically.
              </p>
            </div>
            <Link
              href="/auth/signin?callbackUrl=/my-list"
              className="shrink-0 flex items-center gap-2 rounded-full bg-[#02A9FF] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#02A9FF]/90 transition-all active:scale-95"
            >
              <LogIn className="h-4 w-4" />
              Sign In with AniList
            </Link>
          </div>
        </div>
      )}

      {/* Filter Bar: Status Tabs & Source Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          {STATUS_TABS.map((tab) => {
            const count = tab.key === "ALL"
              ? sourceFiltered.length
              : sourceFiltered.filter((item) => item.status === tab.key).length;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                  activeTab === tab.key
                    ? "bg-[#ff5500]/15 text-[#ff5500] border-[#ff5500]/25"
                    : "bg-white/5 text-white/50 border-white/8 hover:bg-white/10"
                }`}
              >
                {tab.label}
                {count > 0 && <span className="ml-1.5 text-[10px] opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Source Toggle if AniList & Local both present */}
        {anilistEntries.length > 0 && localBookmarks.length > 0 && (
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-1 rounded-full text-xs font-bold shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setSourceFilter("ALL")}
              className={`px-3 py-1 rounded-full transition-all ${sourceFilter === "ALL" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"}`}
            >
              All ({combinedList.length})
            </button>
            <button
              onClick={() => setSourceFilter("ANILIST")}
              className={`px-3 py-1 rounded-full transition-all flex items-center gap-1.5 ${sourceFilter === "ANILIST" ? "bg-[#02A9FF]/20 text-[#02A9FF]" : "text-white/40 hover:text-white/70"}`}
            >
              AniList ({anilistEntries.length})
            </button>
            <button
              onClick={() => setSourceFilter("LOCAL")}
              className={`px-3 py-1 rounded-full transition-all ${sourceFilter === "LOCAL" ? "bg-amber-500/20 text-amber-400" : "text-white/40 hover:text-white/70"}`}
            >
              Local ({localBookmarks.length})
            </button>
          </div>
        )}
      </div>

      {loading || isFetchingAnilist ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 gap-y-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[2/3] rounded-xl bg-white/5" />
              <div className="mt-2 h-4 rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-6xl mb-4" aria-hidden="true">📚</p>
          <p className="text-white/50 text-lg font-semibold">
            {activeTab === "ALL" ? "Your list is empty" : `No anime with status "${STATUS_TABS.find((t) => t.key === activeTab)?.label}"`}
          </p>
          <p className="text-white/25 text-sm mt-2">
            {sessionUser
              ? "Add anime to your AniList watchlist or bookmark them on Yorumi."
              : "Bookmark anime from detail pages to build your collection."}
          </p>
          <Link href="/search" className="mt-6 inline-flex items-center gap-2 text-[#ff5500] text-sm font-bold hover:underline">
            Browse anime <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 gap-y-8">
          {filtered.map((item) => (
            <div key={item.animeId} className="group relative">
              <Link href={item.href} prefetch={false}>
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/5 group-hover:border-white/15 transition-all">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">No Image</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ff5500] text-white text-xs font-black shadow-lg scale-90 group-hover:scale-100 transition-transform">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{item.progress && item.progress > 0 ? `Ep ${item.progress}` : "Watch"}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/70 text-white/90 backdrop-blur-md border border-white/10">
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* AniList sync indicator */}
                  {item.source === "ANILIST" && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#02A9FF]/80 backdrop-blur-md flex items-center justify-center shadow-lg">
                      <img src="https://anilist.co/img/icons/android-chrome-512x512.png" alt="" className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* Progress overlay badge */}
                  {item.progress !== undefined && item.progress > 0 && (
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-extrabold text-white px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/10">
                      <span className="text-amber-400">Progress</span>
                      <span>
                        {item.progress} {item.episodes ? `/ ${item.episodes}` : "eps"}
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-white/80 group-hover:text-white line-clamp-2 transition-colors">{item.title}</p>
              </Link>

              {/* Remove button for Local bookmarks */}
              {item.source === "LOCAL" && (
                <button
                  type="button"
                  onClick={() => removeBookmark(item.animeId)}
                  aria-label={`Remove ${item.title} from list`}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/80 transition-all"
                >
                  <Trash2 className="w-3 h-3 text-white" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {localBookmarks.length > 0 && (
        <div className="mt-12 flex justify-end">
          <button
            type="button"
            onClick={() => {
              clearBookmarks();
              setLocalBookmarks([]);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Clear Local Bookmarks
          </button>
        </div>
      )}
    </section>
  );
}
