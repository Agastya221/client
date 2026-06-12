"use client";

import { type AnilistMedia, anilistTitle, anilistRating, encodeAnilistRouteId } from "@/lib/anilist/api";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";
import { Play, Bookmark, ChevronLeft, ChevronRight, Star, Calendar, Tv } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";

interface HeroCarouselProps {
  slides: AnilistMedia[];
  watchHrefs?: Record<string, string>;
  availabilityHints?: Record<string, CatalogAvailabilityHint>;
}

export default function AnilistHeroCarousel({ slides, watchHrefs, availabilityHints }: HeroCarouselProps) {
  const deck = slides.slice(0, 10);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goTo = useCallback((index: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveIndex(index);
      setIsTransitioning(false);
    }, 150);
  }, [isTransitioning]);

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

  // Touch swipe support for mobile
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? goNext() : goPrev();
    }
    touchStartX.current = null;
  };

  if (!deck.length) return null;

  const slide = deck[activeIndex];
  const title = anilistTitle(slide);
  const rating = anilistRating(slide);
  const href = `/anime/${encodeAnilistRouteId(slide.id)}`;
  const watchHref = watchHrefs?.[String(slide.id)] || null;
  const availability = availabilityHints?.[String(slide.id)] || null;
  const description = slide.description?.replace(/<[^>]*>/g, "").slice(0, 180) || "";
  const studios = slide.studios.nodes.map((s) => s.name).join(", ");
  const accentColor = slide.coverImage.color || "#ff5500";
  const isAiring = slide.status === "RELEASING";

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
      {/* ── DESKTOP LAYOUT (lg+) ───────────────────────────────────────────── */}
      <div className="hidden lg:block relative h-[92vh] overflow-hidden">
        {/* Background images — full bleed */}
        {deck.map((s, i) => (
          <div
            key={s.id}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === activeIndex ? 1 : 0 }}
          >
            <img
              src={s.bannerImage || s.coverImage.extraLarge}
              alt={anilistTitle(s)}
              className="w-full h-full object-cover object-center"
            />
            {/* Dark vignette on the left so text is readable */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] from-[25%] via-[#0a0b0c]/50 via-[55%] to-transparent" />
            {/* Soft fade at the very bottom into the page */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0b0c] to-transparent" />
          </div>
        ))}

        {/* Content — absolutely centred vertically, offset for navbar */}
        <div
          className="absolute inset-0 flex items-center px-16 xl:px-24 pt-16 pb-20"
          style={{ opacity: isTransitioning ? 0 : 1, transition: "opacity 0.5s ease" }}
        >
          <div className="max-w-xl">
            {/* Badges */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {isAiring && (
                <span className="flex items-center gap-1.5 bg-[#ff5500] text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  NOW AIRING
                </span>
              )}
              {slide.format && (
                <span className="bg-white/10 backdrop-blur text-white/80 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                  <Tv className="w-3 h-3" /> {slide.format}
                </span>
              )}
              {slide.seasonYear && (
                <span className="bg-white/10 backdrop-blur text-white/80 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {slide.seasonYear}
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-1 bg-yellow-400/20 text-yellow-400 text-[10px] font-black px-3 py-1.5 rounded-full">
                  <Star className="w-3 h-3 fill-current" /> {rating}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-tight tracking-tight mb-4 line-clamp-2" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.8)" }}>
              {title}
            </h1>

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

            {/* Description */}
            {description && (
              <p className="text-white/60 text-sm leading-relaxed mb-8 line-clamp-3">{description}</p>
            )}

            {/* CTAs */}
            <div className="flex items-center gap-3">
              {watchHref ? (
                <Link href={watchHref} prefetch
                  className="flex items-center gap-2.5 text-white font-black text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 8px 24px ${accentColor}50` }}>
                  <Play className="w-4 h-4 fill-current" /> WATCH NOW
                </Link>
              ) : (
                <Link href={href}
                  className="flex items-center gap-2.5 text-white font-black text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 8px 24px ${accentColor}50` }}>
                  <Play className="w-4 h-4" /> DETAILS
                </Link>
              )}
              {watchHref && (
                <Link href={href}
                  className="flex items-center gap-2 text-white/80 hover:text-white font-bold text-sm px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/15 transition-all duration-200 backdrop-blur border border-white/10">
                  More Info
                </Link>
              )}
              <button className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/10 transition-all duration-200">
                <Bookmark className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {availability && (
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                {watchHref ? "Mapped on AnimePlay" : availability.message}
              </p>
            )}
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
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: isTransitioning ? 0 : 1 }}
        >
          {/* Background: cover image right side, fading left */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Accent colour wash */}
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${accentColor}18 0%, transparent 60%)` }}
            />
            {/* Cover image anchored to the right */}
            <div className="absolute right-0 top-0 bottom-0 w-2/3">
              <img
                src={slide.coverImage.extraLarge || slide.bannerImage || ""}
                alt={title}
                className="w-full h-full object-cover object-top"
              />
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
                <span className="flex items-center gap-1 bg-[#ff5500] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  NOW AIRING
                </span>
              )}
              {slide.format && (
                <span className="bg-white/10 backdrop-blur text-white/70 text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Tv className="w-2.5 h-2.5" /> {slide.format}
                </span>
              )}
              {slide.seasonYear && (
                <span className="bg-white/10 backdrop-blur text-white/70 text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" /> {slide.seasonYear}
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-0.5 bg-yellow-400/20 text-yellow-400 text-[9px] font-black px-2.5 py-1 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-current" /> {rating}
                </span>
              )}
            </div>

            {/* Title — clamped to 2 lines to prevent layout shift */}
            <h1 className="text-[18px] font-black text-white leading-tight tracking-tight mb-2 max-w-[55%] line-clamp-2">
              {title}
            </h1>

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
                <Link href={watchHref} prefetch
                  className="flex items-center gap-1.5 text-white font-black text-[11px] px-4 py-2.5 rounded-full transition-all duration-200 shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 6px 16px ${accentColor}50` }}>
                  <Play className="w-3.5 h-3.5 fill-current" />WATCH NOW
                </Link>
              ) : (
                <Link href={href}
                  className="flex items-center gap-1.5 text-white font-black text-[11px] px-4 py-2.5 rounded-full transition-all duration-200 shadow-md"
                  style={{ backgroundColor: accentColor, boxShadow: `0 6px 16px ${accentColor}50` }}>
                  <Play className="w-3.5 h-3.5" />DETAILS
                </Link>
              )}
              {watchHref && (
                <Link href={href}
                  className="flex items-center text-white/75 font-bold text-[11px] px-3.5 py-2.5 rounded-full bg-white/10 border border-white/10 backdrop-blur">
                  More Info
                </Link>
              )}
              <button className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                <Bookmark className="w-3.5 h-3.5 text-white/60" />
              </button>
            </div>

            {availability && (
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                {watchHref ? "Mapped on AnimePlay" : availability.message}
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
        <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
      </button>

      <div className="flex items-center gap-1.5">
        {deck.map((_, i) => (
          <button key={i} onClick={() => goTo(i)} className="rounded-full transition-all duration-300"
            style={{
              width: i === activeIndex ? "20px" : "5px",
              height: "5px",
              backgroundColor: i === activeIndex ? accentColor : "rgba(255,255,255,0.3)",
            }} />
        ))}
      </div>

      <button type="button" onClick={goNext} aria-label="Next slide"
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/20 backdrop-blur transition-all focus:outline-none focus:ring-2 focus:ring-[#ff5500]/50">
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
      </button>

      <span className="text-white/40 text-[10px] sm:text-xs font-bold ml-1">
        {activeIndex + 1} / {deck.length}
      </span>
    </>
  );
}
