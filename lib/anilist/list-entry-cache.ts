import type { AnimeListStatus } from "@/lib/anilist/list-status";

export const ANILIST_LIST_ENTRY_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ANILIST_USER_LIST_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export type CachedAnilistListEntry = {
  id: number | null;
  status: AnimeListStatus;
  progress: number;
  score: number | null;
};

export type CachedAnilistListEntryEnvelope = {
  entry: CachedAnilistListEntry | null;
};

export function anilistListEntryCacheKey(userId: string | number, mediaId: number): string {
  return `anilist:list-entry:user:${userId}:media:${mediaId}`;
}
