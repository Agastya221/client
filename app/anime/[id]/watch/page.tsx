import WatchExperience from "@/components/anime/WatchExperience";
import SiteFooter from "@/components/ui/SiteFooter";
import {
  getAniZipEpisodeMetadata,
  getFandomEpisodeMetadataRange,
  getKitsuEpisodeMetadataRange,
  getQuickWatchSession,
  getTvMazeEpisodeMetadataRange,
} from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import {
  mergeEpisodeDisplayMetadataSources,
  mergeEpisodeMetadataIntoWatchSession,
  type EpisodeDisplayMetadata,
} from "@/lib/anime/episode-metadata";
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
          title: `Watch ${title} Episode ${ep} | Yorumi`,
          description: `Stream ${title} Episode ${ep} in HD on Yorumi. Multiple servers, sub & dub available.`,
        };
      } catch {
        // fall through
      }
    }
  }

  return {
    title: `Watch Episode ${ep} | Yorumi`,
    description: `Stream anime episodes in HD on Yorumi.`,
  };
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseEpisodeNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function loadInitialEpisodeMetadata(
  anilistId: number | null,
  requestedEpisode: number,
): Promise<EpisodeDisplayMetadata[]> {
  if (!anilistId) return [];
  const rangeStart = Math.floor(Math.max(0, requestedEpisode - 1) / 100) * 100;
  const [tvMaze, aniZip, fandom] = await Promise.all([
    getTvMazeEpisodeMetadataRange(anilistId, rangeStart).catch(() => []),
    getAniZipEpisodeMetadata(anilistId).catch(() => []),
    getFandomEpisodeMetadataRange(anilistId, rangeStart).catch(() => []),
  ]);

  // TVMaze is the preferred stable image source. AniZip supplies missing text,
  // while Fandom is only used for remaining gaps.
  let metadata = mergeEpisodeDisplayMetadataSources(tvMaze, aniZip);
  metadata = mergeEpisodeDisplayMetadataSources(metadata, fandom);
  const rangeEntries = metadata.filter(
    (episode) => episode.number > rangeStart && episode.number <= rangeStart + 100,
  );
  if (rangeEntries.length === 0 || rangeEntries.some((episode) => !episode.image)) {
    const kitsu = await getKitsuEpisodeMetadataRange(anilistId, rangeStart).catch(() => []);
    metadata = mergeEpisodeDisplayMetadataSources(metadata, kitsu);
  }
  return metadata.filter(
    (episode) => episode.number > rangeStart && episode.number <= rangeStart + 100,
  );
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
  const parsedAnilistId = id.startsWith("anilist~")
    ? Number.parseInt(id.slice("anilist~".length), 10)
    : Number.NaN;
  const anilistId = Number.isInteger(parsedAnilistId) && parsedAnilistId > 0 ? parsedAnilistId : null;
  const [rawSession, initialEpisodeMetadata] = await Promise.all([
    getQuickWatchSession({
      animeId: id,
      episodeNumber: requestedEpisode,
      provider: normalizeProviderParam(firstParam(query.provider)),
      episodeId: firstParam(query.episodeId) || null,
      dubbed,
      server: firstParam(query.server) || null,
    }),
    loadInitialEpisodeMetadata(anilistId, requestedEpisode),
  ]);
  const session = mergeEpisodeMetadataIntoWatchSession(rawSession, initialEpisodeMetadata);

  return {
    session,
    initialEpisodeMetadata,
  };
}

function WatchContent({
  session,
  initialEpisodeMetadata,
}: {
  session: Awaited<ReturnType<typeof getQuickWatchSession>>;
  initialEpisodeMetadata: EpisodeDisplayMetadata[];
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
        initialEpisodeMetadata={initialEpisodeMetadata}
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
  const { session, initialEpisodeMetadata } = await loadWatchPageData({
    idPromise: params,
    searchParamsPromise: searchParams,
  });

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea] flex flex-col">

      <section className="relative flex-1 overflow-x-clip px-0 pb-12 pt-[4.75rem] sm:px-4 sm:pt-20 md:px-6">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at top center, rgba(255,255,255,0.02), transparent 50%)' }} />
        <div className="relative mx-auto max-w-[110rem]">
          <WatchContent session={session} initialEpisodeMetadata={initialEpisodeMetadata} />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
