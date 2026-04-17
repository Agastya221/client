"use client";

import { type AnilistMedia, anilistTitle, anilistRating, encodeAnilistRouteId } from "@/lib/anilist/api";
import { Play, Bookmark, ChevronLeft, ChevronRight, Star, Calendar, Tv } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

interface HeroCarouselProps {
  slides: AnilistMedia[];
}

export default function AnilistHeroCarousel({ slides }: HeroCarouselProps) {
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

  if (!deck.length) return null;

  const slide = deck[activeIndex];
  const title = anilistTitle(slide);
  const rating = anilistRating(slide);
  const href = `/anime/${encodeAnilistRouteId(slide.id)}`;
  const watchHref = `${href}/watch?ep=1&provider=animekai`;
  const banner = slide.bannerImage || slide.coverImage.extraLarge;
  const description = slide.description?.replace(/<[^>]*>/g, "").slice(0, 200) || "";
  const studios = slide.studios.nodes.map((s) => s.name).join(", ");
  const accentColor = slide.coverImage.color || "#ff5500";
  const isAiring = slide.status === "RELEASING";

  return (
    <section className="relative w-full overflow-hidden bg-[#0a0b0c]" style={{ minHeight: "92vh" }}>
      {/* Background image with parallax-like effect */}
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
          {/* Multi-layer gradient for cinematic look */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] via-[#0a0b0c]/80 to-[#0a0b0c]/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0c] via-[#0a0b0c]/30 to-transparent" />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: `radial-gradient(ellipse at 30% 50%, ${s.coverImage.color || "#ff5500"}30 0%, transparent 60%)`,
            }}
          />
        </div>
      ))}

      {/* Navbar spacer */}
      <div className="h-16" />

      {/* Content */}
      <div className="relative z-10 flex h-full items-center px-6 lg:px-16 xl:px-24 py-16">
        <div
          className="max-w-2xl transition-all duration-500"
          style={{ opacity: isTransitioning ? 0 : 1, transform: isTransitioning ? "translateY(8px)" : "translateY(0)" }}
        >
          {/* Badges */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
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
          <h1 className="text-4xl lg:text-6xl font-black text-white leading-none tracking-tight text-shadow-hero mb-4 max-w-xl">
            {title}
          </h1>

          {/* Studios + genres */}
          {(studios || slide.genres.length > 0) && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {studios && (
                <span className="text-white/50 text-xs font-semibold">{studios}</span>
              )}
              {studios && slide.genres.length > 0 && (
                <span className="w-1 h-1 rounded-full bg-white/20" />
              )}
              {slide.genres.slice(0, 3).map((g) => (
                <span
                  key={g}
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: accentColor, background: `${accentColor}25` }}
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {description && (
            <p className="text-white/60 text-sm leading-relaxed mb-8 max-w-lg line-clamp-3">
              {description}
            </p>
          )}

          {/* CTAs */}
          <div className="flex items-center gap-3">
            <Link
              href={watchHref}
              className="flex items-center gap-2.5 text-white font-black text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg shadow-md"
              style={{ backgroundColor: accentColor, boxShadow: `0 8px 24px ${accentColor}50` }}
            >
              <Play className="w-4 h-4 fill-current" />
              WATCH NOW
            </Link>
            <Link
              href={href}
              className="flex items-center gap-2 text-white/80 hover:text-white font-bold text-sm px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/15 transition-all duration-200 backdrop-blur border border-white/10"
            >
              More Info
            </Link>
            <button className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/10 transition-all duration-200">
              <Bookmark className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>
      </div>

      {/* Cover art floating right */}
      <div
        className="absolute right-12 top-1/2 -translate-y-1/2 z-10 hidden xl:block transition-all duration-500"
        style={{ opacity: isTransitioning ? 0 : 1 }}
      >
        <div className="relative">
          <div
            className="absolute -inset-4 rounded-2xl blur-2xl opacity-40"
            style={{ backgroundColor: slide.coverImage.color || "#ff5500" }}
          />
          <img
            src={slide.coverImage.extraLarge}
            alt={title}
            className="relative w-48 rounded-2xl shadow-2xl border border-white/10"
            style={{ aspectRatio: "2/3", objectFit: "cover" }}
          />
        </div>
      </div>

      {/* Navigation controls */}
      <div className="absolute bottom-8 left-6 lg:left-16 xl:left-24 z-20 flex items-center gap-4">
        <button
          onClick={goPrev}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/20 backdrop-blur transition-all"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>

        {/* Dots */}
        <div className="flex items-center gap-1.5">
          {deck.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === activeIndex ? "24px" : "6px",
                height: "6px",
                backgroundColor: i === activeIndex ? (accentColor) : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/20 backdrop-blur transition-all"
        >
          <ChevronRight className="w-4 h-4 text-white" />
        </button>

        <span className="text-white/40 text-xs font-bold ml-2">
          {activeIndex + 1} / {deck.length}
        </span>
      </div>
    </section>
  );
}
