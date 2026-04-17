import WatchExperience from "@/components/anime/WatchExperience";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getWatchSession } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
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
      {/* Breadcrumb Skeleton */}
      <div className="mb-6 h-6 w-64 rounded bg-white/10" />
      
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Player Skeleton */}
        <div className="flex-1 space-y-6">
          <div className="aspect-video w-full rounded-2xl bg-[#161616] border border-white/10 shadow-2xl flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-12 h-12 text-[#ff5500] animate-spin" />
            <p className="text-white/50 text-xs font-bold uppercase tracking-widest">CONNECTING TO SERVERS...</p>
          </div>
          
          {/* Server Select Skeleton */}
          <div className="h-32 w-full rounded-xl bg-[#161618] border border-white/10" />
        </div>
        
        {/* Right Sidebar Skeleton */}
        <aside className="w-full lg:w-[24rem] space-y-5">
           <div className="aspect-[3/4] w-full rounded-[1.75rem] bg-[#161616] border border-white/10" />
           <div className="h-[28rem] w-full rounded-[1.75rem] bg-[#161616] border border-white/10" />
        </aside>
      </div>
    </div>
  );
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
  
  const session = await getWatchSession({
    animeId: id,
    episodeNumber: parseEpisodeNumber(firstParam(query.ep)),
    provider: normalizeProviderParam(firstParam(query.provider)),
    episodeId: firstParam(query.episodeId) || null,
    dubbed: firstParam(query.dub) === "1" || firstParam(query.dub) === "true",
    server: firstParam(query.server) || null,
  });

  return (
    <>
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-on-surface-variant">
        <Link href="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={session.anime.href} className="transition-colors hover:text-primary">
          {session.anime.title}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-primary">
          Episode {session.episode.number}
        </span>
      </nav>

      <WatchExperience initialSession={session} />
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
    <main className="min-h-screen bg-surface text-on-surface flex flex-col">
      <Navbar />

      <section className="relative overflow-hidden px-4 pb-12 pt-10 sm:px-6 flex-1">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,94,94,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.04),transparent_22%)] border-t border-white/5" />
        <div className="relative mx-auto max-w-[96rem]">
          <Suspense fallback={<WatchSkeleton />}>
            <WatchContent idPromise={params} searchParamsPromise={searchParams} />
          </Suspense>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
