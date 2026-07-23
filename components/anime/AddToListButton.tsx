"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Check,
  Loader2,
  Minus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  ensureBookmarksHydrated,
  getBookmarks,
  isBookmarked as getBookmarkState,
  removeBookmark,
  saveBookmark,
  setBookmarksAuthentication,
  subscribeToBookmarks,
} from "@/lib/anime/bookmarks";
import {
  configureAnilistListEntryCache,
  deleteCachedAnilistListEntry,
  readCachedAnilistListEntry,
  writeCachedAnilistListEntry,
} from "@/lib/anilist/list-entry-client";
import type { CachedAnilistListEntry } from "@/lib/anilist/list-entry-cache";
import { fromAnilistListStatus } from "@/lib/anilist/list-status";

interface AddToListButtonProps {
  animeId: string;
  title: string;
  poster: string;
  href: string;
  variant?: "default" | "compact";
  totalEpisodes?: number | null;
  /** Numeric AniList media ID for reliable save-entry calls */
  rawMediaId?: number | null;
}

const ANILIST_STATUSES = [
  { key: "WATCHING", label: "Watching", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30" },
  { key: "COMPLETED", label: "Completed", color: "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30" },
  { key: "PLAN_TO_WATCH", label: "Plan to Watch", color: "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30" },
  { key: "ON_HOLD", label: "On Hold", color: "bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30" },
  { key: "DROPPED", label: "Dropped", color: "bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30" },
] as const;

export default function AddToListButton({
  animeId,
  title,
  poster,
  href,
  variant = "default",
  totalEpisodes,
  rawMediaId,
}: AddToListButtonProps) {
  const { data: session, status: sessionStatus } = useSession();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>("PLAN_TO_WATCH");
  const [progress, setProgress] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const syncState = () => {
      const bookmarked = getBookmarkState(animeId);
      setIsBookmarked(bookmarked);

      const all = getBookmarks();
      const match = all.find((b) => b.animeId === animeId);
      if (match) {
        setCurrentStatus(match.status || "PLAN_TO_WATCH");
      }
    };

    syncState();
    return subscribeToBookmarks(syncState);
  }, [animeId]);

  useEffect(() => {
    if (sessionStatus === "loading") return;

    let cancelled = false;
    const controller = new AbortController();
    const authenticated = sessionStatus === "authenticated";
    configureAnilistListEntryCache(authenticated ? session?.user?.id : null);
    setBookmarksAuthentication(authenticated);
    setChecked(false);

    const syncLocalState = () => {
      const all = getBookmarks();
      const match = all.find((bookmark) => bookmark.animeId === animeId);
      setIsBookmarked(Boolean(match));
      if (match) setCurrentStatus(match.status || "PLAN_TO_WATCH");
    };

    async function resolveListState() {
      if (!authenticated) {
        syncLocalState();
        if (!cancelled) setChecked(true);
        return;
      }

      try {
        const applyEntry = (entry: CachedAnilistListEntry) => {
          const nextStatus = String(entry.status || "PLAN_TO_WATCH");
          const nextProgress = Math.max(0, Number(entry.progress || 0));
          setIsBookmarked(true);
          setCurrentStatus(nextStatus);
          setProgress(nextProgress);
          const existing = getBookmarks().find((bookmark) => bookmark.animeId === animeId);
          if (!existing || existing.status !== nextStatus) {
            saveBookmark({
              animeId,
              title,
              poster,
              href,
              status: nextStatus,
            });
          }
        };

        const cachedBeforeHydration = rawMediaId
          ? readCachedAnilistListEntry(rawMediaId)
          : null;
        if (cachedBeforeHydration) {
          syncLocalState();
          if (cachedBeforeHydration.entry) applyEntry(cachedBeforeHydration.entry);
          void ensureBookmarksHydrated();
          return;
        }

        await ensureBookmarksHydrated();
        if (cancelled) return;
        syncLocalState();

        if (!rawMediaId) return;

        const hydratedEntry = readCachedAnilistListEntry(rawMediaId);
        if (hydratedEntry) {
          if (hydratedEntry.entry) applyEntry(hydratedEntry.entry);
          return;
        }

        const response = await fetch(
          `/api/anilist/list-entry?mediaId=${encodeURIComponent(String(rawMediaId))}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) return;

        const payload = await response.json();
        if (cancelled) return;
        const entry = payload?.entry;
        if (entry) {
          applyEntry(entry);
        }
        writeCachedAnilistListEntry(rawMediaId, entry || null);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("[AddToListButton] AniList status error:", error);
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    void resolveListState();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [animeId, href, poster, rawMediaId, session?.user?.id, sessionStatus, title]);

  // Quick toggle when clicking main Add to List button
  const handleQuickToggle = async () => {
    if (loading) return;

    if (isBookmarked) {
      // If already bookmarked, open the manage modal so user can change status or remove
      setIsModalOpen(true);
      return;
    }

    // Add to list as PLAN_TO_WATCH
    setLoading(true);
    try {
      saveBookmark({
        animeId,
        title,
        poster,
        href,
        status: "PLAN_TO_WATCH",
      });
      setIsBookmarked(true);
      setCurrentStatus("PLAN_TO_WATCH");
      if (rawMediaId) {
        writeCachedAnilistListEntry(rawMediaId, {
          id: null,
          status: "PLAN_TO_WATCH",
          progress: 0,
          score: null,
        });
      }

      // Sync with AniList if logged in
      if (session?.user) {
        void fetch("/api/anilist/save-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animeId,
            rawMediaId: rawMediaId ?? undefined,
            title,
            status: "PLAN_TO_WATCH",
          }),
        })
          .then(async (response) => {
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success) {
              if (rawMediaId) deleteCachedAnilistListEntry(rawMediaId);
              return;
            }
            if (rawMediaId && payload.entry) {
              writeCachedAnilistListEntry(rawMediaId, {
                id: Number(payload.entry.id) || null,
                status: fromAnilistListStatus(payload.entry.status),
                progress: Math.max(0, Number(payload.entry.progress || 0)),
                score: payload.entry.score ?? null,
              });
            }
          })
          .catch((err) => {
            if (rawMediaId) deleteCachedAnilistListEntry(rawMediaId);
            console.error("[AddToListButton] AniList save error:", err);
          });
      }
    } finally {
      setLoading(false);
    }
  };

  // Full status/progress update from Modal
  const handleUpdateEntry = async (newStatus?: string, newProgress?: number) => {
    setLoading(true);
    setSynced(false);

    const targetStatus = newStatus !== undefined ? newStatus : currentStatus;
    const targetProgress = newProgress !== undefined ? newProgress : progress;

    try {
      // Update local storage
      saveBookmark({
        animeId,
        title,
        poster,
        href,
        status: targetStatus,
      });
      setIsBookmarked(true);
      if (newStatus) setCurrentStatus(newStatus);
      if (newProgress !== undefined) setProgress(newProgress);
      if (rawMediaId) {
        writeCachedAnilistListEntry(rawMediaId, {
          id: null,
          status: targetStatus as CachedAnilistListEntry["status"],
          progress: targetProgress,
          score: null,
        });
      }

      // Sync with AniList if logged in
      if (session?.user) {
        const res = await fetch("/api/anilist/save-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animeId,
            rawMediaId: rawMediaId ?? undefined,
            title,
            status: targetStatus,
            progress: targetProgress,
          }),
        });
        const payload = await res.json().catch(() => null);
        if (res.ok && payload?.success) {
          if (rawMediaId && payload.entry) {
            writeCachedAnilistListEntry(rawMediaId, {
              id: Number(payload.entry.id) || null,
              status: fromAnilistListStatus(payload.entry.status),
              progress: Math.max(0, Number(payload.entry.progress || 0)),
              score: payload.entry.score ?? null,
            });
          }
          setSynced(true);
          setTimeout(() => setSynced(false), 2500);
        } else if (rawMediaId) {
          deleteCachedAnilistListEntry(rawMediaId);
        }
      }
    } catch (err) {
      if (rawMediaId) deleteCachedAnilistListEntry(rawMediaId);
      console.error("[AddToListButton] Update error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Remove bookmark & delete from AniList
  const handleRemoveEntry = async () => {
    setLoading(true);
    try {
      removeBookmark(animeId);
      setIsBookmarked(false);
      setIsModalOpen(false);
      if (rawMediaId) writeCachedAnilistListEntry(rawMediaId, null);

      if (session?.user) {
        void fetch(`/api/anilist/save-entry?animeId=${encodeURIComponent(animeId)}`, {
          method: "DELETE",
        })
          .then((response) => {
            if (!response.ok && rawMediaId) deleteCachedAnilistListEntry(rawMediaId);
          })
          .catch((err) => {
            if (rawMediaId) deleteCachedAnilistListEntry(rawMediaId);
            console.error("[AddToListButton] AniList delete error:", err);
          });
      }
    } finally {
      setLoading(false);
    }
  };

  const currentStatusObj =
    ANILIST_STATUSES.find((s) => s.key === currentStatus) || ANILIST_STATUSES[2];

  if (!checked) {
    if (variant === "compact") {
      return (
        <button
          type="button"
          disabled
          className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#0e0f11] border border-white/5 text-white/40"
        >
          <Loader2 className="w-5 h-5 animate-spin" />
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-2 text-white/40 font-bold text-sm px-6 py-4 rounded-full bg-white/5 border border-white/10"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading...
      </button>
    );
  }

  return (
    <>
      {/* Trigger Button */}
      {variant === "compact" ? (
        <button
          type="button"
          onClick={handleQuickToggle}
          disabled={loading}
          className={`flex items-center justify-center w-12 h-12 rounded-lg border transition-colors active:scale-95 ${
            isBookmarked
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
              : "bg-[#0e0f11] text-white/70 hover:text-white border-white/5 hover:bg-white/5 hover:border-white/10"
          }`}
          title={isBookmarked ? "Manage List Entry" : "Add to List"}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isBookmarked ? (
            <BookmarkCheck className="w-5 h-5 fill-current" />
          ) : (
            <Bookmark className="w-5 h-5" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleQuickToggle}
          disabled={loading}
          className={`flex items-center gap-2.5 font-bold text-sm px-6 py-4 rounded-full transition-all border shadow-lg active:scale-95 ${
            isBookmarked
              ? "bg-white/10 text-white border-white/20 hover:bg-white/15"
              : "bg-white/10 text-white/80 hover:text-white border-white/10 hover:bg-white/15"
          }`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isBookmarked ? (
            <>
              <BookmarkCheck className="w-4 h-4 text-amber-400 fill-current" />
              <span>In My List</span>
              <span
                className={`px-2 py-0.5 rounded-md border text-[10px] uppercase font-black tracking-wider ${currentStatusObj.color}`}
              >
                {currentStatusObj.label}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-white/50 ml-0.5" />
            </>
          ) : (
            <>
              <Bookmark className="w-4 h-4" />
              <span>Add to List</span>
            </>
          )}
        </button>
      )}

      {/* Unified Manage Modal Popover - FIXED overlay to guarantee zero cut-off */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          {/* Backdrop Click */}
          <div
            className="fixed inset-0"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-md rounded-3xl bg-[#0f1117] border border-white/15 p-6 shadow-[0_24px_48px_rgba(0,0,0,0.8)] z-[101] animate-in zoom-in-95 duration-150 text-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                {session?.user ? (
                  <img
                    src="https://anilist.co/img/icons/android-chrome-512x512.png"
                    alt="AniList"
                    className="w-5 h-5 rounded-md shadow"
                  />
                ) : (
                  <Bookmark className="w-5 h-5 text-amber-400" />
                )}
                <div>
                  <h4 className="text-sm font-black tracking-tight">
                    {session?.user ? "Manage List & AniList Sync" : "Manage My List"}
                  </h4>
                  <p className="text-[11px] text-white/40 truncate max-w-[220px] sm:max-w-[280px]">
                    {title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status Selector Grid */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-white/40">
                  Watch Status
                </label>
                {synced && (
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Synced to AniList
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ANILIST_STATUSES.map((st) => {
                  const isActive = currentStatus === st.key;
                  return (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => handleUpdateEntry(st.key)}
                      disabled={loading}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left border flex items-center justify-between ${
                        isActive
                          ? st.color
                          : "bg-white/5 border-white/5 text-white/60 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <span>{st.label}</span>
                      {isActive && <Check className="w-4 h-4 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Episode Progress Section (if signed in or tracking) */}
            {session?.user && (
              <div className="mb-6 bg-white/5 border border-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-white/40">
                    Watched Episode Progress
                  </label>
                  <span className="text-xs font-black text-white">
                    {progress} {totalEpisodes ? `/ ${totalEpisodes}` : "eps"}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateEntry(undefined, Math.max(0, progress - 1))}
                    disabled={loading || progress <= 0}
                    className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white disabled:opacity-30 transition-all active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={totalEpisodes || 9999}
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    onBlur={() => handleUpdateEntry(undefined, progress)}
                    className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-center text-sm font-bold text-white focus:outline-none focus:border-[#02A9FF]"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateEntry(undefined, progress + 1)}
                    disabled={loading}
                    className="w-10 h-10 rounded-xl bg-[#02A9FF]/20 hover:bg-[#02A9FF]/30 border border-[#02A9FF]/40 flex items-center justify-center text-[#02A9FF] transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleRemoveEntry}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove</span>
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
