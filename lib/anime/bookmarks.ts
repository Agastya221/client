"use client";

import {
  bookmarksToList,
  mergeBookmarks,
  type BookmarkEntry,
  type BookmarkStore,
} from "@/lib/anime/bookmarks-shared";

const STORAGE_KEY = "animekai:bookmarks";
const REMOTE_SYNC_DEBOUNCE_MS = 900;
export const BOOKMARKS_UPDATED_EVENT = "animekai:bookmarks-updated";

type RemoteBookmarkPayload = {
  animeId: string;
  title: string;
  poster: string | null;
  href: string;
  status: string;
  timestamp: number;
};

let authState: "unknown" | "guest" | "authenticated" = "unknown";
let hasHydratedFromAccount = false;
let hydrationPromise: Promise<void> | null = null;
let flushTimer: number | null = null;
let pendingClear = false;
const pendingRemovals = new Set<string>();
const pendingUpserts = new Map<string, RemoteBookmarkPayload>();

export function setBookmarksAuthentication(authenticated: boolean): void {
  authState = authenticated ? "authenticated" : "guest";

  if (!authenticated || typeof window === "undefined") return;
  if (pendingClear || pendingRemovals.size > 0 || pendingUpserts.size > 0) {
    queueRemoteFlush();
  }
}

function readBookmarks(): BookmarkStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BookmarkStore) : {};
  } catch {
    return {};
  }
}

function writeBookmarks(bookmarks: BookmarkStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    window.dispatchEvent(new CustomEvent(BOOKMARKS_UPDATED_EVENT));
  } catch {
    // best effort only
  }
}

function toRemotePayload(entry: BookmarkEntry): RemoteBookmarkPayload {
  return {
    animeId: entry.animeId,
    title: entry.title,
    poster: entry.poster,
    href: entry.href,
    status: entry.status,
    timestamp: entry.lastUpdated,
  };
}

function queueRemoteFlush(): void {
  if (typeof window === "undefined") return;
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushRemoteSync();
  }, REMOTE_SYNC_DEBOUNCE_MS);
}

function queueBookmarkUpsert(animeId: string): void {
  const bookmarks = readBookmarks();
  const entry = bookmarks[animeId];
  if (!entry) return;

  pendingClear = false;
  pendingRemovals.delete(animeId);
  pendingUpserts.set(animeId, toRemotePayload(entry));
  queueRemoteFlush();
}

async function flushRemoteSync(): Promise<void> {
  if (typeof window === "undefined") return;
  if (authState !== "authenticated") return;

  try {
    if (pendingClear) {
      const response = await fetch("/api/bookmarks", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        authState = "guest";
        return;
      }
      pendingClear = false;
    }

    for (const animeId of Array.from(pendingRemovals)) {
      const response = await fetch(`/api/bookmarks?animeId=${encodeURIComponent(animeId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        authState = "guest";
        return;
      }
      pendingRemovals.delete(animeId);
    }

    if (pendingUpserts.size > 0) {
      const response = await fetch("/api/bookmarks", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: Array.from(pendingUpserts.values()),
        }),
      });
      if (response.status === 401) {
        authState = "guest";
        return;
      }
      if (response.ok) {
        pendingUpserts.clear();
        authState = "authenticated";
      }
    }
  } catch {
    // retry on next successful flush
  }
}

function rowsToStore(rows: unknown): BookmarkStore {
  if (!Array.isArray(rows)) return {};

  const store: BookmarkStore = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const animeId = String(value.animeId || "").trim();
    if (!animeId) continue;

    store[animeId] = {
      animeId,
      title: String(value.title || "").trim(),
      poster: value.poster ? String(value.poster) : null,
      href: String(value.href || "").trim(),
      status: String(value.status || "PLAN_TO_WATCH"),
      lastUpdated: Math.max(
        0,
        Date.parse(String(value.updatedAt || "")) || Number(value.lastUpdated || 0),
      ),
    };
  }

  return store;
}

export async function ensureBookmarksHydrated(): Promise<void> {
  if (typeof window === "undefined") return;
  if (hasHydratedFromAccount || authState !== "authenticated") return;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      const response = await fetch("/api/bookmarks", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 401) {
        authState = "guest";
        return;
      }

      if (!response.ok) return;

      authState = "authenticated";
      const remoteRows = await response.json().catch(() => []);
      let merged = mergeBookmarks(rowsToStore(remoteRows), readBookmarks());

      // Also pull AniList list and merge entries in for 2-way sync
      try {
        const anilistRes = await fetch("/api/anilist/user-list", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (anilistRes.ok) {
          const anilistData = await anilistRes.json().catch(() => null);
          const anilistEntries: Array<{
            animeId: string;
            title: string;
            poster: string | null;
            href: string;
            status: string;
            updatedAt: number;
          }> = anilistData?.entries ?? [];

          const anilistStore: BookmarkStore = {};
          for (const entry of anilistEntries) {
            anilistStore[entry.animeId] = {
              animeId: entry.animeId,
              title: entry.title,
              poster: entry.poster,
              href: entry.href,
              status: entry.status,
              lastUpdated: entry.updatedAt,
            };
          }
          // AniList is source of truth for status; local store wins on newer timestamp
          merged = mergeBookmarks(anilistStore, merged);
        }
      } catch {
        // AniList sync is best-effort; local state is still valid
      }

      writeBookmarks(merged);
      hasHydratedFromAccount = true;

      const entries = Object.values(merged).map(toRemotePayload);
      if (entries.length > 0) {
        await fetch("/api/bookmarks", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        }).catch(() => undefined);
      }
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

export function subscribeToBookmarks(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleCustomUpdate = () => listener();
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === STORAGE_KEY) listener();
  };

  window.addEventListener(BOOKMARKS_UPDATED_EVENT, handleCustomUpdate);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(BOOKMARKS_UPDATED_EVENT, handleCustomUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getBookmarks(): BookmarkEntry[] {
  return bookmarksToList(readBookmarks());
}

export function isBookmarked(animeId: string): boolean {
  return Boolean(readBookmarks()[animeId]);
}

export function saveBookmark(input: {
  animeId: string;
  title: string;
  poster: string | null;
  href: string;
  status?: string;
}): void {
  const bookmarks = readBookmarks();
  bookmarks[input.animeId] = {
    animeId: input.animeId,
    title: input.title,
    poster: input.poster,
    href: input.href,
    status: input.status || bookmarks[input.animeId]?.status || "PLAN_TO_WATCH",
    lastUpdated: Date.now(),
  };
  writeBookmarks(bookmarks);
  queueBookmarkUpsert(input.animeId);
}

export function removeBookmark(animeId: string): void {
  const bookmarks = readBookmarks();
  delete bookmarks[animeId];
  writeBookmarks(bookmarks);
  pendingUpserts.delete(animeId);
  pendingRemovals.add(animeId);
  queueRemoteFlush();
}

export function clearBookmarks(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(BOOKMARKS_UPDATED_EVENT));
  pendingClear = true;
  pendingRemovals.clear();
  pendingUpserts.clear();
  queueRemoteFlush();
}

export type { BookmarkEntry, BookmarkStore };
