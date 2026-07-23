/**
 * AniList User API — requires an AniList OAuth access token.
 *
 * Used for:
 *  1. Fetching the user's CURRENT watching list so we can show "Continue Watching"
 *  2. Updating episode progress when the user watches an episode
 */

const ANILIST_URL = "https://graphql.anilist.co";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnilistWatchingEntry {
  anilistId: number;
  title: string;
  poster: string | null;
  progress: number;       // episodes watched
  totalEpisodes: number | null;
  watchHref: string;
  score: number | null;
  status: string;
}

// ─── Queries ───────────────────────────────────────────────────────────────

const WATCHING_LIST_QUERY = `
  query WatchingList($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME, status: CURRENT, sort: UPDATED_TIME_DESC) {
      lists {
        entries {
          progress
          score
          media {
            id
            title { english romaji }
            coverImage { large }
            episodes
            status
          }
        }
      }
    }
  }
`;

const UPDATE_PROGRESS_MUTATION = `
  mutation UpdateProgress($mediaId: Int, $progress: Int) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress) {
      id
      progress
      status
    }
  }
`;

const GET_VIEWER_ID_QUERY = `
  query { Viewer { id } }
`;

const LIST_ENTRY_QUERY = `
  query ListEntry($mediaId: Int) {
    Media(id: $mediaId, type: ANIME) {
      mediaListEntry {
        id
        status
        progress
        score
      }
    }
  }
`;

const FOLLOWED_RELEASES_QUERY = `
  query FollowedReleases($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME) {
      lists {
        entries {
          status
          progress
          updatedAt
          media {
            id
            title { userPreferred english romaji }
            coverImage { extraLarge large color }
            bannerImage
            format
            episodes
            status
            seasonYear
            startDate { year month day }
            nextAiringEpisode { episode airingAt }
            relations {
              edges {
                relationType
                node {
                  id
                  title { userPreferred english romaji }
                  coverImage { extraLarge large color }
                  bannerImage
                  format
                  episodes
                  status
                  seasonYear
                  startDate { year month day }
                  nextAiringEpisode { episode airingAt }
                }
              }
            }
          }
        }
      }
    }
  }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

async function anilistUserQuery<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    throw new Error(`AniList user API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message || "AniList user query failed");
  }

  return json.data as T;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch the viewer's AniList user ID using their access token.
 */
export async function getAnilistViewerId(accessToken: string): Promise<number | null> {
  try {
    const data = await anilistUserQuery<{ Viewer: { id: number } }>(
      accessToken,
      GET_VIEWER_ID_QUERY,
    );
    return data.Viewer?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the user's CURRENT (watching) anime list from AniList.
 * Returns entries sorted by most recently updated.
 */
export async function getAnilistWatchingList(
  accessToken: string,
  userId: number,
): Promise<AnilistWatchingEntry[]> {
  try {
    const data = await anilistUserQuery<{
      MediaListCollection: {
        lists: Array<{
          entries: Array<{
            progress: number;
            score: number | null;
            media: {
              id: number;
              title: { english: string | null; romaji: string };
              coverImage: { large: string };
              episodes: number | null;
              status: string;
            };
          }>;
        }>;
      };
    }>(accessToken, WATCHING_LIST_QUERY, { userId });

    const entries = data.MediaListCollection?.lists?.flatMap((list) => list.entries) ?? [];

    return entries
      .filter((entry) => entry.media?.id)
      .map((entry) => {
        const media = entry.media;
        const title = media.title.english || media.title.romaji || `Anime ${media.id}`;
        const nextEp = Math.max(1, entry.progress + 1);

        return {
          anilistId: media.id,
          title,
          poster: media.coverImage.large || null,
          progress: entry.progress,
          totalEpisodes: media.episodes ?? null,
          watchHref: `/anime/anilist~${media.id}/watch?ep=${nextEp}`,
          score: entry.score ?? null,
          status: media.status,
        };
      });
  } catch {
    return [];
  }
}

export type AnilistListEntry = {
  id: number;
  status: string;
  progress: number;
  score: number | null;
};

/**
 * Read the signed-in viewer's list entry for one anime.
 * AniList exposes mediaListEntry only when the request is authenticated.
 */
export async function getAnilistListEntry(
  accessToken: string,
  mediaId: number,
): Promise<AnilistListEntry | null> {
  const data = await anilistUserQuery<{
    Media: {
      mediaListEntry: AnilistListEntry | null;
    } | null;
  }>(accessToken, LIST_ENTRY_QUERY, { mediaId });

  return data.Media?.mediaListEntry ?? null;
}

/**
 * Fetch list entries plus sequel/airing metadata used by the personalized
 * release rail. The caller caches the derived result, not the OAuth token.
 */
export async function getAnilistFollowedReleaseEntries(
  accessToken: string,
  userId: number,
) {
  const data = await anilistUserQuery<{
    MediaListCollection: {
      lists: Array<{
        entries: import("@/lib/anilist/release-updates").FollowedReleaseListEntry[];
      }>;
    } | null;
  }>(accessToken, FOLLOWED_RELEASES_QUERY, { userId });

  return data.MediaListCollection?.lists?.flatMap((list) => list.entries) ?? [];
}

/**
 * Update the user's episode progress on AniList.
 * Called when the user watches an episode.
 * Silently fails — never blocks the player.
 */
export async function updateAnilistProgress(
  accessToken: string,
  mediaId: number,
  progress: number,
): Promise<boolean> {
  try {
    await anilistUserQuery(accessToken, UPDATE_PROGRESS_MUTATION, {
      mediaId,
      progress,
    });
    return true;
  } catch {
    return false;
  }
}
