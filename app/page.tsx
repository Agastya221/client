import AttemptTrail from "@/components/anime/AttemptTrail";
import HomeHeroCarousel from "@/components/anime/HomeHeroCarousel";
import ProviderBadge from "@/components/anime/ProviderBadge";
import AnimeCard from "@/components/ui/AnimeCard";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getHomePageModel } from "@/lib/anime/api";
import Link from "next/link";

export default async function Home() {
  const home = await getHomePageModel();
  const heroSlides = [home.hero, ...home.trending].filter(
    (anime, index, collection): anime is NonNullable<typeof anime> =>
      Boolean(anime) && collection.findIndex((entry) => entry?.id === anime?.id) === index,
  );
  const fallbackImage =
    home.hero?.banner ||
    home.hero?.poster ||
    "https://placehold.co/1600x900/493f79/f5f5f5?text=KAIDO";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#16141d_0%,#221f35_14%,#463d76_52%,#463d76_100%)] text-white">
      <Navbar />

      <HomeHeroCarousel slides={heroSlides} />

      <section className="px-4 pb-10 sm:px-6">
        <div className="mx-auto grid max-w-[92rem] gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="rounded-[2rem] border border-white/10 bg-[#342e5c]/72 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/55">
                  Latest drops
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">More to watch after the spotlight</h2>
              </div>
              {home.sectionProviders.newReleases ? (
                <ProviderBadge
                  provider={home.sectionProviders.newReleases}
                  active={home.sectionProviders.newReleases !== "hianime"}
                />
              ) : null}
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {home.newReleases.map((anime) => (
                <AnimeCard key={anime.id} anime={anime} highlightProvider={anime.provider !== "hianime"} />
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-[#342e5c]/72 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/55">
                    Top airing
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">Always moving</h2>
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
                    className="flex items-center gap-4 rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-3 transition-colors hover:border-[#52ff7f]/30"
                  >
                    <div className="w-10 text-center text-2xl font-black text-[#52ff7f]">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <img
                      src={anime.poster || fallbackImage}
                      alt={anime.title}
                      className="h-20 w-14 rounded-[1rem] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{anime.title}</p>
                      <p className="mt-1 text-xs text-white/58">
                        {anime.type || "Anime"} • {anime.episodeCount || anime.subCount || "?"} eps
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[#342e5c]/72 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
              <AttemptTrail
                attempts={home.attempts}
                activeProvider={home.activeProvider}
                label="Home provider trail"
              />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
