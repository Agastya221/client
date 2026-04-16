"use client";

import type { CatalogAnime } from "@/lib/anime/types";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Play,
  Tv2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";

interface HomeHeroCarouselProps {
  slides: CatalogAnime[];
}

export default function HomeHeroCarousel({ slides }: HomeHeroCarouselProps) {
  const deck = slides.slice(0, 8);
  const [activeIndex, setActiveIndex] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const activeSlide = deck[activeIndex] || null;

  useEffect(() => {
    setActiveIndex(0);
  }, [slides]);

  const goPrev = useEffectEvent(() => {
    if (deck.length <= 1) return;
    setActiveIndex((current) => (current - 1 + deck.length) % deck.length);
  });

  const goNext = useEffectEvent(() => {
    if (deck.length <= 1) return;
    setActiveIndex((current) => (current + 1) % deck.length);
  });

  useEffect(() => {
    if (deck.length <= 1) return;
    const timer = window.setInterval(() => {
      goNext();
    }, 6000);

    return () => window.clearInterval(timer);
  }, [deck.length, goNext]);

  useEffect(() => {
    const container = railRef.current;
    const card = container?.querySelector<HTMLElement>(`[data-slide-index="${activeIndex}"]`);
    if (!container || !card) return;

    const cardLeft = card.offsetLeft;
    const cardWidth = card.offsetWidth;
    const nextScrollLeft = cardLeft - container.clientWidth / 2 + cardWidth / 2;
    container.scrollTo({ left: Math.max(0, nextScrollLeft), behavior: "smooth" });
  }, [activeIndex]);

  if (!activeSlide) {
    return null;
  }

  const heroImage =
    activeSlide.banner ||
    activeSlide.poster ||
    "https://placehold.co/1600x900/493f79/f5f5f5?text=KAIDO";
  const metaItems = [
    activeSlide.type ? { label: activeSlide.type, icon: Tv2 } : null,
    activeSlide.status ? { label: activeSlide.status, icon: Clock3 } : null,
    activeSlide.year ? { label: activeSlide.year, icon: CalendarDays } : null,
  ].filter(Boolean) as Array<{ label: string; icon: typeof Tv2 }>;

  return (
    <section className="px-4 pb-12 pt-24 sm:px-6">
      <div className="mx-auto max-w-[92rem] overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#433b73] shadow-[0_32px_120px_rgba(0,0,0,0.34)]">
        <div className="relative min-h-[31rem] overflow-hidden px-6 pb-8 pt-10 sm:px-10 lg:min-h-[33rem] lg:px-12 lg:pb-10">
          <div className="absolute inset-0">
            <img
              src={heroImage}
              alt={activeSlide.title}
              className="absolute right-0 top-0 h-full w-full object-cover object-right-center opacity-88"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_20%,rgba(210,245,255,0.28),transparent_12%),linear-gradient(90deg,rgba(67,59,115,0.98)_0%,rgba(67,59,115,0.94)_36%,rgba(67,59,115,0.58)_56%,rgba(67,59,115,0.88)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(67,59,115,0.10)_0%,rgba(67,59,115,0.74)_100%)]" />
          </div>

          <div className="relative z-10 flex min-h-[26rem] max-w-[42rem] flex-col justify-center">
            <p className="text-[2rem] font-semibold tracking-tight text-[#52ff7f] sm:text-[2.1rem]">
              #{String(activeIndex + 1).padStart(2, "0")} Spotlight
            </p>

            <div className="mt-4 inline-flex w-fit rounded-full border border-white/12 bg-[#514887]/78 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {activeSlide.provider.toUpperCase()}
            </div>

            <h1 className="mt-8 text-5xl font-black leading-[0.98] tracking-tight text-white sm:text-7xl">
              {activeSlide.title}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium text-white">
              {metaItems.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
              ))}
              {activeSlide.episodeCount ? (
                <span className="rounded-md bg-[#fefefe] px-2 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#1f1c2b]">
                  HD
                </span>
              ) : null}
              {activeSlide.subCount ? (
                <span className="rounded-md bg-[#b7ff55] px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#1b200d]">
                  cc {activeSlide.subCount}
                </span>
              ) : null}
            </div>

            <p className="mt-6 max-w-[42rem] text-lg leading-9 text-white/90">
              {activeSlide.description ||
                "A rotating spotlight banner built for fast discovery, cleaner metadata, and a homepage that feels alive the moment it loads."}
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href={`${activeSlide.href}/watch?ep=1&provider=${activeSlide.provider}`}
                className="inline-flex items-center gap-3 rounded-full bg-[#52ff7f] px-7 py-3.5 text-lg font-semibold text-[#11131a] transition-transform duration-200 hover:-translate-y-0.5"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#11131a] text-[#52ff7f]">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                Watch Now
              </Link>
              <Link
                href={activeSlide.href}
                className="inline-flex items-center gap-3 rounded-full border border-white/14 bg-[#5a5191]/62 px-7 py-3.5 text-lg font-medium text-white transition-colors hover:bg-[#675da3]/75"
              >
                Detail
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="absolute right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 md:flex">
            <button
              type="button"
              onClick={goNext}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#6d61b3] text-white transition-colors hover:bg-[#7b70c2]"
              aria-label="Next spotlight"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#6d61b3] text-white transition-colors hover:bg-[#7b70c2]"
              aria-label="Previous spotlight"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="border-t border-white/8 px-6 pb-8 pt-7 sm:px-10 lg:px-12">
          <h2 className="text-[2rem] font-semibold tracking-tight text-[#52ff7f]">Trending</h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_3rem]">
            <div
              ref={railRef}
              className="hide-scrollbar flex gap-4 overflow-x-auto scroll-smooth pb-1"
            >
              {deck.map((anime, index) => (
                <button
                  key={anime.id}
                  type="button"
                  data-slide-index={index}
                  onClick={() => setActiveIndex(index)}
                  className="group min-w-[11.1rem] text-left"
                >
                  <div className="relative overflow-hidden rounded-tl-[1.15rem] rounded-tr-[0.4rem] rounded-br-[0.4rem] rounded-bl-[0.4rem] bg-[#4c447f]">
                    <div className="relative aspect-[0.72] overflow-hidden">
                      <img
                        src={anime.poster || anime.banner || heroImage}
                        alt={anime.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(41,34,72,0.10),rgba(41,34,72,0.86))]" />

                      <div className="absolute left-0 top-0 flex h-full w-9 items-center justify-center bg-[#5a5192]/92">
                        <span className="[writing-mode:vertical-rl] rotate-180 text-sm font-medium leading-none tracking-[0.04em] text-white">
                          {anime.title}
                        </span>
                      </div>

                      <div className="absolute bottom-1 left-4 text-[2.2rem] font-black leading-none text-[#52ff7f]">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="hidden flex-col gap-3 lg:flex">
              <button
                type="button"
                onClick={goNext}
                className="inline-flex h-[6.9rem] w-12 items-center justify-center rounded-2xl bg-[#6257a6] text-white transition-colors hover:bg-[#6f64b8]"
                aria-label="Scroll trending forward"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={goPrev}
                className="inline-flex h-[6.9rem] w-12 items-center justify-center rounded-2xl bg-[#6257a6] text-white transition-colors hover:bg-[#6f64b8]"
                aria-label="Scroll trending backward"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
