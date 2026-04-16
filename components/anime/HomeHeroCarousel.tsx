"use client";

import ProviderBadge from "@/components/anime/ProviderBadge";
import type { CatalogAnime } from "@/lib/anime/types";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Play,
  Sparkles,
  Tv2,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";

interface HomeHeroCarouselProps {
  slides: CatalogAnime[];
}

export default function HomeHeroCarousel({ slides }: HomeHeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex] || null;

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
    }, 5500);

    return () => window.clearInterval(timer);
  }, [rotateForward, slides.length]);

  if (!activeSlide) {
    return null;
  }

  const activeBackdrop =
    activeSlide.banner ||
    activeSlide.poster ||
    "https://placehold.co/1600x900/131313/e5e2e1?text=KAIDO";
  const activePoster =
    activeSlide.poster ||
    activeSlide.banner ||
    "https://placehold.co/600x900/201f1f/e5e2e1?text=KAIDO";
  const progressWidth = `${((activeIndex + 1) / slides.length) * 100}%`;
  const infoPoints = [
    activeSlide.type ? { label: activeSlide.type, icon: Clapperboard } : null,
    activeSlide.year ? { label: activeSlide.year, icon: CalendarDays } : null,
    activeSlide.episodeCount ? { label: `${activeSlide.episodeCount} EPS`, icon: Tv2 } : null,
  ].filter(Boolean) as Array<{ label: string; icon: typeof Clapperboard }>;

  return (
    <section className="relative px-4 pb-12 pt-24 sm:px-6">
      <div className="mx-auto max-w-[92rem]">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-surface-container-low shadow-[0_40px_140px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0">
            <img
              src={activeBackdrop}
              alt={activeSlide.title}
              className="h-full w-full object-cover object-right-center opacity-70 transition-opacity duration-700"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_24%,rgba(105,244,141,0.16),transparent_18%),radial-gradient(circle_at_48%_20%,rgba(255,255,255,0.08),transparent_16%),linear-gradient(90deg,rgba(8,11,15,0.94)_0%,rgba(8,11,15,0.86)_34%,rgba(8,11,15,0.42)_58%,rgba(8,11,15,0.86)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,11,15,0.18),rgba(8,11,15,0.72))]" />
          </div>

          <div className="relative grid min-h-[44rem] lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex flex-col justify-between px-6 pb-8 pt-8 sm:px-8 lg:px-12 lg:pb-10 lg:pt-10">
              <div className="max-w-3xl space-y-7">
                <div className="space-y-4">
                  <p className="text-lg font-semibold tracking-tight text-[#69f48d]">
                    #{String(activeIndex + 1).padStart(2, "0")} Spotlight
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <ProviderBadge provider={activeSlide.provider} active={activeSlide.provider !== "hianime"} />
                    {activeSlide.status ? (
                      <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/75">
                        {activeSlide.status}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-5">
                  <h1 className="max-w-4xl text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
                    {activeSlide.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-white/78">
                    {infoPoints.map((item) => (
                      <span key={item.label} className="inline-flex items-center gap-2">
                        <item.icon className="h-4 w-4 text-[#69f48d]" />
                        {item.label}
                      </span>
                    ))}
                    {activeSlide.subCount ? (
                      <span className="rounded-md bg-[#69f48d]/18 px-2 py-1 text-xs font-bold text-[#8dffab]">
                        SUB {activeSlide.subCount}
                      </span>
                    ) : null}
                    {activeSlide.dubCount ? (
                      <span className="rounded-md bg-white/12 px-2 py-1 text-xs font-bold text-white/84">
                        DUB {activeSlide.dubCount}
                      </span>
                    ) : null}
                  </div>

                  <p className="max-w-2xl text-sm leading-8 text-white/76 sm:text-base">
                    {activeSlide.description ||
                      "A rotating spotlight banner built for fast discovery, cleaner metadata, and a homepage that feels alive the moment it loads."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`${activeSlide.href}/watch?ep=1&provider=${activeSlide.provider}`}
                    className="inline-flex items-center gap-2 rounded-full bg-[#69f48d] px-6 py-3 text-sm font-bold text-[#041a0c] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Watch now
                  </Link>
                  <Link
                    href={activeSlide.href}
                    className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[#69f48d]/35 hover:text-[#69f48d]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Detail
                  </Link>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeSlide.genres.slice(0, 5).map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-white/10 bg-black/22 px-3 py-1.5 text-xs font-medium text-white/74 backdrop-blur-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-5 lg:mt-10 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveIndex((current) => (current - 1 + slides.length) % slides.length)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white transition-colors hover:border-[#69f48d]/35 hover:text-[#69f48d]"
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveIndex((current) => (current + 1) % slides.length)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white transition-colors hover:border-[#69f48d]/35 hover:text-[#69f48d]"
                    aria-label="Next slide"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>

                  <div className="min-w-[13rem]">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.24em] text-white/48">
                      <span>Spotlight reel</span>
                      <span>
                        {String(activeIndex + 1).padStart(2, "0")}/{String(slides.length).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#69f48d] transition-[width] duration-500"
                        style={{ width: progressWidth }}
                      />
                    </div>
                  </div>
                </div>

                <div className="hidden max-w-xs items-center gap-4 rounded-[1.5rem] border border-white/10 bg-black/22 p-3 backdrop-blur-md md:flex">
                  <img
                    src={activePoster}
                    alt={activeSlide.title}
                    className="h-20 w-14 rounded-[1rem] object-cover"
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/45">Live banner</p>
                    <p className="mt-2 truncate text-sm font-semibold text-white">{activeSlide.title}</p>
                    <p className="mt-1 text-xs text-white/58">
                      {activeSlide.genres.slice(0, 2).join(" • ") || "Discover the next stream-ready title"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="border-t border-white/10 bg-[linear-gradient(180deg,rgba(9,12,16,0.25),rgba(9,12,16,0.72))] backdrop-blur-xl lg:border-l lg:border-t-0">
              <div className="flex h-full flex-col p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[#69f48d]">
                  <WandSparkles className="h-4 w-4" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em]">Trending Spotlight</p>
                </div>

                <div className="hide-scrollbar mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
                  {slides.map((anime, index) => {
                    const active = index === activeIndex;

                    return (
                      <button
                        key={anime.id}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={`flex w-full items-center gap-4 rounded-[1.5rem] border p-3 text-left transition-all duration-200 ${
                          active
                            ? "border-[#69f48d]/30 bg-[#69f48d]/10 shadow-[0_16px_45px_rgba(105,244,141,0.14)]"
                            : "border-white/8 bg-white/[0.04] hover:border-[#69f48d]/20"
                        }`}
                      >
                        <div className="w-10 text-center text-2xl font-black text-white/72">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <img
                          src={anime.poster || anime.banner || activePoster}
                          alt={anime.title}
                          className="h-20 w-14 rounded-[1rem] object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{anime.title}</p>
                          <p className="mt-1 truncate text-xs text-white/55">
                            {anime.genres.slice(0, 2).join(" • ") || anime.type || "Anime"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
