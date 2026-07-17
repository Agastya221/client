import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAniZipEpisodeMetadata, getAnivexaEpisodeAvailabilityMetadata, getFandomEpisodeMetadataRange, getKitsuEpisodeMetadataRange, getTvMazeEpisodeMetadataRange } from "@/lib/anime/api";
import type { EpisodeDisplayMetadata } from "@/lib/anime/episode-metadata";
import {
  getAnilistDetail,
  getAnilistFranchiseSeasonEntries,
  getAnilistTrending,
  normalizeAnilistMediaEntry,
  searchAnilist,
  type AnilistMedia,
  type AnilistSeasonEntry,
} from "@/lib/anilist/api";
import { measureAsync, recordLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

function parseAnilistId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseGenres(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

interface RelatedAnimeEntry {
  relationType: string;
  media: AnilistMedia;
}

function mergeEpisodeMetadataSources(
  primary: EpisodeDisplayMetadata[],
  availability: EpisodeDisplayMetadata[],
): EpisodeDisplayMetadata[] {
  const entries = new Map(primary.map((entry) => [entry.number, { ...entry }]));
  for (const incoming of availability) {
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
    } : incoming);
  }
  return Array.from(entries.values()).sort((left, right) => left.number - right.number);
}

async function fetchWatchDiscovery(
  anilistId: number | null,
  title: string,
  genres: string[],
): Promise<{
  detail: AnilistMedia | null;
  seasons: AnilistSeasonEntry[];
  related: RelatedAnimeEntry[];
  recommendations: AnilistMedia[];
}> {
  let detail: Awaited<ReturnType<typeof getAnilistDetail>> | null = null;

  if (anilistId) {
    try {
      detail = await getAnilistDetail(anilistId);
    } catch {
      // Fall through to the next lookup.
    }
  }

  if (!detail && title) {
    try {
      const searchResults = await searchAnilist({ search: title, perPage: 1 });
      const matchId = searchResults.media[0]?.id;
      if (matchId) {
        detail = await getAnilistDetail(matchId);
      }
    } catch {
      // Fall through to the next lookup.
    }
  }

  const compactDetail = detail ? normalizeAnilistMediaEntry(detail) : null;
  const seasons = detail ? await getAnilistFranchiseSeasonEntries(detail) : [];
  const seasonIds = new Set(seasons.map((entry) => entry.media.id));
  const related = detail
    ? detail.relations.edges
        .filter((entry) => Boolean(entry.node) && !seasonIds.has(entry.node.id))
        .map((entry) => ({
          relationType: entry.relationType,
          media: entry.node,
        }))
        .filter((entry) => entry.media.isAdult === false)
        .slice(0, 8)
    : [];
  const directRecommendations = detail
    ? detail.recommendations.nodes
        .map((entry) => entry.mediaRecommendation)
        .filter((entry): entry is AnilistMedia => Boolean(entry))
        .filter((entry) => entry.id !== compactDetail?.id && !seasonIds.has(entry.id))
    : [];

  const withRecommendations = (recommendations: AnilistMedia[]) => ({
    detail: compactDetail,
    seasons,
    related,
    recommendations,
  });

  if (directRecommendations.length > 0) {
    return withRecommendations(directRecommendations);
  }

  if (genres.length > 0) {
    try {
      const genreResults = await searchAnilist({ genre: genres[0], perPage: 10 });
      if (genreResults.media.length > 0) {
        return withRecommendations(
          genreResults.media.filter((entry) => entry.id !== compactDetail?.id && !seasonIds.has(entry.id)),
        );
      }
    } catch {
      // Fall through to trending.
    }
  }

  try {
    const trending = await getAnilistTrending(10);
    return withRecommendations(
      trending.filter((entry) => entry.id !== compactDetail?.id && !seasonIds.has(entry.id)),
    );
  } catch {
    return withRecommendations([]);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = String(searchParams.get("title") || "").trim();
  const genres = parseGenres(searchParams.get("genres"));
  const anilistId = parseAnilistId(searchParams.get("anilistId"));
  const requestedStart = Math.max(0, Number.parseInt(searchParams.get("episodeStart") || "0", 10) || 0);
  const episodeRangeStart = Math.floor(requestedStart / 100) * 100;
  const metadataOnly = searchParams.get("metadataOnly") === "1";

  try {
    if (metadataOnly) {
      if (!anilistId) return NextResponse.json({ episodeMetadata: [] });

      const [aniZipMetadata, tvMazeMetadata, fandomMetadata] = await Promise.all([
        getAniZipEpisodeMetadata(anilistId).catch(() => []),
        getTvMazeEpisodeMetadataRange(anilistId, episodeRangeStart).catch(() => []),
        getFandomEpisodeMetadataRange(anilistId, episodeRangeStart).catch(() => []),
      ]);
      let episodeMetadata = mergeEpisodeMetadataSources(
        mergeEpisodeMetadataSources(aniZipMetadata, tvMazeMetadata),
        fandomMetadata,
      );
      const requestedEpisodes = episodeMetadata.filter(
        (episode) => episode.number > episodeRangeStart && episode.number <= episodeRangeStart + 100,
      );
      const needsKitsu = requestedEpisodes.length === 0 || requestedEpisodes.some((episode) => !episode.image);
      if (needsKitsu) {
        const kitsuMetadata = await getKitsuEpisodeMetadataRange(anilistId, episodeRangeStart).catch(() => []);
        episodeMetadata = mergeEpisodeMetadataSources(episodeMetadata, kitsuMetadata);
      }

      return NextResponse.json({
        episodeMetadata: episodeMetadata.filter(
          (episode) => episode.number > episodeRangeStart && episode.number <= episodeRangeStart + 100,
        ),
      });
    }

    const [authSession, discovery, aniZipMetadata, kitsuMetadata, tvMazeMetadata, fandomMetadata, availabilityMetadata] = await Promise.all([
      auth().catch(() => null),
      measureAsync(
        "route.watch_page_context",
        {
          route: "/api/watch-page-context",
          hasAnilistId: anilistId ? "true" : "false",
          hasTitle: title ? "true" : "false",
        },
        () => fetchWatchDiscovery(anilistId, title, genres),
      ),
      anilistId
        ? getAniZipEpisodeMetadata(anilistId).catch(() => [])
        : Promise.resolve([]),
      anilistId
        ? getKitsuEpisodeMetadataRange(anilistId, episodeRangeStart).catch(() => [])
        : Promise.resolve([]),
      anilistId
        ? getTvMazeEpisodeMetadataRange(anilistId, episodeRangeStart).catch(() => [])
        : Promise.resolve([]),
      anilistId
        ? getFandomEpisodeMetadataRange(anilistId, episodeRangeStart).catch(() => [])
        : Promise.resolve([]),
      anilistId
        ? getAnivexaEpisodeAvailabilityMetadata(anilistId).catch(() => [])
        : Promise.resolve([]),
    ]);
    const episodeMetadata = mergeEpisodeMetadataSources(
      mergeEpisodeMetadataSources(
        mergeEpisodeMetadataSources(aniZipMetadata, kitsuMetadata),
        tvMazeMetadata,
      ),
      fandomMetadata,
    );
    const episodeMetadataWithAvailability = mergeEpisodeMetadataSources(
      episodeMetadata,
      availabilityMetadata,
    );

    return NextResponse.json({
      currentUserId: authSession?.user?.id ?? null,
      detail: discovery.detail,
      seasons: discovery.seasons,
      related: discovery.related,
      recommendations: discovery.recommendations,
      episodeMetadata: episodeMetadataWithAvailability,
    });
  } catch (error) {
    recordLog(
      "warn",
      "route.watch_page_context.failed",
      { route: "/api/watch-page-context" },
      error instanceof Error ? error.message : "Unable to load watch page context",
    );
    return NextResponse.json(
      {
        currentUserId: null,
        detail: null,
        seasons: [],
        related: [],
        recommendations: [],
        episodeMetadata: [],
      },
    );
  }
}
