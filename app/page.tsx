import AttemptTrail from "@/components/anime/AttemptTrail";
import HomeHeroCarousel from "@/components/anime/HomeHeroCarousel";
import ProviderBadge from "@/components/anime/ProviderBadge";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getHomePageModel } from "@/lib/anime/api";
import { Clapperboard, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

export default async function Home() {
  const home = await getHomePageModel();
  const heroSlides = [home.hero, ...home.trending].filter(
    (anime, index, collection): anime is NonNullable<typeof anime> =>
      Boolean(anime) && collection.findIndex((entry) => entry?.id === anime?.id) === index,
  );
  const heroBackdrop =
    home.hero?.banner ||
    home.hero?.poster ||
    "https://placehold.co/1600x900/131313/e5e2e1?text=KAIDO";
  const featuredRelease = home.newReleases[0] || null;
  const supportingReleases = featuredRelease ? home.newReleases.slice(1) : home.newReleases;

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <Navbar />

      <HomeHeroCarousel slides={heroSlides} />

      <section className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-[92rem]">
          <div className="rounded-[1.75rem] border border-white/10 bg-surface-container-low/80 p-4 backdrop-blur-md sm:p-5">
            <AttemptTrail
              attempts={home.attempts}
              activeProvider={home.activeProvider}
              label="Home provider trail"
            />
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-[92rem]">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                Trending rail
              </p>
              <h2 className="mt-2 text-3xl font-black text-on-surface">Popular now, framed with more impact</h2>
            </div>
            {home.sectionProviders.trending ? (
              <ProviderBadge
                provider={home.sectionProviders.trending}
                active={home.sectionProviders.trending !== "hianime"}
              />
            ) : null}
          </div>

          <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-4">
            {home.trending.map((anime, index) => (
              <Link
                key={anime.id}
                href={anime.href}
                className="group relative min-w-[10.5rem] overflow-hidden rounded-[1.85rem] border border-white/10 bg-surface-container-low shadow-[0_18px_48px_rgba(0,0,0,0.28)] transition-transform duration-300 hover:-translate-y-1.5"
              >
                <div className="relative aspect-[3/4]">
                  <img
                    src={anime.poster || anime.banner || heroBackdrop}
                    alt={anime.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,10,0.05),rgba(5,8,10,0.88))]" />

                  <div className="absolute left-3 top-4 flex h-[68%] w-8 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-black/35 px-1 py-3 backdrop-blur-sm">
                    <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold tracking-[0.16em] text-white/82">
                      {anime.title}
                    </span>
                  </div>

                  <div className="absolute right-3 top-3">
                    <ProviderBadge provider={anime.provider} subtle />
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-4xl font-black leading-none text-[#69f48d]">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-white/48">
                        {anime.type || anime.status || "Trending"}
                      </p>
                    </div>
                    <div className="space-y-1 text-right text-[11px] text-white/74">
                      {anime.year ? <p>{anime.year}</p> : null}
                      {anime.episodeCount ? <p>{anime.episodeCount} eps</p> : null}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6">
        <div className="mx-auto grid max-w-[92rem] gap-6 xl:grid-cols-[minmax(0,1.25fr)_24rem]">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  New releases
                </p>
                <h2 className="mt-2 text-3xl font-black text-on-surface">Fresh drops with a stronger editorial layout</h2>
              </div>
              {home.sectionProviders.newReleases ? (
                <ProviderBadge
                  provider={home.sectionProviders.newReleases}
                  active={home.sectionProviders.newReleases !== "hianime"}
                />
              ) : null}
            </div>

            {featuredRelease ? (
              <Link
                href={featuredRelease.href}
                className="group relative block overflow-hidden rounded-[2rem] border border-white/10 bg-surface-container-low shadow-[0_28px_70px_rgba(0,0,0,0.32)]"
              >
                <div className="relative min-h-[24rem]">
                  <img
                    src={featuredRelease.banner || featuredRelease.poster || heroBackdrop}
                    alt={featuredRelease.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,12,16,0.92)_0%,rgba(9,12,16,0.74)_44%,rgba(9,12,16,0.18)_100%)]" />
                  <div className="relative flex h-full flex-col justify-end gap-4 p-6 sm:max-w-[70%] sm:p-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-[#69f48d]/16 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8dffab]">
                        Featured drop
                      </span>
                      <ProviderBadge provider={featuredRelease.provider} active={featuredRelease.provider !== "hianime"} />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                        {featuredRelease.title}
                      </h3>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
                        {featuredRelease.description ||
                          "A wider release card gives the banner titles room to breathe before you jump into the next episode."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {featuredRelease.genres.slice(0, 4).map((genre) => (
                        <span
                          key={genre}
                          className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs text-white/76"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {supportingReleases.map((anime) => (
                <Link
                  key={anime.id}
                  href={anime.href}
                  className="group overflow-hidden rounded-[1.6rem] border border-white/10 bg-surface-container-low transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={anime.banner || anime.poster || heroBackdrop}
                      alt={anime.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/18 to-transparent" />
                    <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                      <span className="rounded-full border border-white/10 bg-black/28 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">
                        {anime.type || "Anime"}
                      </span>
                      <ProviderBadge provider={anime.provider} subtle />
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="line-clamp-2 text-lg font-bold text-white">{anime.title}</h3>
                      <p className="mt-2 text-xs text-white/66">
                        {anime.year || "Now streaming"} • {anime.episodeCount || anime.subCount || "?"} eps
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-surface-container-low p-5 shadow-[0_20px_55px_rgba(0,0,0,0.26)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                    Top airing
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-on-surface">Built to feel more alive</h2>
                </div>
                {home.sectionProviders.topAiring ? (
                  <ProviderBadge
                    provider={home.sectionProviders.topAiring}
                    active={home.sectionProviders.topAiring !== "hianime"}
                  />
                ) : null}
              </div>

              <div className="mt-5 space-y-3">
                {home.topAiring.map((anime, index) => (
                  <Link
                    key={anime.id}
                    href={anime.href}
                    className="flex items-center gap-4 rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-3 transition-colors hover:border-[#69f48d]/24"
                  >
                    <div className="w-10 text-center text-2xl font-black text-[#69f48d]">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <img
                      src={anime.poster || heroBackdrop}
                      alt={anime.title}
                      className="h-20 w-14 rounded-[1rem] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{anime.title}</p>
                      <p className="mt-1 text-xs text-white/55">
                        {anime.year || "Now airing"} • {anime.episodeCount || anime.subCount || "?"} eps
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(105,244,141,0.09),rgba(255,255,255,0.03))] p-5">
              <div className="flex items-center gap-2 text-[#69f48d]">
                <Sparkles className="h-4 w-4" />
                <p className="text-[10px] font-bold uppercase tracking-[0.28em]">Browse by vibe</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {home.genres.slice(0, 12).map((genre) => (
                  <Link
                    key={genre}
                    href={{ pathname: "/search", query: { genre } }}
                    className="rounded-full border border-white/10 bg-black/16 px-3 py-2 text-sm text-white/78 transition-colors hover:border-[#69f48d]/25 hover:text-[#8dffab]"
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-14 pt-8 sm:px-6">
        <div className="mx-auto grid max-w-[92rem] gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-white/10 bg-surface-container-low p-5">
            <div className="flex items-center gap-3 text-[#69f48d]">
              <TrendingUp className="h-5 w-5" />
              <p className="text-sm font-semibold text-white">Bigger spotlight hierarchy</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-white/62">
              The banner now carries the page instead of feeling like a separate block sitting above the real content.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-surface-container-low p-5">
            <div className="flex items-center gap-3 text-[#69f48d]">
              <Clapperboard className="h-5 w-5" />
              <p className="text-sm font-semibold text-white">Posters with more personality</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-white/62">
              Trending titles now use numbered poster tiles so the row feels more like a real curated lineup.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-surface-container-low p-5">
            <div className="flex items-center gap-3 text-[#69f48d]">
              <Sparkles className="h-5 w-5" />
              <p className="text-sm font-semibold text-white">Cleaner editorial flow</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-white/62">
              New releases, airing picks, and genre chips now feel part of one visual system instead of stacked utilities.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
