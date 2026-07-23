export type FollowedReleaseMedia = {
  id: number;
  title: {
    userPreferred?: string | null;
    english?: string | null;
    romaji?: string | null;
  };
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    color?: string | null;
  } | null;
  bannerImage?: string | null;
  format?: string | null;
  episodes?: number | null;
  status?: string | null;
  seasonYear?: number | null;
  startDate?: {
    year?: number | null;
    month?: number | null;
    day?: number | null;
  } | null;
  nextAiringEpisode?: {
    episode?: number | null;
    airingAt?: number | null;
  } | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: FollowedReleaseMedia | null;
    } | null> | null;
  } | null;
};

export type FollowedReleaseListEntry = {
  status?: string | null;
  progress?: number | null;
  updatedAt?: number | null;
  media?: FollowedReleaseMedia | null;
};

export type FollowedReleaseUpdate = {
  key: string;
  kind: "episode" | "season";
  mediaId: number;
  sourceMediaId: number;
  title: string;
  sourceTitle: string;
  poster: string | null;
  banner: string | null;
  accentColor: string | null;
  format: string | null;
  seasonYear: number | null;
  progress: number;
  latestEpisode: number;
  newEpisodeCount: number;
  href: string;
  sortAt: number;
};

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
const ELIGIBLE_LIST_STATUSES = new Set(["CURRENT", "REPEATING", "PAUSED", "PLANNING", "COMPLETED"]);

function mediaTitle(media: FollowedReleaseMedia): string {
  return (
    media.title.userPreferred?.trim() ||
    media.title.english?.trim() ||
    media.title.romaji?.trim() ||
    `Anime ${media.id}`
  );
}

function positiveInteger(value: number | null | undefined): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0;
}

function startTimestamp(media: FollowedReleaseMedia): number {
  const year = positiveInteger(media.startDate?.year);
  if (!year) return 0;
  const month = Math.min(12, Math.max(1, positiveInteger(media.startDate?.month) || 1));
  const day = Math.min(31, Math.max(1, positiveInteger(media.startDate?.day) || 1));
  return Date.UTC(year, month - 1, day);
}

function latestAiredEpisode(media: FollowedReleaseMedia, nowMs: number): number {
  const nextEpisode = positiveInteger(media.nextAiringEpisode?.episode);
  const nextAiringAt = positiveInteger(media.nextAiringEpisode?.airingAt) * 1000;
  if (nextEpisode > 0) {
    return nextAiringAt > nowMs
      ? Math.max(0, nextEpisode - 1)
      : nextEpisode;
  }

  if (String(media.status || "").toUpperCase() === "FINISHED") {
    return positiveInteger(media.episodes);
  }

  const startedAt = startTimestamp(media);
  return startedAt > 0 && startedAt <= nowMs ? 1 : 0;
}

function artwork(media: FollowedReleaseMedia) {
  return {
    poster: media.coverImage?.extraLarge || media.coverImage?.large || null,
    banner: media.bannerImage || null,
    accentColor: media.coverImage?.color || null,
  };
}

export function buildFollowedReleaseUpdates(
  entries: FollowedReleaseListEntry[],
  nowMs = Date.now(),
  limit = 12,
): FollowedReleaseUpdate[] {
  const listedMediaIds = new Set(
    entries
      .map((entry) => positiveInteger(entry.media?.id))
      .filter((mediaId) => mediaId > 0),
  );
  const validEntries = entries.filter((entry) => {
    const mediaId = positiveInteger(entry.media?.id);
    const status = String(entry.status || "").toUpperCase();
    return mediaId > 0 && ELIGIBLE_LIST_STATUSES.has(status);
  });
  const updates = new Map<string, FollowedReleaseUpdate>();

  for (const entry of validEntries) {
    const media = entry.media!;
    const listStatus = String(entry.status || "").toUpperCase();
    const progress = Math.max(0, positiveInteger(entry.progress));
    const latestEpisode = latestAiredEpisode(media, nowMs);
    const isActiveListEntry = ["CURRENT", "REPEATING", "PAUSED", "PLANNING"].includes(listStatus);

    if (
      isActiveListEntry &&
      String(media.status || "").toUpperCase() === "RELEASING" &&
      latestEpisode > progress
    ) {
      const title = mediaTitle(media);
      const nextAiringAt = positiveInteger(media.nextAiringEpisode?.airingAt) * 1000;
      updates.set(`episode:${media.id}`, {
        key: `episode:${media.id}`,
        kind: "episode",
        mediaId: media.id,
        sourceMediaId: media.id,
        title,
        sourceTitle: title,
        ...artwork(media),
        format: media.format || null,
        seasonYear: media.seasonYear || null,
        progress,
        latestEpisode,
        newEpisodeCount: latestEpisode - progress,
        href: `/anime/anilist~${media.id}/watch?ep=${progress + 1}`,
        sortAt: nextAiringAt || Number(entry.updatedAt || 0) * 1000,
      });
    }

    for (const edge of media.relations?.edges || []) {
      const sequel = edge?.node;
      if (String(edge?.relationType || "").toUpperCase() !== "SEQUEL" || !sequel?.id) continue;
      if (listedMediaIds.has(sequel.id)) continue;

      const sequelStatus = String(sequel.status || "").toUpperCase();
      const sequelStartedAt = startTimestamp(sequel);
      const recentlyFinished =
        sequelStatus === "FINISHED" &&
        sequelStartedAt > 0 &&
        nowMs - sequelStartedAt <= SIX_MONTHS_MS;
      if (sequelStatus !== "RELEASING" && !recentlyFinished) continue;

      const sequelLatestEpisode = latestAiredEpisode(sequel, nowMs);
      if (sequelLatestEpisode <= 0) continue;

      const key = `season:${sequel.id}`;
      const existing = updates.get(key);
      const sourceTitle = mediaTitle(media);
      if (existing && existing.sortAt >= sequelStartedAt) continue;

      updates.set(key, {
        key,
        kind: "season",
        mediaId: sequel.id,
        sourceMediaId: media.id,
        title: mediaTitle(sequel),
        sourceTitle,
        ...artwork(sequel),
        format: sequel.format || null,
        seasonYear: sequel.seasonYear || null,
        progress: 0,
        latestEpisode: sequelLatestEpisode,
        newEpisodeCount: sequelLatestEpisode,
        href: `/anime/anilist~${sequel.id}`,
        sortAt: sequelStartedAt || Number(entry.updatedAt || 0) * 1000,
      });
    }
  }

  return Array.from(updates.values())
    .sort((left, right) => right.sortAt - left.sortAt)
    .slice(0, Math.max(0, limit));
}
