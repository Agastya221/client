import type { EpisodeModel, WatchSessionModel } from "./types";

export interface EpisodeDisplayMetadata {
  number: number;
  title: string | null;
  image: string | null;
  thumbnail?: string | null;
  description?: string | null;
  airDate?: string | null;
  isSubbed?: boolean;
  isDubbed?: boolean;
  /** Prefer this catalog artwork over a provider screencap for the player. */
  preferArtwork?: boolean;
}

export function mergeEpisodeDisplayMetadataSources(
  primary: EpisodeDisplayMetadata[],
  fallback: EpisodeDisplayMetadata[],
): EpisodeDisplayMetadata[] {
  const entries = new Map(primary.map((entry) => [entry.number, { ...entry }]));

  for (const incoming of fallback) {
    const existing = entries.get(incoming.number);
    entries.set(incoming.number, existing ? {
      ...incoming,
      ...existing,
      title: existing.title || incoming.title,
      image: existing.image || incoming.image,
      thumbnail: existing.thumbnail || incoming.thumbnail,
      description: existing.description || incoming.description,
      airDate: existing.airDate || incoming.airDate,
      isSubbed: incoming.isSubbed ?? existing.isSubbed,
      isDubbed: incoming.isDubbed ?? existing.isDubbed,
    } : { ...incoming });
  }

  return Array.from(entries.values()).sort((left, right) => left.number - right.number);
}

function isGenericEpisodeTitle(title: string): boolean {
  return /^episode\s+\d+(?:\.\d+)?$/i.test(title.trim());
}

export function normalizeEpisodeDescription(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/([A-Za-z])`([A-Za-z])/g, "$1'$2")
    .replace(/\s+Source:\s*[^.?!]+$/i, "")
    .replace(/\s+(?:—|–|--+)\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function resolveEpisodeLanguageAvailability(
  episode: Pick<EpisodeModel, "number" | "isSubbed" | "isDubbed">,
  options: {
    subCount?: number | null;
    dubCount?: number | null;
    hasAnySubEpisode: boolean;
    hasSubFallback: boolean;
    hasDubServerForCurrentEpisode: boolean;
    currentEpisodeNumber: number;
  },
): { subbed: boolean; dubbed: boolean } {
  const subCountConfirms = Boolean(options.subCount && episode.number <= options.subCount);
  const dubCountConfirms = Boolean(options.dubCount && episode.number <= options.dubCount);
  const currentDubServerConfirms =
    options.hasDubServerForCurrentEpisode && episode.number === options.currentEpisodeNumber;

  return {
    subbed:
      episode.isSubbed === true ||
      subCountConfirms ||
      (episode.isSubbed !== false && !options.hasAnySubEpisode && options.hasSubFallback),
    dubbed:
      episode.isDubbed === true ||
      dubCountConfirms ||
      currentDubServerConfirms,
  };
}

function mergeEpisodeDisplayMetadata(
  episode: EpisodeModel,
  metadata: EpisodeDisplayMetadata | undefined,
  preferProviderArtwork: boolean,
): EpisodeModel {
  if (!metadata) return episode;

  const title = metadata.title && isGenericEpisodeTitle(episode.title)
    ? metadata.title
    : episode.title;
  // Keep a unique provider screencap when one exists: providers can expose a
  // larger original than AniZip/TVDB's 640px metadata image. Repeated provider
  // artwork is normally a series banner, so AniZip remains the fallback there.
  const image = metadata.preferArtwork && metadata.image
    ? metadata.image
    : preferProviderArtwork && episode.image
    ? episode.image
    : metadata.image || episode.image || null;
  const thumbnail = metadata.thumbnail || episode.thumbnail || image;
  const description = normalizeEpisodeDescription(metadata.description || episode.description);
  const airDate = metadata.airDate || episode.airDate || null;
  const isSubbed = metadata.isSubbed ?? episode.isSubbed;
  const isDubbed = metadata.isDubbed ?? episode.isDubbed;

  if (
    title === episode.title &&
    image === (episode.image || null) &&
    thumbnail === (episode.thumbnail || episode.image || null) &&
    description === (episode.description || null) &&
    airDate === (episode.airDate || null) &&
    isSubbed === episode.isSubbed &&
    isDubbed === episode.isDubbed
  ) {
    return episode;
  }

  return {
    ...episode,
    title,
    image,
    thumbnail,
    description,
    airDate,
    isSubbed,
    isDubbed,
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
  const providerArtworkCounts = new Map<string, number>();
  for (const episode of session.episodes) {
    const artwork = getEpisodeArtworkUrl(episode.image, session.anime);
    const identity = artworkIdentity(artwork);
    if (identity) providerArtworkCounts.set(identity, (providerArtworkCounts.get(identity) || 0) + 1);
  }

  const shouldPreferProviderArtwork = (episode: EpisodeModel): boolean => {
    const artwork = getEpisodeArtworkUrl(episode.image, session.anime);
    const identity = artworkIdentity(artwork);
    return Boolean(identity && providerArtworkCounts.get(identity) === 1);
  };

  let episodesChanged = false;
  const episodes = session.episodes.map((episode) => {
    const merged = mergeEpisodeDisplayMetadata(
      episode,
      metadataByNumber.get(episode.number),
      shouldPreferProviderArtwork(episode),
    );
    if (merged !== episode) episodesChanged = true;
    return merged;
  });
  const episode = mergeEpisodeDisplayMetadata(
    session.episode,
    metadataByNumber.get(session.episode.number),
    shouldPreferProviderArtwork(session.episode),
  );

  if (!episodesChanged && episode === session.episode) return session;

  return {
    ...session,
    episodes: episodesChanged ? episodes : session.episodes,
    episode,
  };
}
