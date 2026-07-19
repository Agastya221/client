"use client";

import type { WatchSessionModel } from "@/lib/anime/types";
import {
  anilistFormat,
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
import { useRef, type CSSProperties, type ReactNode } from "react";
import ExpandableSynopsis from "@/components/anime/ExpandableSynopsis";

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
  unoptimized = false,
}: {
  src?: string | null;
  accentColor: string;
  sizes: string;
  quality?: 45 | 55 | 60 | 65 | 70 | 75 | 90;
  className?: string;
  unoptimized?: boolean;
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
          unoptimized={unoptimized}
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

        <div className="relative grid grid-cols-[112px_minmax(0,1fr)] gap-4 p-3 sm:grid-cols-[156px_minmax(0,1fr)] sm:gap-5 sm:p-5">
          <div className="w-full sm:w-[156px]">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-[0_20px_50px_rgba(0,0,0,0.48)]">
              <SafeArtwork src={poster} accentColor={accentColor} sizes="156px" quality={70} />
            </div>

            <div className="mt-2.5 hidden grid-cols-2 gap-2 sm:grid">
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
                  <h2 className="text-xl font-black leading-tight text-white transition-opacity group-hover:opacity-80 sm:text-[1.7rem]">
                    {session.anime.title}
                  </h2>
                </Link>
                {session.anime.subtitle ? (
                  <p className="mt-1 line-clamp-2 text-xs italic text-white/38 sm:text-sm">{session.anime.subtitle}</p>
                ) : null}
              </div>
              {score ? (
                <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-bold text-white/78 sm:inline-flex">
                  <Star className="h-3.5 w-3.5 fill-current" style={{ color: accentColor }} aria-hidden="true" />
                  {score}
                </span>
              ) : null}
            </div>

            {genres.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                {genres.map((genre) => (
                  <Link
                    key={genre}
                    href={"/search?genre=" + encodeURIComponent(genre)}
                    className="rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide transition-opacity hover:opacity-75 sm:px-3 sm:uppercase"
                    style={{ color: accentColor, borderColor: accentColor + "45", backgroundColor: accentColor + "16" }}
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            ) : null}

            <dl className="mt-4 space-y-2 sm:hidden">
              {facts.slice(0, 4).map(({ label, value }) => (
                <div key={label} className="flex min-w-0 items-baseline gap-1.5 text-xs">
                  <dt className="text-white/38">{label}:</dt>
                  <dd className="truncate font-bold text-white/82" title={value}>{value}</dd>
                </div>
              ))}
            </dl>

            {synopsis ? (
              <div className="mt-4 hidden rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3 sm:block animate-modal-in">
                <ExpandableSynopsis text={synopsis} accentColor={accentColor} />
              </div>
            ) : null}

            <dl className="mt-4 hidden gap-x-8 gap-y-3 border-y border-white/[0.07] py-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
              {facts.map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex min-w-0 items-center gap-2 text-xs">
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} aria-hidden="true" />
                  <dt className="text-white/35">{label}</dt>
                  <dd className="truncate font-semibold text-white/80" title={value}>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 hidden flex-wrap items-center gap-2 sm:flex">
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
                  quality={90}
                  unoptimized
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
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
  fallbackAccent,
}: {
  media: AnilistMedia;
  fallbackAccent: string;
}) {
  const title = anilistTitle(media);
  const rating = media.averageScore || media.meanScore;
  const format = anilistFormat(media);
  const href = "/anime/" + encodeAnilistRouteId(media.id);
  const artwork = media.coverImage.extraLarge || media.coverImage.large;
  const backgroundArtwork = media.bannerImage || artwork;
  const accent = media.coverImage.color || fallbackAccent;

  return (
    <Link
      href={href}
      aria-label={title}
      className="group relative flex h-24 overflow-hidden rounded-lg bg-[#151618] transition-colors duration-300 hover:bg-[#191a1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--card-accent)]"
      style={{ "--card-accent": accent } as CSSProperties}
    >
      {backgroundArtwork ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[78%] opacity-[0.2] [mask-image:linear-gradient(to_left,black_52%,transparent_100%)] transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.025] group-hover:opacity-[0.32]">
          <SafeArtwork
            src={backgroundArtwork}
            accentColor={accent}
            sizes="320px"
            quality={75}
            className="object-cover saturate-0 transition-[opacity,transform,filter] duration-500 group-hover:saturate-[0.35]"
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#151618] via-[#151618]/90 to-transparent" />
      <div className="relative h-full w-[68px] shrink-0 overflow-hidden rounded-lg bg-white/[0.04]">
        <SafeArtwork src={artwork} accentColor={accent} sizes="136px" quality={75} className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]" />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col justify-center px-3 py-2 transition-transform duration-300 ease-out group-hover:translate-x-1">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-[18px] text-white/90 transition-colors duration-300 group-hover:text-[var(--card-accent)]">
          <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: accent }} />
          {title}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-white/38">
          <span className="rounded bg-black/25 px-1.5 py-0.5">{format}</span>
          {media.episodes ? (
            <span className="inline-flex items-center gap-1 rounded bg-black/25 px-1.5 py-0.5">
              <span className="rounded-[2px] bg-white/20 px-0.5 text-[7px] font-black leading-[10px] text-white/55">CC</span>
              {media.episodes}
            </span>
          ) : null}
          {rating ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-black/25 px-1.5 py-0.5">
              <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              {rating}
            </span>
          ) : null}
        </div>
      </div>
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
    <section className="rounded-xl border border-white/10 bg-[#0f1012] p-3">
      <h2 className="mb-3 flex items-center gap-2 text-base font-black uppercase tracking-[0.04em] text-white">
        <ChevronRight className="h-4 w-4" style={{ color: accentColor }} aria-hidden="true" />
        {title}
      </h2>
      <div className={compact ? "space-y-2" : "grid gap-2 sm:grid-cols-2"}>{children}</div>
    </section>
  );
}

function DiscoverySkeleton({ compact }: { compact: boolean }) {
  return Array.from({ length: compact ? 3 : 4 }).map((_, index) => (
    <div key={index} className="h-24 animate-pulse rounded-lg bg-white/[0.025]" />
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
