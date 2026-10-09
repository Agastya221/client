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
import { getAnilistHeroAssets, type AnilistHeroAssets } from "@/lib/anilist/hero-assets";
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

// Served from a cached, pre-rendered copy and rebuilt in the background at most every
// 30 minutes. force-static is required because the AniList fetches use cache: "no-store",
// which would otherwise make the page render on every request. The KV-backed data caches
// underneath keep the rebuild cheap. 30 minutes (not 5) keeps rebuilds to ~48 KV writes a
// day against the free plan's 1,000.
export const dynamic = "force-static";
export const revalidate = 10800;

// How many hero slides get their logo/backdrop resolved on the server. The carousel
// seeds from initialHeroAssets and fetches anything missing client-side, so this is a
// pure latency trade: every extra slide is another parallel lookup that can widen the
// cold-cache tail of the homepage render. All ten: the lookups are KV-cached for 7 days and
// the page itself is cached for hours, while a client-side lookup per slide took 0.2-2.2 s
// before its logo could even start loading.
const HERO_ASSET_SEED_COUNT = 10;


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

/*
 * Module scope, not inside the component: this reads the wall clock, and calling
 * an impure function during render is what `react-hooks/purity` flags. It closes
 * over nothing from Home, so hoisting is a pure move. The page is ISR'd at
 * `revalidate = 1800`, so "now" is the render time of the cached HTML.
 */
function isUnreleased(m: AnilistMedia): boolean {
  const status = String(m.status || "").toUpperCase().replace(/[ -]+/g, "_");
  if (status === "NOT_YET_RELEASED" || status === "UPCOMING") return true;
  if (status === "RELEASING" || status === "FINISHED") return false;

  const { year, month, day } = m.startDate || {};
  if (!year || !month || !day) return false;
  return Date.UTC(year, month - 1, day) > Date.now();
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
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  fromAiring?: boolean;
}) {
  return (
    <section className="home-render-section ap-glass-panel overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d10]/80 shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] p-4 bg-gradient-to-r from-white/[0.03] to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-1 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}90` }} />
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" style={{ color: accentColor }} aria-hidden="true" />
            <h2 className="text-base font-black tracking-tight text-white">{title}</h2>
          </div>
        </div>
        <Link
          href={href}
          className="group flex items-center gap-1 text-[11px] font-bold text-white/50 transition-colors hover:text-white"
        >
          <span>View All</span>
          <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="space-y-2 p-3">
        {media.slice(0, 5).map((item, idx) => {
          const titleText = anilistTitle(item);
          const rating = anilistRating(item);
          const year = item.seasonYear || item.startDate.year;
          const episode = item.nextAiringEpisode
            ? Math.max(0, item.nextAiringEpisode.episode - 1)
            : item.episodes;
          const isUpcoming = item.status === "NOT_YET_RELEASED" || item.status === "Upcoming";

          return (
            <Link
              key={item.id}
              href={`/anime/${encodeAnilistRouteId(item.id)}${fromAiring ? "?from=airing" : ""}`}
              prefetch={false}
              className="group flex min-h-[4.5rem] items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-2 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.06] hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
            >
              {/* Cover image with optional rank or soon badge */}
              <div className="relative h-[4.75rem] w-[3.25rem] shrink-0 overflow-hidden rounded-lg bg-[#1a1c22]">
                <Image
                  src={item.coverImage.large || item.coverImage.extraLarge}
                  alt={titleText}
                  fill
                  quality={65}
                  sizes="52px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {fromAiring && (
                  <span className="absolute top-1 left-1 rounded bg-black/80 px-1 py-0.5 text-[8px] font-black text-amber-300 shadow backdrop-blur-md">
                    #{idx + 1}
                  </span>
                )}
                {isUpcoming && (
                  <span className="absolute top-1 right-1 rounded-full bg-black/80 px-1 py-0.5 text-[7px] font-black text-white shadow backdrop-blur-md">
                    Soon
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
                  />
                  <p className="line-clamp-2 text-xs font-bold leading-snug text-white/85 transition-colors group-hover:text-white">
                    {titleText}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase text-white/40">
                  <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5">{item.format}</span>
                  {year && <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5">{year}</span>}
                  {episode ? <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5">EP {episode}{item.episodes ? `/${item.episodes}` : ""}</span> : null}
                  {rating && (
                    <span className="inline-flex items-center gap-0.5 text-amber-400 font-bold">
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
          className="group mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-bold text-white/60 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <span>View All</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export default async function Home() {
  const [trendingRaw, seasonalRaw, airingResult, upcomingResult, genres] = await Promise.all([
    getAnilistTrending(16),
    getAnilistSeasonal(30),
    searchAnilist({ sort: ["POPULARITY_DESC"], status: "RELEASING", perPage: 50 }),
    searchAnilist({ sort: ["POPULARITY_DESC"], status: "NOT_YET_RELEASED", perPage: 15 }),
    getAnilistGenres().catch(() => [] as string[]),
  ]);
  // `?view=browse` is applied in the browser by HomeBrowseShell (the page is cached).
  const initialMode: HomeViewMode = "home";


  // 2. Filter out unreleased anime from other rails
  const trending = trendingRaw.filter((m) => !isUnreleased(m));
  const airingMedia = airingResult.media.filter((media) => !isUnreleased(media));
  const popular = airingMedia.slice(0, 8);
  const airingScheduleDays = buildAiringScheduleDays(airingMedia);

  const seasonalClean = seasonalRaw.filter((m) => !isUnreleased(m));
  const newAiring = [
    ...new Map(
      [...seasonalClean.filter((media) => media.status === "RELEASING"), ...popular].map((media) => [media.id, media]),
    ).values(),
  ].slice(0, 10);
  const newAiringIds = new Set(newAiring.map((media) => media.id));
  // The season's shows that are not already under New Airing, including the ones that have not
  // started yet (the cards mark them). Early in a season nearly every show is either airing (so in
  // New Airing) or not started, and excluding the latter left this rail empty, e.g. on 3 Oct 2026:
  // 9 airing + 21 upcoming of the top 30. Popular airing shows fill it if the season list failed.
  const seasonHighlights = [
    ...seasonalRaw.filter((media) => !newAiringIds.has(media.id)),
    ...airingMedia.filter((media) => !newAiringIds.has(media.id)),
  ].filter((media, index, list) => list.findIndex((other) => other.id === media.id) === index).slice(0, 10);
  const seasonHighlightIds = new Set(seasonHighlights.map((media) => media.id));

  // Coming Soon: unreleased shows not already in This Season (later seasons, mostly).
  const upcomingRaw = upcomingResult.media || [];
  const comingSoonFromOther = [...trendingRaw, ...seasonalRaw].filter(isUnreleased);
  const comingSoonMedia = [
    ...new Map([...upcomingRaw, ...comingSoonFromOther].map((m) => [m.id, m])).values(),
  ].filter((media) => !seasonHighlightIds.has(media.id)).slice(0, 10);

  // Hero: top trending with banner images first
  const heroSlides = [...trending]
    .filter((m) => m.bannerImage)
    .slice(0, 8)
    .concat(trending.filter((m) => !m.bannerImage).slice(0, 3));
  const heroSlidesForCarousel = heroSlides.slice(0, 10);
  // Server-render hero assets for the first few slides so their logos are in the
  // initial HTML instead of popping in after a client-side fetch. These run in
  // parallel with each other AND with the availability batch below, so they add no
  // sequential await to the page's critical path — only the slowest of the group
  // matters. getAnilistHeroAssets is memory+KV cached for 7 days, so this is almost
  // always warm; the per-slide catch keeps a cold-cache failure from taking down the
  // batch (its internal catches cover the asset fetches but not the prequel lookup or
  // the KV read itself).
  const heroAssetSeedSlides = heroSlidesForCarousel.slice(0, HERO_ASSET_SEED_COUNT);
  const [availabilityHints, seededHeroAssetEntries] = await Promise.all([
    getCatalogAvailabilityForMedia([
      ...heroSlidesForCarousel,
      ...newAiring,
      ...seasonHighlights,
      ...trending.slice(0, 10),
      ...comingSoonMedia,
      ...popular,
    ]),
    Promise.all(
      heroAssetSeedSlides.map(
        async (slide): Promise<[number, AnilistHeroAssets]> => [
          slide.id,
          await getAnilistHeroAssets(slide.id).catch(() => ({ logo: null, backdrop: null })),
        ],
      ),
    ),
  ]);
  const watchHrefs = getWatchHrefsFromAvailability(availabilityHints);
  const initialHeroAssets: Record<number, AnilistHeroAssets> = {};
  for (const [anilistId, assets] of seededHeroAssetEntries) {
    initialHeroAssets[anilistId] = assets;
  }

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

            {/* Coming Soon */}
            {comingSoonMedia.length > 0 && (
              <section className="home-render-section ap-glass-panel p-3 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-5 w-1 rounded-full bg-purple-500" style={{ boxShadow: "0 0 12px rgba(168,85,247,0.6)" }} />
                    <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                      Coming Soon
                      <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.25)]">
                        UPCOMING
                      </span>
                    </h2>
                  </div>
                  <Link
                    href="/search?status=NOT_YET_RELEASED"
                    className="group flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/60 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <span>View All</span>
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 gap-y-7 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                  {comingSoonMedia.map((media) => (
                    <AnilistCard key={media.id} media={media} availability={availabilityHints[media.id]} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Sidebar */}
          <aside className="flex flex-col gap-6">
            <AiringSchedulePanel days={airingScheduleDays} />

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
