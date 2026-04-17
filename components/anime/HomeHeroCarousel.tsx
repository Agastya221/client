"use client";

import type { CatalogAnime } from "@/lib/anime/types";
import { ChevronLeft, ChevronRight, Play, Bookmark } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";

interface HomeHeroCarouselProps {
  slides: CatalogAnime[];
}

export default function HomeHeroCarousel({ slides }: HomeHeroCarouselProps) {
  const deck = slides.slice(0, 10);
  const [activeIndex, setActiveIndex] = useState(0);
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

  if (!activeSlide) return null;

  const heroImage = activeSlide.banner || activeSlide.poster || "https://placehold.co/1600x900/101010/333333?text=AnimeKAI";
  const genres = activeSlide.genres?.slice(0, 3).join(", ") || "Anime";
  const quality = activeSlide.episodeCount ? "HD" : "";
  const rating = activeSlide.rating && activeSlide.rating !== "?" && activeSlide.rating !== "1" ? activeSlide.rating : "";
  const release = activeSlide.year && activeSlide.year !== "?" ? activeSlide.year : "";

  return (
    <section className="relative w-full pt-[64px] min-h-[75vh] flex bg-[#161616]">
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt={activeSlide.title}
          className="w-full h-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#161616] via-[#161616]/90 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 w-full px-4 lg:px-12 xl:px-16 py-12 flex flex-col lg:flex-row gap-8">
        {/* Left Content */}
        <div className="flex-1 flex flex-col justify-center max-w-2xl py-12">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.1] mb-4 text-shadow-hero">
            {activeSlide.title}
          </h1>
          
          <div className="flex items-center gap-3 text-xs font-bold mb-6 text-white/80">
            {activeSlide.subCount && (
              <span className="flex items-center gap-1 bg-[#ff5500]/20 text-[#ff5500] px-2 py-0.5 rounded">
                <span className="w-4 h-4 bg-[#ff5500] text-[#161616] rounded-sm flex items-center justify-center text-[9px] mr-1">CC</span>
                {activeSlide.subCount}
              </span>
            )}
            {activeSlide.dubCount && (
              <span className="flex items-center gap-1 bg-[#52ff7f]/20 text-[#52ff7f] px-2 py-0.5 rounded">
                <span className="w-4 h-4 bg-[#52ff7f] text-[#161616] rounded-sm flex items-center justify-center text-[9px] mr-1">🎤</span>
                {activeSlide.dubCount}
              </span>
            )}
            <span>TV</span>
            <span className="w-1 h-1 bg-white/30 rounded-full" />
            <span>{genres}</span>
          </div>

          <p className="text-sm md:text-base text-white/70 line-clamp-3 mb-8 leading-relaxed max-w-xl">
            {activeSlide.description || "In a world where shadows dictate fate, the elite must fight. An intense new season brings back all your favorite characters..."}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            <Link
              href={`${activeSlide.href}/watch?ep=1&provider=${activeSlide.provider}`}
              className="flex items-center justify-center gap-2 bg-[#ff5500] hover:bg-[#ff6600] text-black font-black uppercase tracking-wider px-8 py-3.5 rounded-lg transition-transform hover:scale-105 active:scale-95"
            >
              Watch Now
            </Link>
            <button className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#0e0f11] border border-white/5 text-white/70 hover:text-white hover:bg-white/5 hover:border-white/10 transition-colors">
              <span className="sr-only">Bookmark</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Right Carousel Controls - absolute bottom right of hero area */}
        <div className="absolute right-6 bottom-12 z-20 flex items-center gap-4 mr-0 lg:mr-[340px]">
          <button onClick={goPrev} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="text-white font-bold tracking-widest text-sm">
            {activeIndex + 1} <span className="text-white/40">/ {deck.length}</span>
          </div>
          <button onClick={goNext} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all">
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </section>
  );
}
