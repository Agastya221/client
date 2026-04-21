"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Trash2, ChevronRight } from "lucide-react";
import {
  clearBookmarks,
  ensureBookmarksHydrated,
  getBookmarks,
  removeBookmark as removeStoredBookmark,
  subscribeToBookmarks,
  type BookmarkEntry,
} from "@/lib/anime/bookmarks";

type BookmarkItem = BookmarkEntry;

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "WATCHING", label: "Watching" },
  { key: "COMPLETED", label: "Completed" },
  { key: "PLAN_TO_WATCH", label: "Plan to Watch" },
  { key: "ON_HOLD", label: "On Hold" },
  { key: "DROPPED", label: "Dropped" },
] as const;

export default function MyListPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");

  useEffect(() => {
    const syncBookmarks = () => {
      setBookmarks(getBookmarks());
      setLoading(false);
    };

    syncBookmarks();
    void ensureBookmarksHydrated().finally(syncBookmarks);

    return subscribeToBookmarks(syncBookmarks);
  }, []);

  const removeBookmark = (animeId: string) => {
    removeStoredBookmark(animeId);
    setBookmarks((prev) => prev.filter((b) => b.animeId !== animeId));
  };

  const filtered = activeTab === "ALL"
    ? bookmarks
    : bookmarks.filter((b) => b.status === activeTab);

  return (
    <>
      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Bookmark className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">My Collection</p>
          </div>
          <h1 className="text-4xl font-black text-white mb-2">My List</h1>
          <p className="text-white/40 text-sm">Your personal anime watchlist. Stored locally and synced when you sign in.</p>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-none">
          {STATUS_TABS.map((tab) => {
            const count = tab.key === "ALL" ? bookmarks.length : bookmarks.filter((b) => b.status === tab.key).length;
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

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 gap-y-8">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] rounded-xl bg-white/5" />
                <div className="mt-2 h-4 rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-6xl mb-4">📚</p>
            <p className="text-white/50 text-lg font-semibold">
              {activeTab === "ALL" ? "Your list is empty" : `No anime with status "${STATUS_TABS.find((t) => t.key === activeTab)?.label}"`}
            </p>
            <p className="text-white/25 text-sm mt-2">Bookmark anime from their detail pages to add them here.</p>
            <Link href="/search" className="mt-6 inline-flex items-center gap-2 text-[#ff5500] text-sm font-bold hover:underline">
              Browse anime <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 gap-y-8">
            {filtered.map((bm) => (
              <div key={bm.animeId} className="group relative">
                <Link href={bm.href}>
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-white/5 border border-white/5 group-hover:border-white/15 transition-all">
                    {bm.poster ? (
                      <img src={bm.poster} alt={bm.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">No Image</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    {/* Status badge */}
                    <div className="absolute top-2 left-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/60 text-white/80 backdrop-blur-sm">
                        {bm.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white/80 group-hover:text-white line-clamp-2 transition-colors">{bm.title}</p>
                </Link>
                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => removeBookmark(bm.animeId)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/80 transition-all"
                >
                  <Trash2 className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {bookmarks.length > 0 && (
          <div className="mt-10 flex justify-end">
            <button
              type="button"
              onClick={() => {
                clearBookmarks();
                setBookmarks([]);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear List
            </button>
          </div>
        )}
      </section>
    </>
  );
}
