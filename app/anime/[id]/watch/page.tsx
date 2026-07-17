import WatchArtworkReadyGate from "@/components/anime/WatchArtworkReadyGate";
import WatchExperience from "@/components/anime/WatchExperience";
import WatchPageLoading from "@/components/anime/WatchPageLoading";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getAniZipEpisodeMetadata, getFandomEpisodeMetadataRange, getKitsuEpisodeMetadataRange, getQuickWatchSession, getTvMazeEpisodeMetadataRange } from "@/lib/anime/api";
import {
  getEpisodeArtworkUrl,
  mergeEpisodeDisplayMetadataSources,
  mergeEpisodeMetadataIntoWatchSession,
} from "@/lib/anime/episode-metadata";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import {
  getAnilistDetail,
  anilistTitle,
} from "@/lib/anilist/api";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { id } = await params;
  const query = await searchParams;
  const ep = query.ep ? String(query.ep) : "1";

  if (id.startsWith("anilist~")) {
    const anilistId = parseInt(id.replace("anilist~", ""), 10);
    if (!isNaN(anilistId)) {
      try {
        const media = await getAnilistDetail(anilistId);
        const title = anilistTitle(media);
        return {
          title: `Watch ${title} Episode ${ep} | AnimePlay`,
          description: `Stream ${title} Episode ${ep} in HD on AnimePlay. Multiple servers, sub & dub available.`,
        };
      } catch {
        // fall through
      }
    }
  }

  return {
    title: `Watch Episode ${ep} | AnimePlay`,
    description: `Stream anime episodes in HD on AnimePlay.`,
  };
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseEpisodeNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseRouteAniListId(id: string): number | null {
  if (!id.startsWith("anilist~")) return null;
  const parsed = Number(id.slice("anilist~".length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadWatchPageData({
  idPromise,
  searchParamsPromise,
}: {
  idPromise: Promise<{ id: string }>;
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([idPromise, searchParamsPromise]);

  const dubbed = firstParam(query.dub) === "1" || firstParam(query.dub) === "true";
  const requestedEpisode = parseEpisodeNumber(firstParam(query.ep)) || 1;
  const requestedRangeStart = Math.floor((requestedEpisode - 1) / 100) * 100;

  const sessionPromise = getQuickWatchSession({
    animeId: id,
    episodeNumber: requestedEpisode,
    provider: normalizeProviderParam(firstParam(query.provider)),
    episodeId: firstParam(query.episodeId) || null,
    dubbed,
    server: firstParam(query.server) || null,
  });

  // Route prefetch starts both requests together for AniList watch URLs. On a
  // cold direct visit, the route loading UI remains visible until the episode
  // screen caps are known; stream resolution remains a separate client task.
  const routeAniListId = parseRouteAniListId(id);
  const loadEpisodeMetadata = async (anilistId: number) => {
    const [primary, rangeArtwork, longRunningArtwork, finalArtwork] = await Promise.all([
      getAniZipEpisodeMetadata(anilistId),
      getKitsuEpisodeMetadataRange(anilistId, requestedRangeStart),
      getTvMazeEpisodeMetadataRange(anilistId, requestedRangeStart),
      getFandomEpisodeMetadataRange(anilistId, requestedRangeStart),
    ]);
    return mergeEpisodeDisplayMetadataSources(
      mergeEpisodeDisplayMetadataSources(
        mergeEpisodeDisplayMetadataSources(primary, rangeArtwork),
        longRunningArtwork,
      ),
      finalArtwork,
    );
  };
  const episodeMetadataPromise = routeAniListId
    ? loadEpisodeMetadata(routeAniListId)
    : sessionPromise.then((quickSession) => quickSession.anime.anilistId
      ? loadEpisodeMetadata(quickSession.anime.anilistId)
      : []);
  const [quickSession, episodeMetadata] = await Promise.all([
    sessionPromise,
    episodeMetadataPromise,
  ]);
  const session = mergeEpisodeMetadataIntoWatchSession(quickSession, episodeMetadata);

  const activeRangeStart = Math.floor(
    Math.max(0, session.episodes.findIndex((episode) => episode.number === session.episode.number)) / 100,
  ) * 100;
  const arrivalEpisodes = session.episodes.slice(activeRangeStart, activeRangeStart + 6);
  const artworkUrls = [session.episode, ...arrivalEpisodes]
    .map((episode) => getEpisodeArtworkUrl(episode.image, session.anime))
    .filter((src): src is string => Boolean(src));

  return {
    session,
    episodeMetadata,
    artworkUrls,
  };
}

function WatchContent({
  session,
  episodeMetadata,
}: {
  session: Awaited<ReturnType<typeof getQuickWatchSession>>;
  episodeMetadata: Awaited<ReturnType<typeof getAniZipEpisodeMetadata>>;
}) {
  const accentColor = session.anime.color || "#ff5500";

  return (
    <>
      {/* Breadcrumb */}
      <nav
        className="mb-3 hidden flex-wrap items-center gap-1.5 px-3 text-[11px] uppercase tracking-[0.18em] text-white/40 sm:flex sm:px-0 xl:hidden"
        style={{ "--accent": accentColor } as React.CSSProperties}
      >
        <Link href="/" className="transition-colors hover:text-white/70">
          Home
        </Link>
        <ChevronRight className="h-2.5 w-2.5" />
        <span className="text-white/30">{session.anime.type || "TV"}</span>
        <ChevronRight className="h-2.5 w-2.5" />
        <Link href={session.anime.href} className="watch-breadcrumb-title transition-colors max-w-[16rem] truncate">
          {session.anime.title}
        </Link>
      </nav>

      <WatchExperience
        key={[
          session.anime.id,
          session.episode.number,
          session.provider,
          session.dubbed ? "dub" : "sub",
          session.activeServerId || "",
        ].join("|")}
        initialSession={session}
        initialEpisodeMetadata={episodeMetadata}
      />
    </>
  );
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, episodeMetadata, artworkUrls } = await loadWatchPageData({
    idPromise: params,
    searchParamsPromise: searchParams,
  });

  return (
    <WatchArtworkReadyGate artworkUrls={artworkUrls} fallback={<WatchPageLoading />}>
      <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea] flex flex-col">
        <Navbar />

        <section className="relative flex-1 overflow-x-clip px-0 pb-12 pt-[4.75rem] sm:px-4 sm:pt-20 md:px-6">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at top center, rgba(255,255,255,0.02), transparent 50%)' }} />
          <div className="relative mx-auto max-w-[110rem]">
            <WatchContent session={session} episodeMetadata={episodeMetadata} />
          </div>
        </section>

        <SiteFooter />
      </main>
    </WatchArtworkReadyGate>
  );
}
