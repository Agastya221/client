"use client";

import { type AnilistMedia, anilistTitle, anilistRating, encodeAnilistRouteId } from "@/lib/anilist/api";
import type { AnilistHeroAssets } from "@/lib/anilist/hero-assets";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";
import { isBookmarked, saveBookmark, removeBookmark, subscribeToBookmarks } from "@/lib/anime/bookmarks";
import WatchIntentLink from "@/components/anime/WatchIntentLink";
import { Play, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Star, Calendar, Tv, Info, Clock, Layers3 } from "lucide-react";
import Link from "next/link";
import { getImageProps } from "next/image";
import { preload } from "react-dom";
import {
  ViewTransition,
  addTransitionType,
  startTransition,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

const carouselEnterTransition = {
  "carousel-next": "slide-from-right",
  "carousel-prev": "slide-from-left",
  default: "fade-in",
} as const;

const carouselExitTransition = {
  "carousel-next": "slide-to-left",
  "carousel-prev": "slide-to-right",
  default: "fade-out",
} as const;

const carouselArtworkEnterTransition = {
  "carousel-next": "carousel-artwork-from-right",
  "carousel-prev": "carousel-artwork-from-left",
  default: "fade-in",
} as const;

const carouselArtworkExitTransition = {
  "carousel-next": "carousel-artwork-to-left",
  "carousel-prev": "carousel-artwork-to-right",
  default: "fade-out",
} as const;

interface HeroCarouselProps {
  slides: AnilistMedia[];
  watchHrefs?: Record<string, string>;
  availabilityHints?: Record<string, CatalogAvailabilityHint>;
  initialHeroAssets?: Record<number, AnilistHeroAssets>;
}

export default function AnilistHeroCarousel({
  slides,
  watchHrefs,
  availabilityHints,
  initialHeroAssets = {},
}: HeroCarouselProps) {
  const deck = useMemo(() => slides.slice(0, 10), [slides]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [heroAssets, setHeroAssets] = useState<Record<number, AnilistHeroAssets>>(initialHeroAssets);
  const requestedAssetIdsRef = useRef(
    new Set(Object.keys(initialHeroAssets).map((id) => Number(id))),
  );
  const carouselRef = useRef<HTMLElement | null>(null);
  const carouselVisibleRef = useRef(true);
  const userScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((index: number) => {
    if (deck.length === 0) return;
    const nextIndex = (index + deck.length) % deck.length;
    if (nextIndex === activeIndex) return;

    const forwardDistance = (nextIndex - activeIndex + deck.length) % deck.length;
    const backwardDistance = (activeIndex - nextIndex + deck.length) % deck.length;

    startTransition(() => {
      addTransitionType(
        forwardDistance <= backwardDistance ? "carousel-next" : "carousel-prev",
      );
      setActiveIndex(nextIndex);
    });
  }, [activeIndex, deck.length]);

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
    const timer = setInterval(() => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || (activeEl as HTMLElement).isContentEditable);
      const isMenuOpen = document.body.style.overflow === "hidden" || Boolean(document.querySelector('[data-menu-open="true"]'));

      if (
        carouselVisibleRef.current
        && !userScrollingRef.current
        && document.visibilityState === "visible"
        && !isInputActive
        && !isMenuOpen
      ) {
        goNext();
      }
    }, 7000);
    return () => clearInterval(timer);
  }, [goNext, deck.length]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const observer = new IntersectionObserver(([entry]) => {
      carouselVisibleRef.current = Boolean(
        entry?.isIntersecting && entry.intersectionRatio >= 0.55,
      );
    }, {
      threshold: [0, 0.55],
    });

    const handleScroll = () => {
      userScrollingRef.current = true;
      if (scrollIdleTimerRef.current) {
        clearTimeout(scrollIdleTimerRef.current);
      }
      scrollIdleTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 180);
    };

    observer.observe(carousel);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (scrollIdleTimerRef.current) {
        clearTimeout(scrollIdleTimerRef.current);
        scrollIdleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (deck.length === 0) return;
    const nearbySlides = [
      deck[activeIndex],
      deck[(activeIndex + 1) % deck.length],
      deck[(activeIndex - 1 + deck.length) % deck.length],
    ].filter((item): item is AnilistMedia => Boolean(item));

    for (const item of nearbySlides) {
      const id = item.id;
      if (!id || requestedAssetIdsRef.current.has(id)) continue;
      requestedAssetIdsRef.current.add(id);
      void fetch(`/api/anilist/title-logo?id=${id}`)
        .then((response) => (
          response.ok
            ? (response.json() as Promise<Partial<AnilistHeroAssets>>)
            : null
        ))
        .then((payload) => {
          const assets = {
            logo: payload?.logo || null,
            backdrop: payload?.backdrop || null,
          };

          setHeroAssets((current) => ({ ...current, [id]: assets }));
        })
        .catch(() => {
          setHeroAssets((current) => ({
            ...current,
            [id]: { logo: null, backdrop: null },
          }));
        });
    }
  }, [activeIndex, deck]);

  useEffect(() => {
    if (deck.length <= 1) return;
    const nextSlide = deck[(activeIndex + 1) % deck.length];
    if (!nextSlide) return;

    const warmNextArtwork = () => {
      const nextAssets = heroAssets[nextSlide.id];
      const desktop = getImageProps({
        src: nextAssets?.backdrop || nextSlide.bannerImage || nextSlide.coverImage.extraLarge,
        alt: "",
        fill: true,
        quality: 90,
        sizes: "100vw",
      }).props;
      const mobile = getImageProps({
        src: nextSlide.coverImage.extraLarge || nextSlide.bannerImage || "",
        alt: "",
        fill: true,
        quality: 85,
        sizes: "100vw",
      }).props;

      preload(desktop.src, {
        as: "image",
        fetchPriority: "low",
        imageSrcSet: desktop.srcSet,
        imageSizes: desktop.sizes,
        media: "(min-width: 768px)",
      });
      preload(mobile.src, {
        as: "image",
        fetchPriority: "low",
        imageSrcSet: mobile.srcSet,
        imageSizes: mobile.sizes,
        media: "(max-width: 767px)",
      });
    };

    const idleApi = window as unknown as {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleApi.requestIdleCallback) {
      const idleId = idleApi.requestIdleCallback(warmNextArtwork, { timeout: 1200 });
      return () => idleApi.cancelIdleCallback?.(idleId);
    }

    const timer = globalThis.setTimeout(warmNextArtwork, 250);
    return () => globalThis.clearTimeout(timer);
  }, [activeIndex, deck, heroAssets]);

  // Touch swipe support for mobile
  const touchStartPoint = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartPoint.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartPoint.current) return;
    const diffX = touchStartPoint.current.x - e.changedTouches[0].clientX;
    const diffY = touchStartPoint.current.y - e.changedTouches[0].clientY;
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
      if (diffX > 0) goNext();
      else goPrev();
    }
    touchStartPoint.current = null;
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
  const accentColor = slide.coverImage.color || "#ff5500";
  const isAiring = slide.status === "RELEASING";
  const activeHeroAssets = heroAssets[slide.id];
  const titleLogoState = activeHeroAssets?.logo;
  const desktopBackdrop = getImageProps({
    src: activeHeroAssets?.backdrop || slide.bannerImage || slide.coverImage.extraLarge,
    alt: title,
    fill: true,
    quality: 90,
    sizes: "100vw",
  }).props;
  const mobileBackdrop = getImageProps({
    src: slide.coverImage.extraLarge || slide.bannerImage || "",
    alt: title,
    fill: true,
    quality: 85,
    sizes: "100vw",
  }).props;
  preload(desktopBackdrop.src, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: desktopBackdrop.srcSet,
    imageSizes: desktopBackdrop.sizes,
    media: "(min-width: 768px)",
  });
  preload(mobileBackdrop.src, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: mobileBackdrop.srcSet,
    imageSizes: mobileBackdrop.sizes,
    media: "(max-width: 767px)",
  });
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
      ref={carouselRef}
      className="mobile-carousel-stage relative h-[clamp(570px,155vw,640px)] w-full touch-pan-y overflow-hidden bg-[#080809] lg:h-[100svh] lg:min-h-[520px]"
      aria-label="Featured anime carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") goPrev();
        if (e.key === "ArrowRight") goNext();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Full-viewport background image ─────────────────────────────────── */}
      <ViewTransition
        key={`backdrop-${slide.id}`}
        enter={carouselArtworkEnterTransition}
        exit={carouselArtworkExitTransition}
        default="none"
      >
        <div className="absolute inset-0 z-0">
          <picture className="absolute inset-0">
            <source media="(max-width: 767px)" srcSet={mobileBackdrop.srcSet} sizes={mobileBackdrop.sizes} />
            <source media="(min-width: 768px)" srcSet={desktopBackdrop.srcSet} sizes={desktopBackdrop.sizes} />
            <img
              {...desktopBackdrop}
              alt={title}
              className="hero-carousel-artwork absolute inset-0 h-full w-full object-cover object-center"
            />
          </picture>

          {/* Cinematic readability layers; the accent wash changes with every anime. */}
          <div
            className="absolute inset-y-0 left-0 hidden w-[48%] opacity-25 lg:block"
            style={{ background: `radial-gradient(circle at 12% 58%, ${accentColor} 0%, transparent 68%)` }}
          />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#080809]/75 via-[#080809]/25 to-transparent" />
          <div className="absolute inset-y-0 left-0 hidden w-[56%] bg-gradient-to-r from-[#080809]/95 via-[#080809]/72 to-transparent lg:block" />
          <div className="absolute inset-x-0 bottom-0 hidden h-56 bg-gradient-to-t from-[#080809] via-[#080809]/62 to-transparent lg:block" />
          <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#080809] via-[#080809]/60 to-transparent lg:hidden" />
        </div>
      </ViewTransition>

      {/* ── DESKTOP LAYOUT (lg+): same compact cinematic rhythm as the reference ── */}
      <div className="absolute inset-0 z-10 hidden flex-col justify-end px-14 pb-[120px] lg:flex xl:px-20">
        <ViewTransition
          key={`desktop-copy-${slide.id}`}
          enter={carouselEnterTransition}
          exit={carouselExitTransition}
          default="none"
        >
          <div className="max-w-[520px]">
            <div className="mb-4 flex h-[116px] max-w-[380px] items-start justify-start">
              {titleLogoState ? (
                <img
                  src={titleLogoState}
                  alt={title}
                  className="max-h-[112px] max-w-[340px] object-contain object-left-top drop-shadow-[0_8px_30px_rgba(0,0,0,0.95)]"
                  decoding="async"
                  onError={() => setHeroAssets((current) => ({
                    ...current,
                    [slide.id]: {
                      logo: null,
                      backdrop: current[slide.id]?.backdrop || null,
                    },
                  }))}
                />
              ) : (
                <h1
                  className={`${
                    title.length > 50
                      ? "text-2xl xl:text-3xl font-extrabold line-clamp-2"
                      : title.length > 30
                        ? "text-3xl xl:text-4xl font-black line-clamp-2"
                        : "text-4xl xl:text-5xl font-black line-clamp-2"
                  } text-white leading-tight tracking-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.95)]`}
                >
                  {title}
                </h1>
              )}
            </div>

            {/* Premium translucent metadata pills. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {isAiring && (
                <span
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md"
                  style={{
                    backgroundColor: `${accentColor}20`,
                    borderColor: `${accentColor}70`,
                    color: `color-mix(in srgb, ${accentColor} 72%, white)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 24px ${accentColor}18`,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  Airing
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-300/35 bg-amber-300/15 px-3 py-1.5 text-[11px] font-black text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" /> {rating}
                </span>
              )}
              {slide.seasonYear && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                  <Calendar className="h-3 w-3 text-white/55" aria-hidden="true" /> {slide.seasonYear}
                </span>
              )}
              {slide.episodes && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                  <Layers3 className="h-3 w-3 text-white/55" aria-hidden="true" /> {slide.episodes} Episodes
                </span>
              )}
              {slide.duration && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                  <Clock className="h-3 w-3 text-white/55" aria-hidden="true" /> {slide.duration} min
                </span>
              )}
              {slide.format && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                  <Tv className="h-3 w-3 text-white/55" aria-hidden="true" /> {slide.format}
                </span>
              )}
            </div>

            {/* Genre chips stay neutral; accent color is reserved for primary actions. */}
            {slide.genres.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {slide.genres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] font-semibold text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {description && (
              <p className="mb-5 max-w-[450px] text-[13px] font-medium leading-[1.65] text-white/65 line-clamp-2">
                {description}
              </p>
            )}

            <div className="flex items-center gap-3">
              {watchHref ? (
                <WatchIntentLink
                  href={watchHref}
                  animeId={animeId}
                  episodeNumber={watchEpisode}
                  className="flex items-center gap-2.5 rounded-full border px-6 py-3 text-sm font-black shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:brightness-125"
                  style={{
                    backgroundColor: `${accentColor}22`,
                    borderColor: `${accentColor}80`,
                    color: `color-mix(in srgb, ${accentColor} 68%, white)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px ${accentColor}24`,
                  }}
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Watch Now
                </WatchIntentLink>
              ) : (
                <Link href={href}
                  className="flex items-center gap-2.5 rounded-full border px-6 py-3 text-sm font-black shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:brightness-125"
                  style={{
                    backgroundColor: `${accentColor}22`,
                    borderColor: `${accentColor}80`,
                    color: `color-mix(in srgb, ${accentColor} 68%, white)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px ${accentColor}24`,
                  }}
                >
                  <Play className="h-4 w-4" aria-hidden="true" /> Details
                </Link>
              )}
              <Link href={href}
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/16 hover:text-white"
              >
                <Info className="h-4 w-4" aria-hidden="true" /> More Info
              </Link>
              <button
                type="button"
                onClick={toggleBookmark}
                className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 ${
                  bookmarked
                    ? "border-yellow-400/50 bg-yellow-400/15 hover:bg-yellow-400/25"
                    : "border-white/20 bg-white/10 hover:bg-white/16"
                }`}
                title={bookmarked ? "Remove from my list" : "Add to my list"}
                aria-label={bookmarked ? "Remove from my list" : "Add to my list"}
              >
                {bookmarked
                  ? <BookmarkCheck className="h-4 w-4 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                  : <Bookmark className="h-4 w-4 text-white/75" aria-hidden="true" />
                }
              </button>
            </div>

            {availability && !watchHref && (
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                {availability.message}
              </p>
            )}
          </div>
        </ViewTransition>
        </div>

      <div className="absolute bottom-10 left-14 z-20 hidden items-center lg:flex xl:left-20">
        <NavButtons deck={deck} activeIndex={activeIndex} goTo={goTo} accentColor={accentColor} />
      </div>

      {/* Counter precedes the circular arrows, matching the reference. */}
      <div className="absolute bottom-8 right-14 z-20 hidden items-center gap-3 lg:flex xl:right-20">
        <span className="mr-1 text-xs font-black text-white/55">{activeIndex + 1}/{deck.length}</span>
        <button type="button" onClick={goPrev} aria-label="Previous slide"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:border-white/35 hover:bg-white/15">
          <ChevronLeft className="h-4 w-4 text-white" aria-hidden="true" />
        </button>
        <button type="button" onClick={goNext} aria-label="Next slide"
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:bg-white/15"
          style={{ borderColor: `${accentColor}90` }}>
          <ChevronRight className="h-4 w-4 text-white" aria-hidden="true" />
        </button>
      </div>

      {/* ── MOBILE: the same desktop design, fitted to a portrait stage ────── */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end px-6 pb-6 lg:hidden">
        <ViewTransition
          key={`mobile-copy-${slide.id}`}
          enter={carouselEnterTransition}
          exit={carouselExitTransition}
          default="none"
        >
          <div className="w-full">

          <div className="mb-3 flex h-20 max-w-full items-end justify-start">
            {titleLogoState === undefined ? (
              <div className="h-14 w-40 animate-pulse rounded-lg bg-white/5" />
            ) : titleLogoState ? (
              <img
                src={titleLogoState}
                alt={title}
                className="max-h-20 max-w-[62vw] object-contain object-left-bottom drop-shadow-[0_7px_22px_rgba(0,0,0,0.98)]"
                decoding="async"
                onError={() => setHeroAssets((current) => ({
                  ...current,
                  [slide.id]: {
                    logo: null,
                    backdrop: current[slide.id]?.backdrop || null,
                  },
                }))}
              />
            ) : (
              <h1 className="max-w-[88vw] text-3xl font-black leading-[1.05] tracking-tight text-white line-clamp-3 drop-shadow-[0_3px_14px_rgba(0,0,0,0.98)]">
                {title}
              </h1>
            )}
          </div>

          {/* Identical metadata system to desktop. */}
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            {isAiring && (
              <span
                className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md"
                style={{
                  backgroundColor: `${accentColor}20`,
                  borderColor: `${accentColor}70`,
                  color: `color-mix(in srgb, ${accentColor} 72%, white)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 24px ${accentColor}18`,
                }}
              >
                <span className="h-1 w-1 rounded-full bg-white" />
                Airing
              </span>
            )}
            {rating && (
              <span className="flex items-center gap-1 rounded-full border border-amber-300/35 bg-amber-300/15 px-2.5 py-1 text-[9px] font-black text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" /> {rating}
              </span>
            )}
            {slide.seasonYear && (
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[9px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                <Calendar className="h-2.5 w-2.5 text-white/55" aria-hidden="true" /> {slide.seasonYear}
              </span>
            )}
            {slide.episodes && (
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[9px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                <Layers3 className="h-2.5 w-2.5 text-white/55" aria-hidden="true" /> {slide.episodes} Episodes
              </span>
            )}
            {slide.duration && (
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[9px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                <Clock className="h-2.5 w-2.5 text-white/55" aria-hidden="true" /> {slide.duration} min
              </span>
            )}
            {slide.format && (
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[9px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                <Tv className="h-2.5 w-2.5 text-white/55" aria-hidden="true" /> {slide.format}
              </span>
            )}
          </div>

          {slide.genres.length > 0 && (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              {slide.genres.slice(0, 4).map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[9px] font-semibold text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {description && (
            <p className="mb-3 max-w-[90vw] text-[11px] font-medium leading-[1.5] text-white/65 line-clamp-2">
              {description}
            </p>
          )}

          {/* Identical actions to desktop: same shape, color, size and states. */}
          <div className="flex items-center gap-2">
            {watchHref ? (
              <WatchIntentLink
                href={watchHref}
                animeId={animeId}
                episodeNumber={watchEpisode}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2.5 text-[11px] font-black shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:brightness-125"
                style={{
                  backgroundColor: `${accentColor}22`,
                  borderColor: `${accentColor}80`,
                  color: `color-mix(in srgb, ${accentColor} 68%, white)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px ${accentColor}24`,
                }}
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> Watch Now
              </WatchIntentLink>
            ) : (
              <Link
                href={href}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2.5 text-[11px] font-black shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:brightness-125"
                style={{
                  backgroundColor: `${accentColor}22`,
                  borderColor: `${accentColor}80`,
                  color: `color-mix(in srgb, ${accentColor} 68%, white)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px ${accentColor}24`,
                }}
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" /> Details
              </Link>
            )}
            <Link
              href={href}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-[11px] font-bold text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/16 hover:text-white"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" /> More Info
            </Link>
            <button
              type="button"
              onClick={toggleBookmark}
              className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 ${
                bookmarked
                  ? "border-yellow-400/50 bg-yellow-400/15 hover:bg-yellow-400/25"
                  : "border-white/20 bg-white/10 hover:bg-white/16"
              }`}
              title={bookmarked ? "Remove from my list" : "Add to my list"}
              aria-label={bookmarked ? "Remove from my list" : "Add to my list"}
            >
              {bookmarked
                ? <BookmarkCheck className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                : <Bookmark className="h-3.5 w-3.5 text-white/75" aria-hidden="true" />
              }
            </button>
          </div>
          </div>
        </ViewTransition>

        <div className="mt-4 flex items-center justify-between">
          <NavButtons deck={deck} activeIndex={activeIndex} goTo={goTo} accentColor={accentColor} />
          <div className="flex items-center gap-2">
            <span className="mr-1 text-[10px] font-black text-white/55">{activeIndex + 1}/{deck.length}</span>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:border-white/35 hover:bg-white/15"
            >
              <ChevronLeft className="h-4 w-4 text-white" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="flex h-9 w-9 items-center justify-center rounded-full border bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:bg-white/15"
              style={{ borderColor: `${accentColor}90` }}
            >
              <ChevronRight className="h-4 w-4 text-white" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Slide indicator dots only (arrows are in bottom-right) ───────────── */
function NavButtons({
  deck, activeIndex, goTo, accentColor,
}: {
  deck: AnilistMedia[];
  activeIndex: number;
  goTo: (i: number) => void;
  accentColor: string;
}) {
  return (
    <div className="flex h-5 items-center gap-2">
      {deck.map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => goTo(i)}
          aria-label={`Go to slide ${i + 1}`}
          aria-current={i === activeIndex ? "true" : undefined}
          className="flex h-5 shrink-0 items-center justify-center rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{ width: i === activeIndex ? "20px" : "5px" }}
        >
          <span
            aria-hidden="true"
            className="h-[5px] w-full rounded-full transition-colors duration-300"
            style={{
              backgroundColor: i === activeIndex
                ? accentColor
                : "rgba(255,255,255,0.30)",
            }}
          />
        </button>
      ))}
    </div>
  );
}
