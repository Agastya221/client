import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import AnilistCard from "@/components/anilist/AnilistCard";
import {
  getAnilistDetail,
  anilistTitle,
  anilistRating,
  anilistFormat,
  anilistStatus,
  anilistYear,
  encodeAnilistRouteId,
  type AnilistDetailMedia,
} from "@/lib/anilist/api";

import { Play, Star, Calendar, Tv, Users, BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AddToListButton from "@/components/anime/AddToListButton";
import AniListStatusModal from "@/components/anime/AniListStatusModal";
import AiringAwareWatchLink from "@/components/anime/AiringAwareWatchLink";
import { UpcomingReleaseCta } from "@/components/anime/ReleaseCountdown";
import { isUnreleasedStatus, resolveReleaseSchedule } from "@/lib/anime/release-schedule";
import ExpandableSynopsis from "@/components/anime/ExpandableSynopsis";
import ThemeAccentSource from "@/components/ui/ThemeAccentSource";
import WatchDataPrefetch from "@/components/anime/WatchDataPrefetch";

// Served from a cached, pre-rendered copy per anime, rebuilt in the background at most
// every 6 hours (an anime's details rarely change within a day). force-static is needed
// because the AniList fetches use cache: "no-store". Pages are generated on first visit,
// so this adds at most ~4 KV writes a day per anime that is actually being viewed.
// Note: non-AniList legacy routes (AnimeKaiDetailPage) now see empty search params.
export const dynamic = "force-static";
export const revalidate = 86400;



export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!id.startsWith("anilist~")) {
    return { title: "Anime Details | Yorumi" };
  }
  const anilistId = parseInt(id.replace("anilist~", ""), 10);
  if (isNaN(anilistId)) return { title: "Not Found | Yorumi" };

  try {
    const media = await getAnilistDetail(anilistId);
    const title = anilistTitle(media);
    const desc = media.description?.replace(/<[^>]*>/g, "").slice(0, 160) || `Watch ${title} on Yorumi`;
    return {
      title: `${title} | Yorumi`,
      description: desc,
      openGraph: {
        title: `${title} | Yorumi`,
        description: desc,
        images: [media.coverImage.extraLarge || media.coverImage.large],
      },
    };
  } catch {
    return { title: "Anime Details | Yorumi" };
  }
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-white/5 rounded-xl p-4 border border-white/5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</span>
      <span className="text-sm font-semibold text-white/80">{value}</span>
    </div>
  );
}

function CharacterCard({ char }: { char: { name: { full: string }; image: { medium: string } } }) {
  return (
    <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
      <img
        src={char.image.medium}
        alt={char.name.full}
        loading="lazy"
        className="w-10 h-10 rounded-full object-cover shrink-0"
      />
      <span className="text-sm font-semibold text-white/80 line-clamp-1">{char.name.full}</span>
    </div>
  );
}

async function AnilistDetailContent({ anilistId }: { anilistId: number }) {
  const media = await getAnilistDetail(anilistId);
  const title = anilistTitle(media);
  const rating = anilistRating(media);
  const format = anilistFormat(media);
  const status = anilistStatus(media);
  const year = anilistYear(media);
  const studios = media.studios.nodes.map((s) => s.name).join(", ");
  const description = media.description?.replace(/<[^>]*>/g, "") || "";
  const accentColor = media.coverImage.color || "#ff5500";
  const routeId = encodeAnilistRouteId(anilistId);
  const selfHref = `/anime/${routeId}`;
  
  const latestEpisode = media.status === "RELEASING" && media.nextAiringEpisode
    ? Math.max(1, media.nextAiringEpisode.episode - 1)
    : 1;
  // Nothing has aired yet: show when it airs instead of a Watch button that leads nowhere.
  const notYetAired =
    isUnreleasedStatus(media.status) ||
    (media.status === "RELEASING" && media.nextAiringEpisode?.episode === 1);
  const releaseSchedule = notYetAired
    ? resolveReleaseSchedule({ nextAiringEpisode: media.nextAiringEpisode, startDate: media.startDate })
    : null;
  const ctaClassName = "flex h-12 items-center justify-center gap-2 rounded-full border px-3 sm:px-6 text-xs sm:text-sm font-black shadow-lg backdrop-blur-md transition-all duration-200 w-full sm:w-auto text-center whitespace-nowrap";
  const ctaStyle = {
    backgroundColor: `${accentColor}22`,
    borderColor: `${accentColor}80`,
    color: `color-mix(in srgb, ${accentColor} 68%, white)`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px ${accentColor}24`,
  };
  const watchCta = (
    <AiringAwareWatchLink
      routeId={routeId}
      latestEpisode={latestEpisode}
      animeId={routeId}
      className={`${ctaClassName} hover:-translate-y-0.5 hover:brightness-125`}
      style={ctaStyle}
    >
      <Play className="w-4 h-4 fill-current shrink-0" />
      <span>WATCH NOW</span>
    </AiringAwareWatchLink>
  );


  const relations = media.relations.edges.filter(
    (e) => e.relationType === "SEQUEL" || e.relationType === "PREQUEL" || e.relationType === "SIDE_STORY"
  );

  const recommendations = media.recommendations.nodes
    .map((n) => n.mediaRecommendation)
    .filter(Boolean)
    .slice(0, 8) as AnilistDetailMedia[];

  // AniList omits bannerImage for many movies/older titles; fall back to the
  // portrait cover so the hero never collapses to just the accent glow.
  // coverImage.extraLarge is typed `string` but the normalizer defaults missing
  // values to "", so these must be truthiness checks, not null checks.
  const heroBackground = media.bannerImage || media.coverImage.extraLarge || media.coverImage.large;
  const heroIsCover = !media.bannerImage;

  return (
    <>
      <ThemeAccentSource color={accentColor} />
      <WatchDataPrefetch anilistId={anilistId} />
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Banner bg */}
        {heroBackground && (
          <div className="absolute inset-0 z-0">
            <Image
              src={heroBackground}
              alt={title}
              fill
              priority
              quality={75}
              className={`object-cover opacity-30 ${heroIsCover ? "object-top" : ""}`}
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0b0c]/60 via-[#0a0b0c]/80 to-[#0a0b0c]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] via-transparent to-transparent" />
          </div>
        )}

        {/* Glow from accent color */}
        <div
          className="absolute inset-0 z-0 opacity-10"
          style={{ background: `radial-gradient(ellipse at 20% 50%, ${accentColor} 0%, transparent 60%)` }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-8 pt-24 sm:px-6 sm:pb-12 sm:pt-28 lg:pb-16">
          <div className="grid items-start gap-6 sm:gap-8 lg:grid-cols-[280px_1fr] lg:gap-10">
            {/* Poster */}
            <div className="flex justify-center lg:block">
              <div className="relative">
                <div
                  className="absolute -inset-3 rounded-2xl blur-2xl opacity-30"
                  style={{ backgroundColor: accentColor }}
                />
                <Image
                  src={media.coverImage.extraLarge}
                  alt={title}
                  width={280}
                  height={420}
                  priority
                  quality={80}
                  className="relative w-36 rounded-2xl border border-white/10 object-cover shadow-2xl sm:w-52 lg:w-full"
                />
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-col">
              {/* Badges */}
              <div className="order-1 mb-4 flex flex-wrap items-center gap-2 lg:mb-6">
                {media.status === "RELEASING" && (
                  <span
                    className="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:px-3"
                    style={{
                      backgroundColor: `${accentColor}20`,
                      borderColor: `${accentColor}70`,
                      color: `color-mix(in srgb, ${accentColor} 72%, white)`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 24px ${accentColor}18`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    NOW AIRING
                  </span>
                )}
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                  <Tv className="h-3 w-3 text-white/55" /> {format}
                </span>
                {year && (
                  <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                    <Calendar className="h-3 w-3 text-white/55" /> {year}
                  </span>
                )}
                {rating && (
                  <span className="flex items-center gap-1.5 rounded-full border border-amber-300/35 bg-amber-300/15 px-3 py-1.5 text-[11px] font-black text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                    <Star className="h-3 w-3 fill-current" /> {rating}
                  </span>
                )}
              </div>

              {/* Title */}
              <div className="order-2 mb-5 lg:mb-6">
                <h1 className="max-w-2xl text-balance text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {title}
                </h1>
                {media.title.native && media.title.native !== title && (
                  <p className="mt-2 text-sm font-semibold text-white/30 sm:text-lg">{media.title.native}</p>
                )}
              </div>

              {/* Studios + genres */}
              <div className="order-4 mb-4 flex flex-wrap items-center gap-2 lg:order-3 lg:mb-6">
                {studios && <span className="text-white/50 text-sm font-semibold">{studios}</span>}
                {studios && media.genres.length > 0 && <span className="w-1 h-1 rounded-full bg-white/20" />}
                {media.genres.slice(0, 4).map((g) => (
                  <Link
                    key={g}
                    href={`/search?genre=${encodeURIComponent(g)}`}
                    className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] font-semibold text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md transition-colors hover:border-white/25 hover:text-white"
                  >
                    {g}
                  </Link>
                ))}
              </div>

              {/* Description */}
              {description && (
                <p className="order-5 mb-0 max-w-2xl text-sm leading-relaxed text-white/60 line-clamp-3 lg:order-4 lg:mb-6 lg:line-clamp-4">
                  {description}
                </p>
              )}

              {/* CTAs */}
              <div className="order-3 mb-5 grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto lg:order-5 lg:mb-0 lg:pt-2">
                {releaseSchedule ? (
                  <UpcomingReleaseCta
                    schedule={releaseSchedule}
                    className={`${ctaClassName} min-w-0 cursor-default`}
                    style={ctaStyle}
                    airedFallback={watchCta}
                  />
                ) : (
                  watchCta
                )}
                <div className="w-full sm:w-auto min-w-0">
                  <AddToListButton
                    animeId={`anilist~${anilistId}`}
                    title={title}
                    poster={media.coverImage.extraLarge || media.coverImage.large}
                    href={selfHref}
                    totalEpisodes={media.episodes}
                    rawMediaId={anilistId}
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Details Section */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          {/* Left */}
          <div className="space-y-10">
            {/* Metadata grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetaBadge label="Status" value={status} />
              {format && <MetaBadge label="Format" value={format} />}
              {year && <MetaBadge label="Year" value={year} />}
              {media.episodes && <MetaBadge label="Episodes" value={String(media.episodes)} />}
              {studios && <MetaBadge label="Studio" value={studios} />}
              {media.season && media.seasonYear && (
                <MetaBadge label="Season" value={`${media.season} ${media.seasonYear}`} />
              )}
              {rating && <MetaBadge label="Score" value={`${rating} / 10`} />}
              {media.popularity && <MetaBadge label="Popularity" value={`#${media.popularity.toLocaleString()}`} />}
            </div>

            {/* Synopsis */}
            {description && (
              <div className="bg-white/5 rounded-2xl p-6 border border-white/5 animate-modal-in">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Synopsis</h2>
                </div>
                <ExpandableSynopsis text={description} accentColor="#ff5500" />
              </div>
            )}

            {/* Characters */}
            {media.characters.nodes.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Characters</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {media.characters.nodes.map((char) => (
                    <CharacterCard key={char.name.full} char={char} />
                  ))}
                </div>
              </div>
            )}

            {/* Relations */}
            {relations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <ChevronRight className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Related</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {relations.map((edge) => (
                    <Link
                      key={edge.node.id}
                      href={`/anime/${encodeAnilistRouteId(edge.node.id)}`}
                      prefetch={false}
                      className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 transition-all"
                    >
                      <img
                        src={edge.node.coverImage.large}
                        alt={edge.node.title.english || edge.node.title.romaji}
                        className="w-10 h-14 rounded-lg object-cover"
                      />
                      <div>
                        <p className="text-[10px] text-white/40 font-bold uppercase">{edge.relationType}</p>
                        <p className="text-sm font-bold text-white/80 line-clamp-1 max-w-[160px]">
                          {edge.node.title.english || edge.node.title.romaji}
                        </p>
                        <p className="text-[10px] text-white/40">{edge.node.format}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Recommendations */}
          {recommendations.length > 0 && (
            <aside>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Recommended</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {recommendations.slice(0, 6).map((rec) => (
                  <AnilistCard key={rec.id} media={rec} />
                ))}
              </div>
            </aside>
          )}
        </div>
      </section>
    </>
  );
}

export default async function AnilistDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;

  // Check if this is an anilist route
  if (!id.startsWith("anilist~")) {
    // Delegate to the original AnimeKai detail handler
    const { default: AnimeKaiDetailPage } = await import("./animekai-detail");
    return <AnimeKaiDetailPage params={params} searchParams={searchParams} />;
  }

  const anilistId = parseInt(id.replace("anilist~", ""), 10);
  if (isNaN(anilistId)) return notFound();

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea]">
      <AnilistDetailContent anilistId={anilistId} />
      <SiteFooter />
    </main>
  );
}
