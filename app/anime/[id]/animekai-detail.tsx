import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getAnimeDetailOverviewModel, getEpisodesForProvider } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import type { AnimeSeasonEntry, EpisodeModel, ProviderId } from "@/lib/anime/types";
import { Clapperboard, Layers3, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function EpisodeSectionSkeleton() {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-[#111215] p-6 shadow-lg animate-pulse">
      <div className="h-8 w-48 rounded bg-white/10 mb-6" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/5 bg-[#222] p-4 h-24" />
        ))}
      </div>
    </div>
  );
}

function SeasonRail({ seasons, activeHref }: { seasons: AnimeSeasonEntry[]; activeHref: string }) {
  if (seasons.length === 0) return null;

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-[#111215] p-6 shadow-lg">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ff5500]/15 text-[#ff5500]">
          <Layers3 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Franchise</p>
          <h2 className="mt-1 text-2xl font-black text-white">Seasons</h2>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {seasons.map((season) => {
          const active = season.isActive || season.href === activeHref;
          return (
            <Link
              key={`${season.href}-${season.title}`}
              href={season.href}
              className={`group relative block min-w-[15rem] overflow-hidden rounded-[1.5rem] border transition-all ${
                active
                  ? "border-[#ff5500]/60 bg-[#ff5500]/12 shadow-[0_0_0_1px_rgba(255,85,0,0.2)]"
                  : "border-white/10 bg-white/[0.04] hover:border-[#ff5500]/30"
              }`}
            >
              {season.poster ? (
                <div className="absolute inset-0">
                  <img src={season.poster} alt={season.title} className="h-full w-full object-cover opacity-40 transition-transform duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,8,0.1),rgba(7,7,8,0.88))]" />
                </div>
              ) : null}
              <div className="relative flex min-h-32 flex-col justify-end gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-white">{season.title}</p>
                    <p className="mt-1 text-xs text-white/60">
                      {season.episodeLabel || (season.episodeCount ? `${season.episodeCount} episodes` : "Open season")}
                    </p>
                  </div>
                  {active ? (
                    <span className="rounded-full bg-[#ff5500] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                      Active
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function EpisodeCard({
  id,
  activeProvider,
  episode,
}: {
  id: string;
  activeProvider: ProviderId;
  episode: EpisodeModel;
}) {
  return (
    <Link
      href={`/anime/${id}/watch?ep=${episode.number}&provider=${activeProvider}`}
      prefetch
      className="group rounded-[1.35rem] border border-white/8 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 transition-all hover:-translate-y-0.5 hover:border-[#ff5500]/35 hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#ff5500]/12 text-sm font-black text-[#ff5500]">
          {episode.number}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Episode</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-white/85 group-hover:text-white">
            {episode.title}
          </h3>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {episode.isSubbed ? (
          <span className="rounded-full border border-[#ff5500]/25 bg-[#ff5500]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff9160]">
            Sub
          </span>
        ) : null}
        {episode.isDubbed ? (
          <span className="rounded-full border border-[#52ff7f]/25 bg-[#52ff7f]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8dffac]">
            Dub
          </span>
        ) : null}
      </div>
    </Link>
  );
}

async function EpisodesSection({ id, activeProvider, providerId }: { id: string; activeProvider: ProviderId; providerId: string }) {
  const episodes = await getEpisodesForProvider(activeProvider, providerId);
  const subCount = episodes.filter((episode) => episode.isSubbed).length;
  const dubCount = episodes.filter((episode) => episode.isDubbed).length;

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-[#111215] p-6 shadow-lg">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Episode guide</p>
          <h2 className="mt-1 text-2xl font-black text-white">Choose your episode</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/65">
            {episodes.length} total
          </span>
          <span className="rounded-full border border-[#ff5500]/20 bg-[#ff5500]/5 px-3 py-1 text-xs font-semibold text-[#ff9160]">
            {subCount} sub
          </span>
          <span className="rounded-full border border-[#52ff7f]/20 bg-[#52ff7f]/5 px-3 py-1 text-xs font-semibold text-[#8dffac]">
            {dubCount} dub
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {episodes.map((episode) => (
          <EpisodeCard key={episode.number} id={id} activeProvider={activeProvider} episode={episode} />
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
          <div className="grid items-end gap-10 lg:grid-cols-[18rem_1fr]">
            <div className="hidden lg:block">
              <img
                src={detail.anime.poster || heroImage}
                alt={detail.anime.title}
                className="w-full rounded-2xl border border-white/10 shadow-2xl"
                style={{ aspectRatio: "2/3", objectFit: "cover" }}
              />
            </div>

            <div className="space-y-6 py-12">
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

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Episodes</p>
                  <p className="mt-2 text-lg font-black text-white">{detail.anime.episodeCount || "?"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Sub / Dub</p>
                  <p className="mt-2 text-lg font-black text-white">
                    {detail.anime.subCount || 0} / {detail.anime.dubCount || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Seasons</p>
                  <p className="mt-2 text-lg font-black text-white">{detail.seasons.length || 1}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/anime/${id}/watch?ep=1&provider=${detail.activeProvider}`}
                  prefetch
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

      <section className="bg-[#0a0b0c] px-6 py-10">
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

          <SeasonRail seasons={detail.seasons} activeHref={detail.anime.href} />

          {episodeProviderId ? (
            <Suspense fallback={<EpisodeSectionSkeleton />}>
              <EpisodesSection id={id} activeProvider={detail.activeProvider} providerId={episodeProviderId} />
            </Suspense>
          ) : (
            <div className="rounded-[1.75rem] border border-white/10 bg-[#111215] p-6 text-center text-white/30">
              No episodes available for this provider.
            </div>
          )}

          {detail.recommended.length > 0 ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-[#111215] p-6 shadow-lg">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#52ff7f]/15 text-[#52ff7f]">
                  <Clapperboard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">More like this</p>
                  <h2 className="mt-1 text-2xl font-black text-white">Recommended</h2>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {detail.recommended.slice(0, 8).map((anime) => (
                  <Link
                    key={anime.id}
                    href={anime.href}
                    className="group overflow-hidden rounded-[1.35rem] border border-white/8 bg-white/[0.04] transition-all hover:border-[#ff5500]/30"
                  >
                    <div className="aspect-[16/9] overflow-hidden bg-black/30">
                      <img
                        src={anime.poster || anime.banner || heroImage}
                        alt={anime.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-4">
                      <p className="line-clamp-2 text-sm font-semibold text-white/85 group-hover:text-white">{anime.title}</p>
                      <p className="mt-2 text-xs text-white/45">
                        {anime.type || "Anime"}{anime.year ? ` • ${anime.year}` : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
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
