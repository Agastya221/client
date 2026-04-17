import AttemptTrail from "@/components/anime/AttemptTrail";
import HomeHeroCarousel from "@/components/anime/HomeHeroCarousel";
import AnimeCard from "@/components/ui/AnimeCard";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getHomePageModel, getHindiDubbedAnimes } from "@/lib/anime/api";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Heart } from "lucide-react";

export default async function Home() {
  const [home, hindiDubbed] = await Promise.all([
    getHomePageModel(),
    getHindiDubbedAnimes(),
  ]);

  const heroSlides = [home.hero, ...home.trending].filter(
    (anime, index, collection): anime is NonNullable<typeof anime> =>
      Boolean(anime) && collection.findIndex((entry) => entry?.id === anime?.id) === index,
  );

  return (
    <main className="min-h-screen bg-[#161616] text-[#eaeaea]">
      <Navbar />

      <HomeHeroCarousel slides={heroSlides} />

      <section className="w-full px-4 lg:px-12 xl:px-16 pb-12 pt-6">
        {/* Banner */}
        <div className="bg-[#1b1c20] rounded-lg p-4 flex items-center gap-4 mb-8 border border-white/5">
          <div className="w-10 h-10 rounded-full bg-[#ff5500]/20 flex items-center justify-center border border-[#ff5500]/50 shrink-0">
            <Heart className="w-5 h-5 text-[#ff5500] fill-current" />
          </div>
          <div>
            <h3 className="text-[#52ff7f] font-bold text-sm">Love this site?</h3>
            <p className="text-white/50 text-xs">Share it and let others know!</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* Main Left Content */}
          <div className="flex flex-col gap-10">
            
            {/* Latest Updates Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-white tracking-widest uppercase">LATEST UPDATES</h2>
                <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-white/50">
                  <span className="text-[#52ff7f] cursor-pointer">All</span>
                  <span className="hover:text-white cursor-pointer transition-colors">Sub</span>
                  <span className="hover:text-white cursor-pointer transition-colors">Dub</span>
                  <span className="hover:text-white cursor-pointer transition-colors">China</span>
                  <div className="flex gap-2 ml-4">
                    <button className="w-6 h-6 rounded-full bg-[#20222a] flex items-center justify-center hover:text-white"><ChevronLeft className="w-4 h-4"/></button>
                    <button className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/80"><ChevronRight className="w-4 h-4"/></button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-6">
                {(home.newReleases || heroSlides).map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} highlightProvider={anime.provider !== "hianime"} />
                ))}
              </div>
            </div>

            {/* Hindi Dubbed Section */}
            {hindiDubbed && hindiDubbed.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4 mt-4">
                  <h2 className="text-xl font-black text-white tracking-widest uppercase flex items-center gap-2">
                    HINDI DUBBED
                    <span className="bg-[#ff5500] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm">DESI</span>
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-6">
                  {hindiDubbed.slice(0, 10).map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} highlightProvider={true} />
                  ))}
                </div>
              </div>
            )}

            {/* Provider Trail (Optional / Debug) */}
            <div className="mt-8 pt-8 border-t border-white/5">
              <AttemptTrail
                attempts={home.attempts}
                activeProvider={home.activeProvider}
                label="Home provider trail"
              />
            </div>
          </div>

          {/* Right Sidebar - Top Trending */}
          <div className="w-full">
            <div className="bg-[#1b1c20] rounded-xl overflow-hidden p-4 border border-white/5">
              <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-4">
                <span className="text-[#ff5500]">🏆</span>
                <h2 className="font-black text-lg text-white">Top Trending</h2>
                <div className="ml-auto bg-[#ff5500] text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                  NOW <ChevronRight className="w-3 h-3 rotate-90" />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {home.topAiring.map((anime, index) => (
                  <Link
                    key={anime.id}
                    href={anime.href}
                    className="flex items-center gap-3 group rounded-md hover:bg-white/5 p-2 -mx-2 transition-colors relative"
                  >
                    {/* Rank Circle */}
                    <div className="w-8 h-8 rounded-full border border-white/20 flex flex-col justify-center items-center shrink-0">
                       <span className="text-white text-sm font-bold">{index + 1}</span>
                    </div>

                    <img
                      src={anime.poster || "https://placehold.co/100x140"}
                      alt={anime.title}
                      className="h-16 w-11 rounded object-cover shadow-md"
                    />

                    <div className="min-w-0 pr-2">
                       <h4 className="text-white text-sm font-bold line-clamp-1 group-hover:text-[#ff5500] transition-colors">{anime.title}</h4>
                       <div className="flex items-center gap-2 mt-1 text-[10px]">
                         {anime.subCount && <span className="bg-[#ff5500]/20 text-[#ff5500] px-1 py-0.5 rounded flex items-center gap-1"><span className="bg-[#ff5500] text-black px-0.5 rounded-[2px] leading-none">CC</span> {anime.subCount}</span>}
                         {anime.dubCount && <span className="bg-[#52ff7f]/20 text-[#52ff7f] px-1 py-0.5 rounded flex items-center gap-1"><span className="bg-[#52ff7f] text-black px-0.5 rounded-[2px] leading-none">🎤</span> {anime.dubCount}</span>}
                         <span className="text-white/50">{anime.type || "TV"}</span>
                       </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
