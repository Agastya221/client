import AnilistHeroCarousel from "@/components/anilist/AnilistHeroCarousel";
import AnilistCard from "@/components/anilist/AnilistCard";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import {
  getAnilistTrending,
  getAnilistSeasonal,
  getAnilistPopular,
  anilistTitle,
  anilistRating,
  encodeAnilistRouteId,
  type AnilistMedia,
} from "@/lib/anilist/api";
import Link from "next/link";
import { ChevronRight, Star, Flame, Zap, Clock, TrendingUp } from "lucide-react";

// Section header component
function SectionHeader({
  title,
  icon: Icon,
  href,
  accentColor = "#ff5500",
}: {
  title: string;
  icon?: React.ElementType;
  href?: string;
  accentColor?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
        <h2 className="text-xl font-black text-white tracking-tight">{title}</h2>
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-bold text-white/40 hover:text-white transition-colors group"
        >
          View all
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  );
}

// Trending rank list item
function TrendingRow({ media, rank }: { media: AnilistMedia; rank: number }) {
  const title = anilistTitle(media);
  const rating = anilistRating(media);
  const href = `/anime/${encodeAnilistRouteId(media.id)}`;
  const isTop3 = rank <= 3;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 group rounded-xl hover:bg-white/5 p-2.5 -mx-2.5 transition-all duration-200"
    >
      {/* Rank */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-black text-sm ${
          isTop3 ? "text-black" : "text-white/30 bg-white/5"
        }`}
        style={isTop3 ? { backgroundColor: media.coverImage.color || "#ff5500" } : {}}
      >
        {rank}
      </div>

      {/* Poster */}
      <img
        src={media.coverImage.large}
        alt={title}
        className="w-10 h-14 rounded-lg object-cover shrink-0"
      />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-bold line-clamp-1 group-hover:text-[#ff5500] transition-colors">
          {title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {rating && (
            <span className="flex items-center gap-0.5 text-yellow-400 text-[10px] font-bold">
              <Star className="w-2.5 h-2.5 fill-current" /> {rating}
            </span>
          )}
          <span className="text-white/30 text-[10px] font-semibold">{media.format}</span>
          {media.status === "RELEASING" && (
            <span className="text-[#52ff7f] text-[9px] font-black uppercase">LIVE</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function Home() {
  const [trending, seasonal, popular] = await Promise.all([
    getAnilistTrending(12),
    getAnilistSeasonal(16),
    getAnilistPopular(6),
  ]);

  // Hero: top trending with banner images first
  const heroSlides = [...trending]
    .filter((m) => m.bannerImage)
    .slice(0, 8)
    .concat(trending.filter((m) => !m.bannerImage).slice(0, 3));

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea]">
      <Navbar />

      {/* Hero Carousel */}
      <AnilistHeroCarousel slides={heroSlides.slice(0, 10)} />

      {/* Main Content */}
      <div className="w-full px-4 lg:px-12 xl:px-16 py-12">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-10">

          {/* Left: Main content */}
          <div className="flex flex-col gap-16">

            {/* Current Season */}
            <section>
              <SectionHeader
                title={`This Season`}
                icon={Zap}
                href="/search?sort=season"
                accentColor="#52ff7f"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 gap-y-8">
                {seasonal.slice(0, 12).map((media) => (
                  <AnilistCard key={media.id} media={media} />
                ))}
              </div>
            </section>

            {/* Trending Now */}
            <section>
              <SectionHeader
                title="Trending Now"
                icon={Flame}
                href="/search?sort=trending"
                accentColor="#ff5500"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 gap-y-8">
                {trending.slice(0, 8).map((media, i) => (
                  <AnilistCard key={media.id} media={media} rank={i + 1} />
                ))}
              </div>
            </section>

            {/* Browse Genres */}
            <section>
              <SectionHeader title="Browse by Genre" icon={TrendingUp} accentColor="#a855f7" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {[
                  { name: "Action", color: "#ef4444", emoji: "⚔️" },
                  { name: "Romance", color: "#ec4899", emoji: "💕" },
                  { name: "Fantasy", color: "#8b5cf6", emoji: "🔮" },
                  { name: "Adventure", color: "#f97316", emoji: "🗺️" },
                  { name: "Comedy", color: "#eab308", emoji: "😂" },
                  { name: "Sci-Fi", color: "#06b6d4", emoji: "🤖" },
                  { name: "Horror", color: "#6b7280", emoji: "💀" },
                  { name: "Mystery", color: "#3b82f6", emoji: "🔍" },
                ].map(({ name, color, emoji }) => (
                  <Link
                    key={name}
                    href={`/search?genre=${name}`}
                    className="group relative overflow-hidden rounded-2xl p-4 border border-white/5 hover:border-white/15 transition-all duration-200 flex items-center gap-3"
                    style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)` }}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <div>
                      <p className="text-white font-bold text-sm">{name}</p>
                      <p className="text-white/40 text-[10px]">Explore →</p>
                    </div>
                    <div
                      className="absolute -right-4 -bottom-4 w-16 h-16 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
                      style={{ backgroundColor: color }}
                    />
                  </Link>
                ))}
              </div>
            </section>
          </div>

          {/* Right Sidebar */}
          <aside className="flex flex-col gap-8">

            {/* Popular Right Now */}
            <div className="bg-[#111215] rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ff5500]/20 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-[#ff5500]" />
                </div>
                <h2 className="font-black text-white">Top Trending</h2>
                <div className="ml-auto bg-[#ff5500] text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  LIVE
                </div>
              </div>
              <div className="p-3 flex flex-col">
                {trending.slice(0, 8).map((media, i) => (
                  <TrendingRow key={media.id} media={media} rank={i + 1} />
                ))}
              </div>
            </div>

            {/* Popular Airing */}
            <div className="bg-[#111215] rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#52ff7f]/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-[#52ff7f]" />
                </div>
                <h2 className="font-black text-white">Popular Airing</h2>
              </div>
              <div className="p-3 flex flex-col">
                {popular.map((media, i) => (
                  <TrendingRow key={media.id} media={media} rank={i + 1} />
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
