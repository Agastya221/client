"use client";

import type {
  CachedAnilistListEntry,
  CachedAnilistListEntryEnvelope,
} from "@/lib/anilist/list-entry-cache";

const STORAGE_PREFIX = "animeplay:anilist-list-entry:v1";
const CLIENT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StoredEntry = CachedAnilistListEntryEnvelope & {
  cachedAt: number;
};

let activeUserId: string | null = null;
const memoryCache = new Map<string, StoredEntry>();

function cacheKey(mediaId: number): string | null {
  if (!activeUserId || !Number.isInteger(mediaId) || mediaId <= 0) return null;
  return `${activeUserId}:${mediaId}`;
}

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}:${key}`;
}

export function configureAnilistListEntryCache(userId: string | null | undefined): void {
  activeUserId = userId ? String(userId) : null;
}

export function readCachedAnilistListEntry(
  mediaId: number,
): CachedAnilistListEntryEnvelope | null {
  const key = cacheKey(mediaId);
  if (!key) return null;

  const memoryValue = memoryCache.get(key);
  if (memoryValue && Date.now() - memoryValue.cachedAt <= CLIENT_CACHE_TTL_MS) {
    return { entry: memoryValue.entry };
  }

  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredEntry;
    if (
      !Number.isFinite(stored.cachedAt) ||
      Date.now() - stored.cachedAt > CLIENT_CACHE_TTL_MS
    ) {
      window.sessionStorage.removeItem(storageKey(key));
      return null;
    }
    memoryCache.set(key, stored);
    return { entry: stored.entry ?? null };
  } catch {
    return null;
  }
}

export function writeCachedAnilistListEntry(
  mediaId: number,
  entry: CachedAnilistListEntry | null,
): void {
  const key = cacheKey(mediaId);
  if (!key) return;

  const stored: StoredEntry = {
    entry,
    cachedAt: Date.now(),
  };
  memoryCache.set(key, stored);

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(stored));
  } catch {
    // Memory caching still prevents repeated requests in this page session.
  }
}

export function deleteCachedAnilistListEntry(mediaId: number): void {
  const key = cacheKey(mediaId);
  if (!key) return;
  memoryCache.delete(key);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch {
    // Best effort; the in-memory entry has already been removed.
  }
}
