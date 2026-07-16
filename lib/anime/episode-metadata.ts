import type { EpisodeModel, WatchSessionModel } from "./types";

export interface EpisodeDisplayMetadata {
  number: number;
  title: string | null;
  image: string | null;
}

function isGenericEpisodeTitle(title: string): boolean {
  return /^episode\s+\d+(?:\.\d+)?$/i.test(title.trim());
}

function mergeEpisodeDisplayMetadata(
  episode: EpisodeModel,
  metadata: EpisodeDisplayMetadata | undefined,
): EpisodeModel {
  if (!metadata) return episode;

  const title = metadata.title && isGenericEpisodeTitle(episode.title)
    ? metadata.title
    : episode.title;
  // AniZip screen caps are episode-specific. Prefer them over provider images,
  // which are sometimes the same series banner repeated for every episode.
  const image = metadata.image || episode.image || null;

  if (title === episode.title && image === (episode.image || null)) {
    return episode;
  }

  return {
    ...episode,
    title,
    image,
  };
}

function artworkIdentity(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

/**
 * Returns only real episode artwork. A series poster/banner is never accepted
 * as a loading fallback for the player or episode rail.
 */
export function getEpisodeArtworkUrl(
  image: string | null | undefined,
  anime: Pick<WatchSessionModel["anime"], "banner" | "poster">,
): string | null {
  const candidate = artworkIdentity(image);
  if (!candidate) return null;

  const seriesArtwork = new Set([
    artworkIdentity(anime.banner),
    artworkIdentity(anime.poster),
  ].filter(Boolean));

  return seriesArtwork.has(candidate) ? null : image!.trim();
}

/**
 * Adds deferred display metadata without replacing provider episode fields or
 * any playback/source state on the active watch session.
 */
export function mergeEpisodeMetadataIntoWatchSession(
  session: WatchSessionModel,
  metadata: EpisodeDisplayMetadata[],
): WatchSessionModel {
  if (metadata.length === 0) return session;

  const metadataByNumber = new Map(metadata.map((entry) => [entry.number, entry]));
  let episodesChanged = false;
  const episodes = session.episodes.map((episode) => {
    const merged = mergeEpisodeDisplayMetadata(episode, metadataByNumber.get(episode.number));
    if (merged !== episode) episodesChanged = true;
    return merged;
  });
  const episode = mergeEpisodeDisplayMetadata(
    session.episode,
    metadataByNumber.get(session.episode.number),
  );

  if (!episodesChanged && episode === session.episode) return session;

  return {
    ...session,
    episodes: episodesChanged ? episodes : session.episodes,
    episode,
  };
}
