"use client";

import ProviderBadge from "@/components/anime/ProviderBadge";
import type { CatalogAnime } from "@/lib/anime/types";
import { ChevronLeft, ChevronRight, Play, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";

interface HomeHeroCarouselProps {
  slides: CatalogAnime[];
}

export default function HomeHeroCarousel({ slides }: HomeHeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [slides]);

  const rotateForward = useEffectEvent(() => {
    if (slides.length <= 1) return;
    setActiveIndex((current) => (current + 1) % slides.length);
  });

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      rotateForward();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [rotateForward, slides.length]);

  const activeSlide = slides[activeIndex] || null;
  const activeBackdrop =
    activeSlide?.banner ||
    activeSlide?.poster ||
    "https://placehold.co/1600x900/131313/e5e2e1?text=KAIDO";

  if (!activeSlide) {
    return null;
  }

  return (
    <section className="relative overflow-hidden pb-16 pt-24">
      <div className="absolute inset-0">
        <img
          src={activeBackdrop}
          alt={activeSlide.title}
          className="h-full w-full object-cover opacity-35 transition-opacity duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/82 to-surface-container-lowest/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_24rem] lg:items-end">
          <div className="space-y-8 py-16 lg:py-24">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-primary">
                Rotating spotlight
              </span>
              <ProviderBadge provider={activeSlide.provider} active={activeSlide.provider !== "hianime"} />
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-black tracking-tight text-on-surface md:text-7xl">
                {activeSlide.title}
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-on-surface-variant md:text-lg">
                {activeSlide.description ||
                  "Kaido rotates through the hottest trending titles so the homepage always feels alive, just like a real streaming spotlight."}
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                href={`${activeSlide.href}/watch?ep=1&provider=${activeSlide.provider}`}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
              >
                <Play className="h-4 w-4 fill-current" />
                Watch now
              </Link>
              <Link
                href={activeSlide.href}
                className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 px-6 py-3 text-sm font-semibold text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
              >
                <Sparkles className="h-4 w-4" />
                View details
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveIndex((current) => (current - 1 + slides.length) % slides.length)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-low/70 text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
                aria-label="Previous slide"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((current) => (current + 1) % slides.length)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-low/70 text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
                aria-label="Next slide"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="flex flex-wrap gap-2">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`h-2.5 rounded-full transition-all ${
                      index === activeIndex ? "w-10 bg-primary" : "w-2.5 bg-white/35 hover:bg-white/55"
                    }`}
                    aria-label={`Go to ${slide.title}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low/80 p-5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-primary">
              <TrendingUp className="h-4 w-4" />
              <p className="text-[10px] font-bold uppercase tracking-[0.28em]">Trending spotlight</p>
            </div>
            <div className="mt-5 space-y-3">
              {slides.map((anime, index) => {
                const active = index === activeIndex;

                return (
                  <button
                    key={anime.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-colors ${
                      active
                        ? "border-primary/35 bg-primary/10"
                        : "border-outline-variant/20 bg-surface-container hover:border-primary/25"
                    }`}
                  >
                    <div className="w-10 text-right text-xl font-black text-on-surface-variant">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <img
                      src={anime.poster || activeBackdrop}
                      alt={anime.title}
                      className="h-20 w-16 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-on-surface">{anime.title}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {anime.genres.slice(0, 2).join(" • ") || anime.type || "Anime"}
                      </p>
                    </div>
                    <ProviderBadge provider={anime.provider} active={active} subtle={!active} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
