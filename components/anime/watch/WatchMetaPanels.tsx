"use client";

import type { WatchSessionModel } from "@/lib/anime/types";
import {
  anilistFormat,
  anilistRating,
  anilistTitle,
  encodeAnilistRouteId,
  type AnilistMedia,
  type AnilistSeasonEntry,
} from "@/lib/anilist/api";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Film,
  Globe2,
  Info,
  Layers3,
  Play,
  ShieldCheck,
  Star,
  Tv2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, type ReactNode } from "react";

interface RelatedAnimeEntry {
  relationType: string;
  media: AnilistMedia;
}

function metadataValue(value: string | number | null | undefined, fallback = "Unknown") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function cleanDescription(value: string | null | undefined) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatStatus(value: string | null | undefined) {
  return metadataValue(value).replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function formatScore(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Unknown";
  const normalized = String(value).replace(/\s+/g, "");
  return normalized.includes("/") ? normalized : normalized + "/100";
}

function formatCatalogDate(date: AnilistMedia["endDate"] | AnilistMedia["startDate"] | null | undefined) {
  if (!date?.year) return null;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = date.month ? monthNames[date.month - 1] : null;
  if (!month) return String(date.year);
  if (!date.day) return `${month} ${date.year}`;
  return `${month} ${date.day}, ${date.year}`;
}

function formatCountry(value: string | null | undefined) {
  if (!value) return null;
  const countries: Record<string, string> = {
    JP: "Japan",
    CN: "China",
    KR: "South Korea",
    TW: "Taiwan",
    US: "United States",
  };
  return countries[value.toUpperCase()] || value;
}

function SafeArtwork({
  src,
  accentColor,
  sizes,
  quality = 65,
  className = "object-cover",
}: {
  src?: string | null;
  accentColor: string;
  sizes: string;
  quality?: 45 | 55 | 60 | 65 | 70 | 75;
  className?: string;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 25% 20%, ${accentColor}42, transparent 48%), linear-gradient(135deg, ${accentColor}24, #17191d 58%, #0c0d0f)`,
        }}
      >
        <Film className="h-7 w-7 text-white/12" aria-hidden="true" />
      </div>
      {src ? (
        <Image
          src={src}
          alt=""
          aria-hidden="true"
          fill
          loading="lazy"
          quality={quality}
          sizes={sizes}
          className={`${className} opacity-0 transition-[opacity,transform] duration-500`}
          onLoad={(event) => {
            event.currentTarget.style.opacity = "1";
          }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </>
  );
}

export function WatchAnimeDetailsPanel({
  session,
  heroImage,
  detail,
  children,
}: {
  session: WatchSessionModel;
  heroImage: string;
  detail?: AnilistMedia | null;
  children?: ReactNode;
}) {
  const accentColor = detail?.coverImage.color || session.anime.color || "#ff5500";
  const synopsis = cleanDescription(detail?.description || session.anime.description);
  const poster = detail?.coverImage.extraLarge || detail?.coverImage.large || session.anime.poster || heroImage;
  const banner = detail?.bannerImage || session.anime.banner || heroImage;
  const score = detail?.averageScore || detail?.meanScore || session.anime.rating;
  const year = detail?.seasonYear || detail?.startDate.year || session.anime.year;
  const studios = detail?.studios.nodes.map((entry) => entry.name).filter(Boolean).join(", ");
  const genres = detail?.genres.length ? detail.genres : session.anime.genres;
  const anilistId = detail?.id || session.anime.anilistId;
  const malId = detail?.idMal || session.anime.malId;
  const startDate = formatCatalogDate(detail?.startDate);
  const endDate = formatCatalogDate(detail?.endDate);
  const country = formatCountry(detail?.countryOfOrigin);
  const officialLink = detail?.externalLinks?.find((entry) => /official\s*(site|website)?/i.test(entry.site));
  const facts = [
    { label: "Format", value: metadataValue(detail?.format || session.anime.type), icon: Tv2 },
    { label: "Status", value: formatStatus(detail?.status || session.anime.status), icon: Clock3 },
    { label: "Episodes", value: metadataValue(detail?.episodes || session.anime.episodeCount), icon: Play },
    { label: "Year", value: metadataValue(year), icon: Calendar },
    { label: "Score", value: formatScore(score), icon: Star },
    { label: "Studio", value: metadataValue(studios), icon: Film },
  ];
  if (detail?.season) {
    facts.push({ label: "Season", value: `${formatStatus(detail.season)}${detail.seasonYear ? ` ${detail.seasonYear}` : ""}`, icon: Layers3 });
  }
  if (startDate) facts.push({ label: "Start date", value: startDate, icon: Calendar });
  if (endDate) facts.push({ label: "End date", value: endDate, icon: Calendar });
  if (country) facts.push({ label: "Country", value: country, icon: Globe2 });
  if (detail?.duration) facts.push({ label: "Duration", value: `${detail.duration} min`, icon: Clock3 });
  if (detail) facts.push({ label: "Adult", value: detail.isAdult ? "Yes" : "No", icon: ShieldCheck });

  const trailerHref = detail?.trailer?.site.toLowerCase() === "youtube"
    ? "https://www.youtube.com/watch?v=" + detail.trailer.id
    : null;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e0f11]">
        {banner ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48 overflow-hidden opacity-[0.13] [mask-image:linear-gradient(to_bottom,black,transparent)]">
            <SafeArtwork src={banner} accentColor={accentColor} sizes="(max-width: 768px) 100vw, 900px" quality={60} className="object-cover blur-[1px]" />
          </div>
        ) : null}

        <div className="relative grid gap-5 p-4 sm:grid-cols-[156px_minmax(0,1fr)] sm:p-5">
          <div className="mx-auto w-[138px] sm:mx-0 sm:w-[156px]">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-[0_20px_50px_rgba(0,0,0,0.48)]">
              <SafeArtwork src={poster} accentColor={accentColor} sizes="156px" quality={70} />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {trailerHref ? (
                <a
                  href={trailerHref}
                  target="_blank"
                  rel="noreferrer"
                  className="col-span-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-black uppercase tracking-wide text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  Trailer
                </a>
              ) : null}
              {anilistId ? (
                <a
                  href={"https://anilist.co/anime/" + anilistId}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] text-[10px] font-black text-white/55 transition-colors hover:text-white"
                >
                  AniList
                </a>
              ) : null}
              {malId ? (
                <a
                  href={"https://myanimelist.net/anime/" + malId}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] text-[10px] font-black text-white/55 transition-colors hover:text-white"
                >
                  MAL
                </a>
              ) : null}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={session.anime.href} className="group">
                  <h2 className="text-2xl font-black leading-tight text-white transition-opacity group-hover:opacity-80 sm:text-[1.7rem]">
                    {session.anime.title}
                  </h2>
                </Link>
                {session.anime.subtitle ? (
                  <p className="mt-1 text-sm italic text-white/38">{session.anime.subtitle}</p>
                ) : null}
              </div>
              {score ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-bold text-white/78">
                  <Star className="h-3.5 w-3.5 fill-current" style={{ color: accentColor }} aria-hidden="true" />
                  {score}
                </span>
              ) : null}
            </div>

            {genres.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <Link
                    key={genre}
                    href={"/search?genre=" + encodeURIComponent(genre)}
                    className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-75"
                    style={{ color: accentColor, borderColor: accentColor + "45", backgroundColor: accentColor + "16" }}
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            ) : null}

            {synopsis ? (
              <p className="mt-4 rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3 text-[13px] leading-6 text-white/55">
                {synopsis}
              </p>
            ) : null}

            <dl className="mt-4 grid gap-x-8 gap-y-3 border-y border-white/[0.07] py-4 sm:grid-cols-2 lg:grid-cols-3">
              {facts.map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex min-w-0 items-center gap-2 text-xs">
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} aria-hidden="true" />
                  <dt className="text-white/35">{label}</dt>
                  <dd className="truncate font-semibold text-white/80" title={value}>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={session.anime.href}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                Full details
              </Link>
              {anilistId ? (
                <a
                  href={"https://anilist.co/anime/" + anilistId}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold text-white/38 transition-colors hover:text-white/70"
                >
                  Source <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
              {officialLink ? (
                <a
                  href={officialLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold text-white/38 transition-colors hover:text-white/70"
                >
                  Official site <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

function seasonRelationLabel(entry: AnilistSeasonEntry) {
  if (entry.isCurrent) return "Now watching";
  if (entry.kind === "special") return entry.relationType.replaceAll("_", " ");
  if (entry.relationType === "PREQUEL") return "Previous season";
  if (entry.relationType === "SEQUEL") return "Next season";
  return entry.relationType.replaceAll("_", " ");
}

export function WatchSeasonsPanel({
  seasons,
  accentColor,
  variant = "grid",
}: {
  seasons: AnilistSeasonEntry[];
  accentColor: string;
  variant?: "grid" | "sidebar";
}) {
  const railRef = useRef<HTMLDivElement>(null);
  if (seasons.length <= 1) return null;
  const compact = variant === "sidebar";

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0f1012] p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-white">
          <Layers3 className="h-4 w-4" style={{ color: accentColor }} aria-hidden="true" />
          Seasons
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] text-white/40">{seasons.length}</span>
        </h2>
        {!compact && seasons.length > 4 ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => railRef.current?.scrollBy({ left: -360, behavior: "smooth" })}
              aria-label="Previous seasons"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => railRef.current?.scrollBy({ left: 360, behavior: "smooth" })}
              aria-label="Next seasons"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={railRef}
        className={compact
          ? "flex flex-wrap gap-2"
          : "hide-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1"
        }
      >
        {seasons.map((entry) => {
          const title = anilistTitle(entry.media);
          const image = entry.media.bannerImage || entry.media.coverImage.extraLarge || entry.media.coverImage.large;
          const itemAccent = entry.media.coverImage.color || accentColor;
          return (
            <Link
              key={entry.media.id}
              href={"/anime/" + encodeAnilistRouteId(entry.media.id) + "/watch"}
              aria-current={entry.isCurrent ? "page" : undefined}
              aria-label={`${title}, ${seasonRelationLabel(entry)}`}
              className={compact
                ? "group relative min-w-[8.75rem] flex-[1_1_calc(50%-0.25rem)] overflow-hidden rounded-xl border bg-white/[0.025]"
                : "group relative aspect-[1.68/1] w-[11.5rem] shrink-0 snap-start overflow-hidden rounded-xl border bg-white/[0.025]"
              }
              style={{ borderColor: entry.isCurrent ? itemAccent + "aa" : "rgba(255,255,255,0.08)" }}
            >
              <div className={compact ? "relative aspect-[1.68/1]" : "absolute inset-0"}>
                <SafeArtwork
                  src={image}
                  accentColor={itemAccent}
                  sizes={compact ? "180px" : "190px"}
                  quality={60}
                  className="object-cover group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/5" />
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <p className="line-clamp-2 text-[11px] font-extrabold leading-4 text-white drop-shadow-lg">{title}</p>
                  <p className="mt-1 text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: itemAccent }}>
                    {seasonRelationLabel(entry)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DiscoveryCard({
  media,
  badge,
  fallbackAccent,
}: {
  media: AnilistMedia;
  badge?: string;
  fallbackAccent: string;
}) {
  const title = anilistTitle(media);
  const rating = anilistRating(media);
  const format = anilistFormat(media);
  const href = "/anime/" + encodeAnilistRouteId(media.id);
  const artwork = media.coverImage.extraLarge || media.coverImage.large;
  const accent = media.coverImage.color || fallbackAccent;

  return (
    <Link
      href={href}
      aria-label={title}
      className="group relative flex min-h-24 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-2 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
    >
      {artwork ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-[0.08] [mask-image:linear-gradient(to_left,black,transparent)]">
          <SafeArtwork src={artwork} accentColor={accent} sizes="260px" quality={55} className="object-cover grayscale" />
        </div>
      ) : null}
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-white/[0.04]">
        <SafeArtwork src={artwork} accentColor={accent} sizes="56px" quality={60} className="object-cover group-hover:scale-105" />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col justify-center px-3 py-1">
        {badge ? (
          <span className="mb-1 text-[9px] font-black uppercase tracking-[0.15em]" style={{ color: accent }}>
            {badge.replaceAll("_", " ")}
          </span>
        ) : null}
        <h3 className="line-clamp-2 text-[13px] font-bold leading-5 text-white/88 transition-colors group-hover:text-white">
          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: accent }} />
          {title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-white/34">
          <span>{format}</span>
          {media.episodes ? <span>{media.episodes} EPS</span> : null}
          {rating ? (
            <span className="inline-flex items-center gap-0.5">
              <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              {rating}
            </span>
          ) : null}
        </div>
      </div>
      <ChevronRight className="relative my-auto h-4 w-4 shrink-0 text-white/15 transition-transform group-hover:translate-x-0.5 group-hover:text-white/40" aria-hidden="true" />
    </Link>
  );
}

function DiscoverySection({
  title,
  children,
  compact,
  accentColor,
}: {
  title: string;
  children: ReactNode;
  compact: boolean;
  accentColor: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0f1012] p-3.5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-white">
        <ChevronRight className="h-4 w-4" style={{ color: accentColor }} aria-hidden="true" />
        {title}
      </h2>
      <div className={compact ? "space-y-2" : "grid gap-2 sm:grid-cols-2"}>{children}</div>
    </section>
  );
}

function DiscoverySkeleton({ compact }: { compact: boolean }) {
  return Array.from({ length: compact ? 3 : 4 }).map((_, index) => (
    <div key={index} className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025]" />
  ));
}

export function WatchRecommendationsPanel({
  seasons,
  related,
  recommendations,
  accentColor,
  variant = "grid",
}: {
  seasons?: AnilistSeasonEntry[] | null;
  related: RelatedAnimeEntry[] | null;
  recommendations: AnilistMedia[] | null;
  accentColor: string;
  variant?: "grid" | "sidebar";
}) {
  const compact = variant === "sidebar";

  return (
    <div className="space-y-4">
      {seasons === null ? (
        <section className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" aria-label="Loading seasons" />
      ) : seasons && seasons.length > 1 ? (
        <WatchSeasonsPanel seasons={seasons} accentColor={accentColor} variant={variant} />
      ) : null}

      {related === null ? (
        <DiscoverySection title="Related" compact={compact} accentColor={accentColor}>
          <DiscoverySkeleton compact={compact} />
        </DiscoverySection>
      ) : related.length > 0 ? (
        <DiscoverySection title="Related" compact={compact} accentColor={accentColor}>
          {related.slice(0, compact ? 4 : 6).map((entry) => (
            <DiscoveryCard
              key={entry.relationType + "-" + entry.media.id}
              media={entry.media}
              badge={entry.relationType}
              fallbackAccent={accentColor}
            />
          ))}
        </DiscoverySection>
      ) : null}

      <DiscoverySection title="Recommendations" compact={compact} accentColor={accentColor}>
        {recommendations === null ? (
          <DiscoverySkeleton compact={compact} />
        ) : recommendations.length > 0 ? (
          recommendations.slice(0, compact ? 8 : 10).map((media) => (
            <DiscoveryCard key={media.id} media={media} fallbackAccent={accentColor} />
          ))
        ) : (
          <p className="px-2 py-5 text-center text-xs text-white/35">No recommendations available yet.</p>
        )}
      </DiscoverySection>
    </div>
  );
}
