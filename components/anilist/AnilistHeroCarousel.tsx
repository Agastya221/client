"use client";

import { type AnilistMedia, anilistTitle, anilistRating, encodeAnilistRouteId } from "@/lib/anilist/api";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";
import { isBookmarked, saveBookmark, removeBookmark, subscribeToBookmarks } from "@/lib/anime/bookmarks";
import WatchIntentLink from "@/components/anime/WatchIntentLink";
import { Play, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Star, Calendar, Tv } from "lucide-react";
import Link from "next/link";
import { getImageProps } from "next/image";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";

interface HeroCarouselProps {
  slides: AnilistMedia[];
  watchHrefs?: Record<string, string>;
  availabilityHints?: Record<string, CatalogAvailabilityHint>;
}

export default function AnilistHeroCarousel({ slides, watchHrefs, availabilityHints }: HeroCarouselProps) {
  const deck = useMemo(() => slides.slice(0, 10), [slides]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [titleLogos, setTitleLogos] = useState<Record<number, string | null>>({});
  const requestedLogoIdsRef = useRef(new Set<number>());

  const goTo = useCallback((index: number) => {
    if (deck.length === 0) return;
    setActiveIndex((index + deck.length) % deck.length);
  }, [deck.length]);

  const goPrev = useCallback(() => {
    if (deck.length <= 1) return;
    goTo((activeIndex - 1 + deck.length) % deck.length);
  }, [activeIndex, deck.length, goTo]);

  const goNext = useCallback(() => {
    if (deck.length <= 1) return;
    goTo((activeIndex + 1) % deck.length);
  }, [activeIndex, deck.length, goTo]);

  useEffect(() => {
    if (deck.length <= 1) return;
    const timer = setInterval(goNext, 7000);
    return () => clearInterval(timer);
  }, [goNext, deck.length]);

  useEffect(() => {
    if (deck.length === 0) return;
    const ids = [
      deck[activeIndex]?.id,
      deck[(activeIndex + 1) % deck.length]?.id,
    ].filter((id): id is number => Boolean(id));

    for (const id of ids) {
      if (requestedLogoIdsRef.current.has(id)) continue;
      requestedLogoIdsRef.current.add(id);
      void fetch(`/api/anilist/title-logo?id=${id}`)
        .then((response) => response.ok ? response.json() as Promise<{ logo?: string | null }> : null)
        .then((payload) => {
          setTitleLogos((current) => ({ ...current, [id]: payload?.logo || null }));
        })
        .catch(() => {
          setTitleLogos((current) => ({ ...current, [id]: null }));
        });
    }

  }, [activeIndex, deck]);

  // Touch swipe support for mobile
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  const slide = deck[activeIndex] || null;
  const animeId = slide ? `anilist~${slide.id}` : "";

  useEffect(() => {
    if (!animeId) return;
    const sync = () => setBookmarked(isBookmarked(animeId));
    sync();
    return subscribeToBookmarks(sync);
  }, [animeId]);

  if (!slide) return null;

  const title = anilistTitle(slide);
  const rating = anilistRating(slide);
  const href = `/anime/${encodeAnilistRouteId(slide.id)}`;
  const watchHref = watchHrefs?.[String(slide.id)] || null;
  const availability = availabilityHints?.[String(slide.id)] || null;
  const description = slide.description?.replace(/<[^>]*>/g, "").slice(0, 180) || "";
  const studios = slide.studios.nodes.map((s) => s.name).join(", ");
  const accentColor = slide.coverImage.color || "#ff5500";
  const isAiring = slide.status === "RELEASING";
  const titleLogo = titleLogos[slide.id] || null;
  const desktopBackdrop = getImageProps({
    src: slide.bannerImage || slide.coverImage.extraLarge,
    alt: title,
    fill: true,
    priority: true,
    quality: 70,
    sizes: "100vw",
  }).props;
  const mobileBackdrop = getImageProps({
    src: slide.coverImage.extraLarge || slide.bannerImage || "",
    alt: title,
    fill: true,
    priority: true,
    quality: 65,
    sizes: "67vw",
  }).props;
  const watchEpisode = slide.status === "RELEASING" && slide.nextAiringEpisode
    ? Math.max(1, slide.nextAiringEpisode.episode - 1)
    : 1;

  const toggleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (bookmarked) {
      removeBookmark(animeId);
    } else {
      saveBookmark({
        animeId,
        title,
        poster: slide.coverImage.large || slide.coverImage.extraLarge || null,
        href,
      });
    }
  };

  return (
    <section
      className="relative w-full overflow-hidden bg-[#0a0b0c]"
      aria-label="Featured anime carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") goPrev();
        if (e.key === "ArrowRight") goNext();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div key={`backdrop-${slide.id}`} className="absolute inset-y-0 right-0 z-0 w-2/3 overflow-hidden lg:inset-0 lg:w-full">
        <picture>
          <source media="(max-width: 1023px)" srcSet={mobileBackdrop.srcSet} sizes={mobileBackdrop.sizes} />
          <source media="(min-width: 1024px)" srcSet={desktopBackdrop.srcSet} sizes={desktopBackdrop.sizes} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...desktopBackdrop}
            alt={title}
            className="object-cover object-top lg:object-center"
          />
        </picture>
      </div>

      {/* ── DESKTOP LAYOUT (lg+) ───────────────────────────────────────────── */}
      <div className="hidden lg:block relative h-[92vh] overflow-hidden">
        {/* Only the active responsive backdrop is mounted. */}
        <div key={slide.id} className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] from-[25%] via-[#0a0b0c]/50 via-[55%] to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0b0c] to-transparent" />
        </div>

        {/* Content — absolutely centred vertically, offset for navbar */}
        <div className="absolute inset-0 flex items-center px-16 xl:px-24 pt-16 pb-20">
          <div className="max-w-xl">
            {/* Badges */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {isAiring && (
                <span className="flex items-center gap-1.5 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: accentColor }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  NOW AIRING
                </span>
              )}
              {slide.format && (
                <span className="bg-white/10 backdrop-blur text-white/80 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                  <Tv className="w-3 h-3" aria-hidden="true" /> {slide.format}
                </span>
              )}
              {slide.seasonYear && (
                <span className="bg-white/10 backdrop-blur text-white/80 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                  <Calendar className="w-3 h-3" aria-hidden="true" /> {slide.seasonYear}
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-1 bg-yellow-400/20 text-yellow-400 text-[10px] font-black px-3 py-1.5 rounded-full">
                  <Star className="w-3 h-3 fill-current" aria-hidden="true" /> {rating}
                </span>
              )}
            </div>

            <div className="mb-4 flex h-32 max-w-[34rem] items-end">
              {titleLogo ? (
                <img
                  src={titleLogo}
                  alt={title}
                  className="max-h-32 max-w-full object-contain object-left-bottom drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]"
                  decoding="async"
                  onError={() => setTitleLogos((current) => ({ ...current, [slide.id]: null }))}
                />
              ) : (
                <h1 className="text-5xl xl:text-6xl font-black text-white leading-tight" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.8)" }}>
                  {title}
                </h1>
              )}
            </div>

            {/* Studio + genres */}
            {(studios || slide.genres.length > 0) && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {studios && <span className="text-white/50 text-xs font-semibold">{studios}</span>}
                {studios && slide.genres.length > 0 && <span className="w-1 h-1 rounded-full bg-white/20" />}
                {slide.genres.slice(0, 3).map((g) => (
                  <span key={g} className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: accentColor, background: `${accentColor}25` }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Description — more lines on desktop */}
            {description && (
              <p className="text-white/60 text-sm leading-relaxed mb-8 line-clamp-4">{description}</p>
            )}

            {/* CTAs */}
            <div className="flex items-center gap-3">
              {watchHref ? (
                <WatchIntentLink
                  href={watchHref}
                  animeId={animeId}
                  episodeNumber={watchEpisode}
                  className="flex items-center gap-2.5 text-white font-black text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 8px 24px ${accentColor}50` }}>
                  <Play className="w-4 h-4 fill-current" aria-hidden="true" /> WATCH NOW
                </WatchIntentLink>
              ) : (
                <Link href={href}
                  className="flex items-center gap-2.5 text-white font-black text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 8px 24px ${accentColor}50` }}>
                  <Play className="w-4 h-4" aria-hidden="true" /> DETAILS
                </Link>
              )}
              {watchHref && (
                <Link href={href}
                  className="flex items-center gap-2 text-white/80 hover:text-white font-bold text-sm px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/15 transition-all duration-200 backdrop-blur border border-white/10">
                  More Info
                </Link>
              )}
              <button
                type="button"
                onClick={toggleBookmark}
                className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-200 ${
                  bookmarked
                    ? "border-yellow-400/50 bg-yellow-400/15 hover:bg-yellow-400/25"
                    : "bg-white/10 hover:bg-white/20 border-white/10"
                }`}
                title={bookmarked ? "Remove from my list" : "Add to my list"}
                aria-label={bookmarked ? "Remove from my list" : "Add to my list"}
              >
                {bookmarked
                  ? <BookmarkCheck className="w-4 h-4 text-yellow-400 fill-yellow-400" aria-hidden="true" />
                  : <Bookmark className="w-4 h-4 text-white/70" aria-hidden="true" />
                }
              </button>
            </div>


          </div>
        </div>

        {/* Nav controls pinned to bottom-left */}
        <div className="absolute bottom-8 left-16 xl:left-24 z-20 flex items-center gap-4">
          <NavButtons goPrev={goPrev} goNext={goNext} deck={deck} activeIndex={activeIndex} goTo={goTo} accentColor={accentColor} />
        </div>
      </div>

      {/* ── MOBILE LAYOUT (< lg) ──────────────────────────────────────────── */}
      {/*
        Mobile uses a completely different design:
        - Poster image on the RIGHT (taller crop, portrait aspect) with gradient fade left
        - Text content on the LEFT overlaid on a dark background
        - No wasted empty space — height fits the content
      */}
      {/* Fixed height prevents layout shift when slides have different content lengths */}
      <div className="lg:hidden relative h-[400px] overflow-hidden">
        {/* Navbar spacer — absolutely positioned so it doesn't add to flow height */}
        <div className="absolute top-0 left-0 right-0 h-16 z-10" />

        {/* Slide container — fills the fixed height */}
        <div className="absolute inset-0">
          {/* Background: cover image right side, fading left */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Accent colour wash */}
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${accentColor}18 0%, transparent 60%)` }}
            />
            {/* Cover image anchored to the right */}
            <div className="absolute right-0 top-0 bottom-0 w-2/3">
              {/* Fade to the left */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] via-[#0a0b0c]/60 to-transparent" />
            </div>
            {/* Strong bottom-to-top fade for nav bar area */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0c] via-transparent to-transparent" />
            {/* Left coverage */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] to-transparent w-1/2" />
          </div>

          {/* Content — positioned from top with navbar offset */}
          <div className="relative z-10 px-4 pt-20 pb-12">
            {/* Badges row */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              {isAiring && (
                <span className="flex items-center gap-1 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider" style={{ backgroundColor: accentColor }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  NOW AIRING
                </span>
              )}
              {slide.format && (
                <span className="bg-white/10 backdrop-blur text-white/70 text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Tv className="w-2.5 h-2.5" aria-hidden="true" /> {slide.format}
                </span>
              )}
              {slide.seasonYear && (
                <span className="bg-white/10 backdrop-blur text-white/70 text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" aria-hidden="true" /> {slide.seasonYear}
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-0.5 bg-yellow-400/20 text-yellow-400 text-[9px] font-black px-2.5 py-1 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-current" aria-hidden="true" /> {rating}
                </span>
              )}
            </div>

            <div className="mb-2 flex h-16 max-w-[55%] items-end">
              {titleLogo ? (
                <img
                  src={titleLogo}
                  alt={title}
                  className="max-h-16 max-w-full object-contain object-left-bottom drop-shadow-[0_5px_14px_rgba(0,0,0,0.85)]"
                  decoding="async"
                  onError={() => setTitleLogos((current) => ({ ...current, [slide.id]: null }))}
                />
              ) : (
                <h1 className="text-[18px] font-black text-white leading-tight max-w-full line-clamp-2">
                  {title}
                </h1>
              )}
            </div>

            {/* Studio + genres */}
            {(studios || slide.genres.length > 0) && (
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {studios && <span className="text-white/40 text-[10px] font-semibold">{studios}</span>}
                {studios && slide.genres.length > 0 && <span className="w-1 h-1 rounded-full bg-white/20" />}
                {slide.genres.slice(0, 3).map((g) => (
                  <span key={g} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ color: accentColor, background: `${accentColor}25` }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Description — only 2 lines on mobile */}
            {description && (
              <p className="text-white/55 text-[11px] leading-relaxed mb-4 max-w-[60%] line-clamp-2">
                {description}
              </p>
            )}

            {/* CTA buttons */}
            <div className="flex items-center gap-2">
              {watchHref ? (
                <WatchIntentLink
                  href={watchHref}
                  animeId={animeId}
                  episodeNumber={watchEpisode}
                  className="flex items-center gap-1.5 text-white font-black text-[11px] px-4 py-2.5 rounded-full transition-all duration-200 shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 6px 16px ${accentColor}50` }}>
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />WATCH NOW
                </WatchIntentLink>
              ) : (
                <Link href={href}
                  className="flex items-center gap-1.5 text-white font-black text-[11px] px-4 py-2.5 rounded-full transition-all duration-200 shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 6px 16px ${accentColor}50` }}>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />DETAILS
                </Link>
              )}
              {watchHref && (
                <Link href={href}
                  className="flex items-center text-white/75 font-bold text-[11px] px-3.5 py-2.5 rounded-full bg-white/10 border border-white/10 backdrop-blur">
                  More Info
                </Link>
              )}
              <button
                type="button"
                onClick={toggleBookmark}
                className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                  bookmarked
                    ? "border-yellow-400/50 bg-yellow-400/15"
                    : "bg-white/10 border-white/10"
                }`}
                title={bookmarked ? "Remove from my list" : "Add to my list"}
                aria-label={bookmarked ? "Remove from my list" : "Add to my list"}
              >
                {bookmarked
                  ? <BookmarkCheck className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" aria-hidden="true" />
                  : <Bookmark className="w-3.5 h-3.5 text-white/60" aria-hidden="true" />
                }
              </button>
            </div>

            {availability && !watchHref && (
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                {availability.message}
              </p>
            )}
          </div>
        </div>

        {/* Mobile: navigation controls — overlaid at the bottom */}
        <div className="absolute bottom-3 left-4 z-20 flex items-center gap-3">
          <NavButtons goPrev={goPrev} goNext={goNext} deck={deck} activeIndex={activeIndex} goTo={goTo} accentColor={accentColor} />
        </div>
      </div>
    </section>
  );
}

/* ── Shared nav buttons ───────────────────────────────────────────────── */
function NavButtons({
  goPrev, goNext, deck, activeIndex, goTo, accentColor,
}: {
  goPrev: () => void;
  goNext: () => void;
  deck: AnilistMedia[];
  activeIndex: number;
  goTo: (i: number) => void;
  accentColor: string;
}) {
  return (
    <>
      <button type="button" onClick={goPrev} aria-label="Previous slide"
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/20 backdrop-blur transition-all focus:outline-none focus:ring-2 focus:ring-[#ff5500]/50">
        <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-1.5">
        {deck.map((_, i) => (
          <button key={i} onClick={() => goTo(i)} aria-label={`Go to slide ${i + 1}`} className="rounded-full transition-all duration-300"
            style={{
              width: i === activeIndex ? "20px" : "5px",
              height: "5px",
              backgroundColor: i === activeIndex ? accentColor : "rgba(255,255,255,0.3)",
            }} />
        ))}
      </div>

      <button type="button" onClick={goNext} aria-label="Next slide"
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/20 backdrop-blur transition-all focus:outline-none focus:ring-2 focus:ring-[#ff5500]/50">
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" aria-hidden="true" />
      </button>

      <span className="text-white/40 text-[10px] sm:text-xs font-bold ml-1">
        {activeIndex + 1} / {deck.length}
      </span>
    </>
  );
}
