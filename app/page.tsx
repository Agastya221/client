import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import AnimeCard from "@/components/ui/AnimeCard";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getHomePageModel } from "@/lib/anime/api";
import { Play, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

export default async function Home() {
  const home = await getHomePageModel();
  const hero = home.hero;
  const heroBackdrop =
    hero?.banner ||
    hero?.poster ||
    "https://placehold.co/1600x900/131313/e5e2e1?text=KAIDO";

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <Navbar />

      <section className="relative overflow-hidden pb-16 pt-24">
        <div className="absolute inset-0">
          <img
            src={heroBackdrop}
            alt={hero?.title || "Kaido hero backdrop"}
            className="h-full w-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/85 to-surface-container-lowest/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_22rem] lg:items-end">
            <div className="space-y-8 py-16 lg:py-24">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-primary">
                  Streaming fallback live
                </span>
                {home.sectionProviders.hero ? (
                  <ProviderBadge provider={home.sectionProviders.hero} active={home.sectionProviders.hero !== "hianime"} />
                ) : null}
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-5xl font-black tracking-tight text-on-surface md:text-7xl">
                  {hero?.title || "Unified anime streaming with instant fallback"}
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-on-surface-variant md:text-lg">
                  {hero?.description ||
                    "Kaido keeps catalog, detail pages, and playback alive by rolling from HiAnime to AnimeKai to DesiDub when a provider goes down."}
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                {hero ? (
                  <Link
                    href={`${hero.href}/watch?ep=1&provider=${home.sectionProviders.hero || hero.provider}`}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Watch now
                  </Link>
                ) : null}
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 px-6 py-3 text-sm font-semibold text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  Browse catalog
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low/80 p-5 backdrop-blur-md">
              <div className="flex items-center gap-2 text-primary">
                <TrendingUp className="h-4 w-4" />
                <p className="text-[10px] font-bold uppercase tracking-[0.28em]">Trending now</p>
              </div>
              <div className="mt-5 space-y-4">
                {home.trending.slice(0, 4).map((anime, index) => (
                  <Link
                    key={anime.id}
                    href={anime.href}
                    className="flex items-center gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-3 transition-colors hover:border-primary/25"
                  >
                    <div className="w-10 text-right text-xl font-black text-on-surface-variant">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <img
                      src={anime.poster || heroBackdrop}
                      alt={anime.title}
                      className="h-20 w-16 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-on-surface">{anime.title}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {anime.genres.slice(0, 2).join(" • ") || anime.type || "Anime"}
                      </p>
                    </div>
                    <ProviderBadge provider={anime.provider} subtle />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <AttemptTrail
              attempts={home.attempts}
              activeProvider={home.activeProvider}
              label="Home provider trail"
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                Trending rail
              </p>
              <h2 className="mt-2 text-3xl font-black text-on-surface">Watch what is moving right now</h2>
            </div>
            {home.sectionProviders.trending ? (
              <ProviderBadge provider={home.sectionProviders.trending} active={home.sectionProviders.trending !== "hianime"} />
            ) : null}
          </div>

          <div className="flex gap-5 overflow-x-auto pb-2">
            {home.trending.map((anime) => (
              <Link
                key={anime.id}
                href={anime.href}
                className="group min-w-[19rem] overflow-hidden rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low transition-transform hover:-translate-y-1"
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  <img
                    src={anime.banner || anime.poster || heroBackdrop}
                    alt={anime.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="line-clamp-2 text-lg font-bold text-white">{anime.title}</p>
                      <p className="mt-1 text-xs text-white/70">{anime.genres.slice(0, 3).join(" • ")}</p>
                    </div>
                    <ProviderBadge provider={anime.provider} subtle />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  New releases
                </p>
                <h2 className="mt-2 text-3xl font-black text-on-surface">Fresh episodes and drop-ready titles</h2>
              </div>
              {home.sectionProviders.newReleases ? (
                <ProviderBadge
                  provider={home.sectionProviders.newReleases}
                  active={home.sectionProviders.newReleases !== "hianime"}
                />
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {home.newReleases.map((anime) => (
                <AnimeCard key={anime.id} anime={anime} highlightProvider={anime.provider !== "hianime"} />
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  Top airing
                </p>
                <h2 className="mt-2 text-2xl font-black text-on-surface">Stable fallback picks</h2>
              </div>
              {home.sectionProviders.topAiring ? (
                <ProviderBadge provider={home.sectionProviders.topAiring} active={home.sectionProviders.topAiring !== "hianime"} />
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {home.topAiring.map((anime, index) => (
                <Link
                  key={anime.id}
                  href={anime.href}
                  className="flex items-center gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-3 transition-colors hover:border-primary/25"
                >
                  <div className="w-8 text-center text-lg font-black text-on-surface-variant">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <img
                    src={anime.poster || heroBackdrop}
                    alt={anime.title}
                    className="h-20 w-16 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{anime.title}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {anime.year || "Now airing"} • {anime.episodeCount || anime.subCount || "?"} eps
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
