import WatchExperience from "@/components/anime/WatchExperience";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getWatchSession } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { auth } from "@/lib/auth";
import {
  getAnilistDetail,
  searchAnilist,
  getAnilistTrending,
  type AnilistMedia,
} from "@/lib/anilist/api";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseEpisodeNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function WatchSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="mb-4 h-5 w-48 rounded bg-white/8" />

      <div className="space-y-0">
        {/* Player skeleton */}
        <div className="rounded-t-2xl aspect-video w-full bg-[#0a0a0c] border border-white/8 border-b-0 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 text-[#ff5500] animate-spin" />
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Connecting to servers...</p>
        </div>
        {/* Controls bar skeleton */}
        <div className="h-11 bg-[#111113] border-x border-white/8" />
        {/* Server strip skeleton */}
        <div className="h-28 bg-[#131315] border-x border-white/8" />
        {/* Episode grid skeleton */}
        <div className="rounded-b-2xl h-32 bg-[#111113] border-x border-b border-white/8" />
      </div>

      {/* Info + Recommendations skeleton */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="h-6 w-48 rounded bg-white/5" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5" />
            ))}
          </div>
          <div className="h-32 rounded-2xl bg-white/5" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-14 h-20 rounded-lg bg-white/5" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-3/4 rounded bg-white/5" />
                <div className="h-2 w-1/2 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Aggressively fetch recommendations:
 * 1. If anilistId available → get direct recommendations
 * 2. Else search AniList by title → use that entry's recommendations
 * 3. Fallback → trending anime
 */
async function fetchRecommendations(
  anilistId: number | null | undefined,
  title: string,
  genres: string[]
): Promise<AnilistMedia[]> {
  // Strategy 1: Direct anilistId lookup
  if (anilistId) {
    try {
      const detail = await getAnilistDetail(anilistId);
      const recs = detail.recommendations.nodes
        .map((n) => n.mediaRecommendation)
        .filter(Boolean) as AnilistMedia[];
      if (recs.length > 0) return recs;
    } catch { /* continue to fallback */ }
  }

  // Strategy 2: Search by title, get the best match's recommendations
  try {
    const searchResults = await searchAnilist({ search: title, perPage: 1 });
    if (searchResults.media.length > 0) {
      const matchId = searchResults.media[0].id;
      const detail = await getAnilistDetail(matchId);
      const recs = detail.recommendations.nodes
        .map((n) => n.mediaRecommendation)
        .filter(Boolean) as AnilistMedia[];
      if (recs.length > 0) return recs;
    }
  } catch { /* continue to fallback */ }

  // Strategy 3: Search by first genre
  if (genres.length > 0) {
    try {
      const genreResults = await searchAnilist({ genre: genres[0], perPage: 10 });
      if (genreResults.media.length > 0) return genreResults.media;
    } catch { /* continue to fallback */ }
  }

  // Strategy 4: Trending as last resort
  try {
    return await getAnilistTrending(10);
  } catch {
    return [];
  }
}

async function WatchContent({
  idPromise,
  searchParamsPromise,
}: {
  idPromise: Promise<{ id: string }>;
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await idPromise;
  const query = await searchParamsPromise;

  const [session, authSession] = await Promise.all([
    getWatchSession({
      animeId: id,
      episodeNumber: parseEpisodeNumber(firstParam(query.ep)),
      provider: normalizeProviderParam(firstParam(query.provider)),
      episodeId: firstParam(query.episodeId) || null,
      dubbed: firstParam(query.dub) === "1" || firstParam(query.dub) === "true",
      server: firstParam(query.server) || null,
    }),
    auth(),
  ]);

  // Fetch recommendations aggressively with multi-strategy fallback
  const recommendations = await fetchRecommendations(
    session.anime.anilistId,
    session.anime.title,
    session.anime.genres
  );

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/40">
        <Link href="/" className="transition-colors hover:text-[#ff5500]">
          Home
        </Link>
        <ChevronRight className="h-2.5 w-2.5" />
        <span className="text-white/30">{session.anime.type || "TV"}</span>
        <ChevronRight className="h-2.5 w-2.5" />
        <Link href={session.anime.href} className="transition-colors hover:text-[#ff5500] max-w-[16rem] truncate">
          {session.anime.title}
        </Link>
      </nav>

      <WatchExperience initialSession={session} recommendations={recommendations} currentUserId={authSession?.user?.id ?? null} />
    </>
  );
}

export default function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea] flex flex-col">
      <Navbar />

      <section className="relative overflow-hidden px-3 pb-12 pt-6 sm:px-4 md:px-6 flex-1">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_center,rgba(255,85,0,0.04),transparent_50%)]" />
        <div className="relative mx-auto max-w-7xl">
          <Suspense fallback={<WatchSkeleton />}>
            <WatchContent idPromise={params} searchParamsPromise={searchParams} />
          </Suspense>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
