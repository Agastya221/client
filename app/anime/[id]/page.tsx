import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import AnimeCard from "@/components/ui/AnimeCard";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getAnimeDetailModel } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { Play, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="relative mx-auto max-w-7xl px-6 py-20 mt-10">
        <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-end">
          <div className="hidden lg:block">
            <div className="aspect-[2/3] w-full rounded-[1.75rem] border border-white/10 bg-[#161616] shadow-2xl" />
          </div>
          <div className="space-y-6">
            <div className="flex gap-3">
              <div className="h-6 w-24 rounded-full bg-white/10" />
              <div className="h-6 w-16 rounded-full bg-white/10" />
            </div>
            <div className="space-y-4">
              <div className="h-14 w-3/4 rounded-lg bg-white/10" />
              <div className="h-24 w-full rounded-lg bg-white/5" />
            </div>
            <div className="flex gap-4 pt-4">
              <div className="h-12 w-40 rounded-full bg-[#ff5500]/20 flex items-center justify-center border border-[#ff5500]/50">
                 <Loader2 className="w-5 h-5 text-[#ff5500] animate-spin" />
              </div>
              <div className="h-12 w-48 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function DetailContent({
  idPromise,
  searchParamsPromise,
}: {
  idPromise: Promise<{ id: string }>;
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await idPromise;
  const query = await searchParamsPromise;
  const preferredProvider = normalizeProviderParam(firstParam(query.provider));
  const detail = await getAnimeDetailModel(id, preferredProvider, {
    resolveProviderFallbacks: false,
    mergeEpisodeProviders: false,
  });
  const heroImage =
    detail.anime.banner ||
    detail.anime.poster ||
    "https://placehold.co/1600x900/131313/e5e2e1?text=KAIDO";
  const firstEpisode = detail.episodes[0];
  const isMergedEpisodeMap = detail.episodeCoverageMode === "merged-providers";

  return (
    <>
      <section className="relative overflow-hidden pb-14 pt-24">
        <div className="absolute inset-0">
          <img src={heroImage} alt={detail.anime.title} className="h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/90 to-surface-container-lowest/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-end">
            <div className="hidden lg:block">
              <div className="overflow-hidden rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low shadow-[0_20px_40px_rgba(0,240,255,0.1)]">
                <img src={detail.anime.poster || heroImage} alt={detail.anime.title} className="aspect-[2/3] w-full object-cover" />
              </div>
            </div>

            <div className="space-y-6 py-12">
              <div className="flex flex-wrap items-center gap-3">
                <ProviderBadge provider={detail.activeProvider} active={detail.activeProvider !== "hianime"} />
                {detail.anime.type ? (
                  <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    {detail.anime.type}
                  </span>
                ) : null}
                {detail.anime.year ? (
                  <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    {detail.anime.year}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white md:text-6xl text-shadow-xl drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                  {detail.anime.title}
                </h1>
                <p className="max-w-3xl text-sm md:text-base leading-relaxed text-white/70">
                  {detail.synopsis}
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                {firstEpisode ? (
                  <Link
                    href={`/anime/${id}/watch?ep=${firstEpisode.number}&provider=${detail.activeProvider}`}
                    className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-8 py-3.5 text-sm font-black uppercase tracking-wider text-black transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,85,0,0.4)]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Start watching
                  </Link>
                ) : null}
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 backdrop-blur-md px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/10"
                >
                  <Sparkles className="h-4 w-4 text-[#52ff7f]" />
                  Browse another title
                </Link>
              </div>

              <div className="flex flex-wrap gap-3">
                {detail.availableProviders.map((provider) => (
                  <Link
                    key={provider}
                    href={`/anime/${id}?provider=${provider}`}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      provider === detail.activeProvider
                        ? "border-[#ff5500]/50 bg-[#ff5500]/10 text-[#ff5500]"
                        : "border-white/10 bg-black/40 text-white/50 hover:border-white/30 hover:text-white"
                    }`}
                  >
                    {provider}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <AttemptTrail
              attempts={detail.attempts}
              activeProvider={detail.activeProvider}
              label="Detail provider trail"
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-10 bg-[#121212]">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail.metadata.map((row) => (
                <div
                  key={row.label}
                  className="rounded-[1.5rem] border border-white/5 bg-[#1a1a1a] p-5 shadow-lg"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                    {row.label}
                  </p>
                  <p className="mt-3 text-base font-semibold text-white/90">{row.value}</p>
                </div>
              ))}
              {detail.anime.genres.length > 0 ? (
                <div className="rounded-[1.5rem] border border-white/5 bg-[#1a1a1a] p-5 md:col-span-2 xl:col-span-3 shadow-lg">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                    Genres
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {detail.anime.genres.map((genre) => (
                      <Link
                         key={genre}
                         href={`/search?genre=${encodeURIComponent(genre)}`}
                         className="rounded-full border border-white/10 bg-[#222] px-4 py-2 text-sm font-semibold text-white/60 transition-colors hover:border-[#ff5500]/50 hover:text-[#ff5500]"
                      >
                         {genre}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-white/5 bg-[#1a1a1a] p-6 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                    Episodes
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-white/90">
                    {isMergedEpisodeMap ? "Cross-provider episode map" : "Episode list"}
                  </h2>
                </div>
                <span className="rounded-full border border-[#52ff7f]/20 bg-[#52ff7f]/5 px-3 py-1 text-xs text-[#52ff7f] font-semibold">
                  {detail.episodes.length} {isMergedEpisodeMap ? "episodes detected" : "episodes available"}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {detail.episodes.map((episode) => (
                  <Link
                    key={episode.number}
                    href={`/anime/${id}/watch?ep=${episode.number}&provider=${detail.activeProvider}`}
                    className="group rounded-[1.5rem] border border-white/5 bg-[#222] p-4 transition-all hover:border-[#ff5500]/50 hover:-translate-y-1 shadow-md"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#ff5500]/80">
                      Episode {episode.number}
                    </p>
                    <h3 className="mt-2 line-clamp-2 text-base font-semibold text-white group-hover:text-[#ff5500] transition-colors">
                      {episode.title}
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {episode.availableProviders.map((provider) => (
                        <ProviderBadge
                          key={`${episode.number}-${provider}`}
                          provider={provider}
                          active={provider === detail.activeProvider}
                          subtle
                        />
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-8">
            {detail.recommended.length > 0 ? (
              <div className="rounded-[1.75rem] border border-white/5 bg-[#1a1a1a] p-5 shadow-lg">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                  Recommended
                </p>
                <div className="mt-5 space-y-4">
                  {detail.recommended.slice(0, 4).map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} />
                  ))}
                </div>
              </div>
            ) : null}

            {detail.related.length > 0 ? (
              <div className="rounded-[1.75rem] border border-white/5 bg-[#1a1a1a] p-5 shadow-lg">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                  Related titles
                </p>
                <div className="mt-5 space-y-4">
                  {detail.related.slice(0, 3).map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} />
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}

export default function AnimeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="min-h-screen bg-[#121212] flex flex-col">
      <Navbar />
      <div className="flex-1">
        <Suspense fallback={<DetailSkeleton />}>
          <DetailContent idPromise={params} searchParamsPromise={searchParams} />
        </Suspense>
      </div>
      <SiteFooter />
    </main>
  );
}
