export type BookmarkEntry = {
  animeId: string;
  title: string;
  poster: string | null;
  href: string;
  status: string;
  lastUpdated: number;
};

export type BookmarkStore = Record<string, BookmarkEntry>;

function titleScore(value: string | null | undefined): number {
  const normalized = value?.trim();
  if (!normalized) return 0;

  let score = 1;
  if (/\s/.test(normalized)) score += 2;
  if (/[A-Z]/.test(normalized)) score += 1;
  if (normalized.length >= 12) score += 1;
  if (/^(anilist|animekai|desidub|hianime)[:~]/i.test(normalized)) score -= 4;
  return score;
}

function mergeBookmarkEntry(
  current: BookmarkEntry | null | undefined,
  incoming: BookmarkEntry | null | undefined,
): BookmarkEntry {
  const currentUpdated = current?.lastUpdated || 0;
  const incomingUpdated = incoming?.lastUpdated || 0;
  const preferIncoming = incomingUpdated >= currentUpdated;

  return {
    animeId: incoming?.animeId || current?.animeId || "",
    title:
      titleScore(incoming?.title) >= titleScore(current?.title)
        ? incoming?.title || current?.title || ""
        : current?.title || incoming?.title || "",
    poster:
      (preferIncoming ? incoming?.poster : current?.poster) ??
      current?.poster ??
      incoming?.poster ??
      null,
    href:
      (preferIncoming ? incoming?.href : current?.href) ||
      current?.href ||
      incoming?.href ||
      "",
    status:
      (preferIncoming ? incoming?.status : current?.status) ||
      current?.status ||
      incoming?.status ||
      "PLAN_TO_WATCH",
    lastUpdated: Math.max(currentUpdated, incomingUpdated),
  };
}

export function mergeBookmarks(current: BookmarkStore, incoming: BookmarkStore): BookmarkStore {
  const animeIds = new Set([...Object.keys(current), ...Object.keys(incoming)]);
  const merged: BookmarkStore = {};

  for (const animeId of animeIds) {
    merged[animeId] = mergeBookmarkEntry(current[animeId], incoming[animeId]);
  }

  return merged;
}

export function bookmarksToList(bookmarks: BookmarkStore): BookmarkEntry[] {
  return Object.values(bookmarks).sort((left, right) => right.lastUpdated - left.lastUpdated);
}
