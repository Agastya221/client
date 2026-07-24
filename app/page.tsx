import AnilistHeroCarousel from "@/components/anilist/AnilistHeroCarousel";
import AnilistCard from "@/components/anilist/AnilistCard";
import AiringSchedulePanel, { type AiringScheduleDay } from "@/components/anilist/AiringSchedulePanel";
import ContinueWatchingRail from "@/components/anime/ContinueWatchingRail";
import FollowedReleaseUpdatesRail from "@/components/anime/FollowedReleaseUpdatesRail";
import HomeBrowseShell from "@/components/home/HomeBrowseShell";
import type { HomeViewMode } from "@/lib/home-view";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getCatalogAvailabilityForMedia, getWatchHrefsFromAvailability } from "@/lib/anilist/availability";
import { getAnilistHeroAssets } from "@/lib/anilist/hero-assets";
import {
  getAnilistTrending,
  getAnilistSeasonal,
  getAnilistGenres,
  searchAnilist,
  anilistTitle,
  anilistRating,
  encodeAnilistRouteId,
  type AnilistMedia,
} from "@/lib/anilist/api";

import Link from "next/link";
import Image from "next/image";
import { CalendarDays, ChevronDown, ChevronRight, Flame, Megaphone, Radio, Star, TrendingUp, Zap } from "lucide-react";

// Cache home page for 5 minutes — serves from ISR on repeat visits instead of 4 fresh AniList API calls
export const revalidate = 300;


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
    <div className="mb-5 flex items-center justify-between">
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

const AIRING_TIME_ZONE = "Asia/Kolkata";

function scheduleDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AIRING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function buildAiringScheduleDays(media: AnilistMedia[]): AiringScheduleDay[] {
  const now = Date.now();
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: AIRING_TIME_ZONE, weekday: "short" });
  const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: AIRING_TIME_ZONE, month: "short", day: "numeric" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: AIRING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return [0, 1, 2].map((offset) => {
    const date = new Date(now + offset * 86_400_000);
    const key = scheduleDateKey(date);
    const items = media
      .filter((item) => item.nextAiringEpisode && scheduleDateKey(new Date(item.nextAiringEpisode.airingAt * 1000)) === key)
      .sort((left, right) => (left.nextAiringEpisode?.airingAt || 0) - (right.nextAiringEpisode?.airingAt || 0))
      .map((item) => ({
        id: item.id,
        title: anilistTitle(item),
        time: timeFormatter.format(new Date((item.nextAiringEpisode?.airingAt || 0) * 1000)),
        episode: item.nextAiringEpisode?.episode || 1,
        href: `/anime/${encodeAnilistRouteId(item.id)}?from=airing`,
      }));

    return {
      key,
      weekday: weekdayFormatter.format(date),
      dateLabel: dateFormatter.format(date),
      items,
    };
  });
}

function SidebarMediaPanel({
  title,
  media,
  href,
  accentColor,
  icon: Icon,
  fromAiring = false,
}: {
  title: string;
  media: AnilistMedia[];
  href: string;
  accentColor: string;
  icon: React.ElementType;
  fromAiring?: boolean;
}) {
  return (
    <section className="ap-glass-panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.08] p-4">
        <Icon className="h-4 w-4" style={{ color: accentColor }} aria-hidden="true" />
        <h2 className="text-sm font-black uppercase text-white">{title}</h2>
      </div>

      <div className="space-y-2 p-3">
        {media.slice(0, 5).map((item) => {
          const titleText = anilistTitle(item);
          const rating = anilistRating(item);
          const year = item.seasonYear || item.startDate.year;
          const episode = item.nextAiringEpisode
            ? Math.max(0, item.nextAiringEpisode.episode - 1)
            : item.episodes;
          return (
            <Link
              key={item.id}
              href={`/anime/${encodeAnilistRouteId(item.id)}${fromAiring ? "?from=airing" : ""}`}
              className="group flex min-h-20 items-center gap-3 rounded-xl border border-white/[0.035] bg-white/[0.025] p-2 transition-colors hover:border-white/10 hover:bg-white/[0.05]"
            >
              <div className="relative h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-lg bg-[#1a1c22]">
                <Image
                  src={item.coverImage.large || item.coverImage.extraLarge}
                  alt={titleText}
                  fill
                  quality={60}
                  sizes="48px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
                  <p className="line-clamp-2 text-[13px] font-bold leading-snug text-white/85 transition-colors group-hover:text-white">
                    {titleText}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4 text-[9px] font-bold uppercase text-white/30">
                  <span className="rounded bg-white/[0.04] px-1.5 py-0.5">{item.format}</span>
                  {year && <span className="rounded bg-white/[0.04] px-1.5 py-0.5">{year}</span>}
                  {episode ? <span className="rounded bg-white/[0.04] px-1.5 py-0.5">EP {episode}{item.episodes ? ` / ${item.episodes}` : ""}</span> : null}
                  {rating && (
                    <span className="inline-flex items-center gap-0.5 text-yellow-400/60">
                      <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                      {rating}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        <Link
          href={href}
          className="flex items-center justify-center rounded-xl bg-white/[0.025] py-3 text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white/60"
          aria-label={`View all ${title}`}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, trending, seasonal, airingResult, upcomingResult, genres] = await Promise.all([
    searchParams,
    getAnilistTrending(12),
    getAnilistSeasonal(30),
    searchAnilist({ sort: ["POPULARITY_DESC"], status: "RELEASING", perPage: 50 }),
    searchAnilist({ sort: ["POPULARITY_DESC"], status: "NOT_YET_RELEASED", perPage: 5 }),
    getAnilistGenres().catch(() => [] as string[]),
  ]);
  const initialMode: HomeViewMode = (
    Array.isArray(query.view) ? query.view[0] : query.view
  ) === "browse" ? "browse" : "home";

  const airingMedia = airingResult.media.filter((media) => media.nextAiringEpisode);
  const popular = airingMedia.slice(0, 8);
  const upcoming = upcomingResult.media.slice(0, 5);
  const airingScheduleDays = buildAiringScheduleDays(airingMedia);

  const newAiring = [
    ...new Map(
      [...seasonal.filter((media) => media.status === "RELEASING"), ...popular].map((media) => [media.id, media]),
    ).values(),
  ].slice(0, 10);
  const newAiringIds = new Set(newAiring.map((media) => media.id));
  const seasonHighlights = seasonal.filter((media) => !newAiringIds.has(media.id)).slice(0, 10);

  // Hero: top trending with banner images first
  const heroSlides = [...trending]
    .filter((m) => m.bannerImage)
    .slice(0, 8)
    .concat(trending.filter((m) => !m.bannerImage).slice(0, 3));
  const heroSlidesForCarousel = heroSlides.slice(0, 10);
  const [availabilityHints, initialHeroAsset] = await Promise.all([
    getCatalogAvailabilityForMedia([
      ...heroSlidesForCarousel,
      ...newAiring,
      ...seasonHighlights,
      ...trending.slice(0, 10),
      ...popular,
    ]),
    heroSlidesForCarousel[0]
      ? getAnilistHeroAssets(heroSlidesForCarousel[0].id)
      : Promise.resolve({ logo: null, backdrop: null }),
  ]);
  const watchHrefs = getWatchHrefsFromAvailability(availabilityHints);
  const initialHeroAssets = heroSlidesForCarousel[0]
    ? { [heroSlidesForCarousel[0].id]: initialHeroAsset }
    : {};

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea]">

      <HomeBrowseShell
        initialMode={initialMode}
        genres={genres}
        hero={(
          <AnilistHeroCarousel
            slides={heroSlidesForCarousel}
            watchHrefs={watchHrefs}
            availabilityHints={availabilityHints}
            initialHeroAssets={initialHeroAssets}
          />
        )}
      >

      {/* Main Content */}
      <div className="w-full px-3 py-8 sm:px-4 sm:py-10 lg:px-12 xl:px-16">

        {/* Continue Watching (client-side, reads localStorage) */}
        <div className="mb-8">
          <ContinueWatchingRail />
        </div>

        <div className="mb-8">
          <FollowedReleaseUpdatesRail />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">

          {/* Left: Main content */}
          <div className="flex min-w-0 flex-col gap-6">

            {/* New Airing */}
            <section className="home-render-section ap-glass-panel p-3 sm:p-5">
              <SectionHeader
                title="New Airing"
                icon={Radio}
                href="/ongoing"
                accentColor="#22d3ee"
              />
              <div className="grid grid-cols-2 gap-3 gap-y-7 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                {newAiring.map((media) => (
                  <AnilistCard key={media.id} media={media} availability={availabilityHints[media.id]} fromAiring />
                ))}
              </div>
            </section>

            {/* Current Season */}
            <section className="home-render-section ap-glass-panel p-3 sm:p-5">
              <SectionHeader
                title="This Season"
                icon={Zap}
                href="/search?sort=season"
                accentColor="#52ff7f"
              />
              <div className="grid grid-cols-2 gap-3 gap-y-7 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                {seasonHighlights.map((media) => (
                  <AnilistCard key={media.id} media={media} availability={availabilityHints[media.id]} fromAiring />
                ))}
              </div>
            </section>

            {/* Trending Now */}
            <section className="home-render-section ap-glass-panel p-3 sm:p-5">
              <SectionHeader
                title="Trending Now"
                icon={Flame}
                href="/search?sort=trending"
                accentColor="#ff5500"
              />
              <div className="grid grid-cols-2 gap-3 gap-y-7 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                {trending.slice(0, 10).map((media, i) => (
                  <AnilistCard key={media.id} media={media} rank={i + 1} availability={availabilityHints[media.id]} />
                ))}
              </div>
            </section>

            {/* Browse Genres */}
            <section className="home-render-section ap-glass-panel p-3 sm:p-5">
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
          <aside className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
            <AiringSchedulePanel days={airingScheduleDays} />

            <SidebarMediaPanel
              title="Upcoming"
              media={upcoming}
              href="/search?sort=season"
              accentColor="#ff9f1c"
              icon={Megaphone}
            />

            <SidebarMediaPanel
              title="Top Airing"
              media={airingMedia}
              href="/ongoing"
              accentColor="#7CFF00"
              icon={CalendarDays}
              fromAiring
            />
          </aside>
        </div>
      </div>
      </HomeBrowseShell>

      <SiteFooter />
    </main>
  );
}
