import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getAnimeDetailOverviewModel, getEpisodesForProvider } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import type { ProviderId } from "@/lib/anime/types";
import { Play, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function EpisodeSectionSkeleton() {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#1a1a1a] p-6 shadow-lg animate-pulse">
      <div className="h-8 w-48 rounded bg-white/10 mb-6" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-[#222] p-4 h-20" />
        ))}
      </div>
    </div>
  );
}

async function EpisodesSection({ id, activeProvider, providerId }: { id: string; activeProvider: ProviderId; providerId: string }) {
  const episodes = await getEpisodesForProvider(activeProvider, providerId);

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111215] p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Episodes</p>
          <h2 className="text-2xl font-black text-white mt-1">Episode List</h2>
        </div>
        <span className="rounded-full border border-[#52ff7f]/20 bg-[#52ff7f]/5 px-3 py-1 text-xs text-[#52ff7f] font-semibold">
          {episodes.length} available
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {episodes.map((episode) => (
          <Link
            key={episode.number}
            href={`/anime/${id}/watch?ep=${episode.number}&provider=${activeProvider}`}
            className="group rounded-xl border border-white/5 bg-white/5 p-4 transition-all hover:border-[#ff5500]/30 hover:bg-white/8 hover:-translate-y-0.5"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#ff5500]/70">
              Episode {episode.number}
            </p>
            <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
              {episode.title}
            </h3>
          </Link>
        ))}
      </div>
    </div>
  );
}

async function DetailContent({ idPromise, searchParamsPromise }: { idPromise: Promise<{ id: string }>; searchParamsPromise: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await idPromise;
  const query = await searchParamsPromise;
  const preferredProvider = normalizeProviderParam(firstParam(query.provider));
  const detail = await getAnimeDetailOverviewModel(id, preferredProvider, { resolveProviderFallbacks: false });
  const heroImage = detail.anime.banner || detail.anime.poster || "";
  const episodeProviderId = detail.anime.providerIds[detail.activeProvider] || detail.anime.providerId;

  return (
    <>
      <section className="relative overflow-hidden pb-14 pt-24">
        {heroImage && (
          <div className="absolute inset-0">
            <img src={heroImage} alt={detail.anime.title} className="h-full w-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] via-[#0a0b0c]/90 to-[#0a0b0c]/40" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0c] via-transparent to-transparent" />
          </div>
        )}

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid gap-10 lg:grid-cols-[18rem_1fr] items-end">
            <div className="hidden lg:block">
              <img
                src={detail.anime.poster || heroImage}
                alt={detail.anime.title}
                className="w-full rounded-2xl border border-white/10 shadow-2xl"
                style={{ aspectRatio: "2/3", objectFit: "cover" }}
              />
            </div>

            <div className="space-y-5 py-12">
              <div className="flex flex-wrap items-center gap-2">
                <ProviderBadge provider={detail.activeProvider} active={true} />
                {detail.anime.type && (
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                    {detail.anime.type}
                  </span>
                )}
                {detail.anime.year && (
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                    {detail.anime.year}
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-4xl font-black text-white tracking-tight">{detail.anime.title}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">{detail.synopsis}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/anime/${id}/watch?ep=1&provider=${detail.activeProvider}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-8 py-3.5 text-sm font-black text-white transition-transform hover:scale-105 shadow-[0_0_20px_rgba(255,85,0,0.4)]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Start watching
                </Link>
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-all"
                >
                  <Sparkles className="h-4 w-4" />
                  Browse more
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-10 bg-[#0a0b0c]">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="grid gap-3 md:grid-cols-4">
            {detail.metadata.map((row) => (
              <div key={row.label} className="rounded-xl border border-white/5 bg-white/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{row.label}</p>
                <p className="mt-2 text-sm font-semibold text-white/80">{row.value}</p>
              </div>
            ))}
          </div>

          {detail.anime.genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {detail.anime.genres.map((genre) => (
                <Link
                  key={genre}
                  href={`/search?genre=${encodeURIComponent(genre)}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/50 hover:text-[#ff5500] hover:border-[#ff5500]/30 transition-colors"
                >
                  {genre}
                </Link>
              ))}
            </div>
          )}

          {episodeProviderId ? (
            <Suspense fallback={<EpisodeSectionSkeleton />}>
              <EpisodesSection id={id} activeProvider={detail.activeProvider} providerId={episodeProviderId} />
            </Suspense>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-[#111215] p-6 text-center text-white/30">
              No episodes available for this provider.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default function AnimeKaiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="min-h-screen bg-[#0a0b0c] flex flex-col">
      <Navbar />
      <div className="flex-1">
        <Suspense fallback={<div className="pt-32 text-center text-white/30 animate-pulse">Loading...</div>}>
          <DetailContent idPromise={params} searchParamsPromise={searchParams} />
        </Suspense>
      </div>
      <SiteFooter />
    </main>
  );
}
