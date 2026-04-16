import WatchExperience from "@/components/anime/WatchExperience";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getWatchSession } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseEpisodeNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await getWatchSession({
    animeId: id,
    episodeNumber: parseEpisodeNumber(firstParam(query.ep)),
    provider: normalizeProviderParam(firstParam(query.provider)),
    episodeId: firstParam(query.episodeId) || null,
    dubbed: firstParam(query.dub) === "1" || firstParam(query.dub) === "true",
    server: firstParam(query.server) || null,
  });

  return (
    <main className="min-h-screen bg-surface-container-lowest text-on-surface">
      <Navbar />

      <section className="px-6 pb-10 pt-24">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-on-surface-variant">
            <Link href="/" className="transition-colors hover:text-primary">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={session.anime.href} className="transition-colors hover:text-primary">
              {session.anime.title}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-primary">Episode {session.episode.number}</span>
          </nav>

          <WatchExperience initialSession={session} />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
