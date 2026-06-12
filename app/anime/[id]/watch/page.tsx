import WatchExperience from "@/components/anime/WatchExperience";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getQuickWatchSession } from "@/lib/anime/api";
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

async function WatchContent({
  idPromise,
  searchParamsPromise,
}: {
  idPromise: Promise<{ id: string }>;
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([idPromise, searchParamsPromise]);

  const dubbed = firstParam(query.dub) === "1" || firstParam(query.dub) === "true";

  const session = await getQuickWatchSession({
    animeId: id,
    episodeNumber: parseEpisodeNumber(firstParam(query.ep)),
    provider: normalizeProviderParam(firstParam(query.provider)),
    episodeId: firstParam(query.episodeId) || null,
    dubbed,
  });

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

      <WatchExperience
        key={[
          session.anime.id,
          session.episode.number,
          session.provider,
          session.dubbed ? "dub" : "sub",
          session.activeServerId || "",
        ].join("|")}
        initialSession={session}
      />
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
          <WatchContent idPromise={params} searchParamsPromise={searchParams} />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
