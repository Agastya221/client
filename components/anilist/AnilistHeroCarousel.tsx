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
  useSyncExternalStore,
} from "react";
import ThemeAccentSource from "@/components/ui/ThemeAccentSource";

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

/*
 * Hero assets have three states, not two. An id that is absent from the record
 * — or explicitly marked "pending" — has not been answered yet; an
 * `AnilistHeroAssets` value is an answer, and that answer may legitimately be
 * `logo: null`. Collapsing "not answered yet" into "no logo" is what made a
 * slide that does have a logo paint its text title first and then swap to the
 * image a moment later.
 */
type HeroAssetEntry = AnilistHeroAssets | "pending";
type HeroAssetRecord = Record<number, HeroAssetEntry>;

function resolvedHeroAssets(entry: HeroAssetEntry | undefined): AnilistHeroAssets | null {
  return entry && entry !== "pending" ? entry : null;
}

/*
 * Session cache for resolved assets, mirroring lib/anilist/list-entry-client.ts:
 * a module-level memory map in front of sessionStorage, every storage access
 * wrapped, and a timestamp so a stale entry is dropped rather than trusted. Its
 * job is to make a remount (back-navigation, a route change and back) paint the
 * logo immediately instead of replaying the request.
 */
const HERO_ASSET_STORAGE_PREFIX = "hero-assets:v1";
const HERO_ASSET_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredHeroAssets {
  assets: AnilistHeroAssets;
  cachedAt: number;
}

const heroAssetMemoryCache = new Map<number, StoredHeroAssets>();

function heroAssetStorageKey(anilistId: number): string {
  return `${HERO_ASSET_STORAGE_PREFIX}:${anilistId}`;
}

function readCachedHeroAssets(anilistId: number): AnilistHeroAssets | null {
  const memory = heroAssetMemoryCache.get(anilistId);
  if (memory && Date.now() - memory.cachedAt <= HERO_ASSET_CACHE_TTL_MS) {
    return memory.assets;
  }

  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(heroAssetStorageKey(anilistId));
    if (!raw) return null;

    const stored = JSON.parse(raw) as StoredHeroAssets | null;
    if (
      !stored
      || typeof stored !== "object"
      || !Number.isFinite(stored.cachedAt)
      || Date.now() - stored.cachedAt > HERO_ASSET_CACHE_TTL_MS
    ) {
      window.sessionStorage.removeItem(heroAssetStorageKey(anilistId));
      return null;
    }

    const assets: AnilistHeroAssets = {
      logo: typeof stored.assets?.logo === "string" ? stored.assets.logo : null,
      backdrop: typeof stored.assets?.backdrop === "string" ? stored.assets.backdrop : null,
    };
    heroAssetMemoryCache.set(anilistId, { assets, cachedAt: stored.cachedAt });
    return assets;
  } catch {
    return null;
  }
}

function writeCachedHeroAssets(anilistId: number, assets: AnilistHeroAssets): void {
  if (!Number.isInteger(anilistId) || anilistId <= 0) return;

  const stored: StoredHeroAssets = { assets, cachedAt: Date.now() };
  heroAssetMemoryCache.set(anilistId, stored);

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(heroAssetStorageKey(anilistId), JSON.stringify(stored));
  } catch {
    // Private mode or blocked storage. The memory cache still spares this page
    // session a repeat request.
  }
}

/*
 * `normalizeAnilistMedia` falls back to the romaji title when AniList has no
 * native title, so `title.native` is very often the string already on screen.
 * Whitespace and punctuation are stripped before comparing so "Re:ZERO" and
 * "Re Zero" do not produce a kicker that just repeats the headline.
 */
const TITLE_NOISE = /[\s!-\/:-@\[-`{-~、。「」『』・…〜～]+/g;

function titleFingerprint(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(TITLE_NOISE, "");
}

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
  // Seeded from whatever the server already resolved — one slide today, the
  // first few soon; any number of entries works because seeding is just a copy.
  const [heroAssets, setHeroAssets] = useState<HeroAssetRecord>(() => ({ ...initialHeroAssets }));
  // A logo URL that failed to decode is skipped for this mount only. Rewriting
  // `heroAssets` instead would let one transient network blip suppress the logo
  // for the rest of the session, cache included.
  const [failedLogoUrls, setFailedLogoUrls] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const carouselRef = useRef<HTMLElement | null>(null);
  const carouselVisibleRef = useRef(true);
  const userScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const initialHeroAssetsRef = useRef(initialHeroAssets);
  const heroAssetsRef = useRef<HeroAssetRecord>(heroAssets);

  // Built on first use instead of on every render: the eager form allocated a
  // Set per render and threw all but the first away.
  const requestedAssetIdsRef = useRef<Set<number> | null>(null);
  const requestedAssetIds = useCallback(() => {
    requestedAssetIdsRef.current ??= new Set(
      Object.keys(initialHeroAssetsRef.current).map((id) => Number(id)),
    );
    return requestedAssetIdsRef.current;
  }, []);

  // A decode failure is recorded against the URL, not against the slide, and
  // lives only for this mount: a remount (or a fresh session) retries it.
  const markLogoFailed = useCallback((url: string) => {
    setFailedLogoUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }, []);

  useEffect(() => {
    heroAssetsRef.current = heroAssets;
  }, [heroAssets]);

  // Assets the server resolved are worth caching too, so a remount can paint
  // them before the first effect tick.
  useEffect(() => {
    for (const [id, assets] of Object.entries(initialHeroAssetsRef.current)) {
      writeCachedHeroAssets(Number(id), assets);
    }
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Claimed synchronously by goTo so a second click landing before React has
  // committed the first still advances from the newer index. Reading
  // `activeIndex` from the closure instead makes rapid clicks collapse onto the
  // same target slide and appear to be dropped.
  const activeIndexRef = useRef(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const goTo = useCallback((index: number) => {
    if (deck.length === 0) return;
    const currentIndex = activeIndexRef.current;
    const nextIndex = (index + deck.length) % deck.length;
    if (nextIndex === currentIndex) return;

    const forwardDistance = (nextIndex - currentIndex + deck.length) % deck.length;
    const backwardDistance = (currentIndex - nextIndex + deck.length) % deck.length;
    activeIndexRef.current = nextIndex;

    startTransition(() => {
      addTransitionType(
        forwardDistance <= backwardDistance ? "carousel-next" : "carousel-prev",
      );
      setActiveIndex(nextIndex);
    });
  }, [deck.length]);

  const goPrev = useCallback(() => {
    if (deck.length <= 1) return;
    goTo(activeIndexRef.current - 1 + deck.length);
  }, [deck.length, goTo]);

  const goNext = useCallback(() => {
    if (deck.length <= 1) return;
    goTo(activeIndexRef.current + 1);
  }, [deck.length, goTo]);

  useEffect(() => {
    // Reduced motion is a request not to be moved; the arrows, dots and swipe
    // still work, so the carousel stays fully usable without the timer.
    if (deck.length <= 1 || prefersReducedMotion) return;
    const timer = setInterval(() => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || (activeEl as HTMLElement).isContentEditable);
      const isMenuOpen = document.body.style.overflow === "hidden" || Boolean(document.querySelector('[data-menu-open="true"]'));

      if (
        carouselVisibleRef.current
        && !userScrollingRef.current
        // Someone reading the description or reaching for "Watch Now" should
        // not have the slide — and the CTA's destination — change under them.
        && !pointerInsideRef.current
        && !focusInsideRef.current
        && document.visibilityState === "visible"
        && !isInputActive
        && !isMenuOpen
      ) {
        goNext();
      }
    }, 7000);
    return () => clearInterval(timer);
  }, [goNext, deck.length, prefersReducedMotion]);

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
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        userScrollingRef.current = true;
        if (scrollIdleTimerRef.current) {
          clearTimeout(scrollIdleTimerRef.current);
        }
        scrollIdleTimerRef.current = setTimeout(() => {
          userScrollingRef.current = false;
        }, 180);
      });
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
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
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

    const requested = requestedAssetIds();
    const seeded: HeroAssetRecord = {};
    const idsToFetch: number[] = [];

    for (const item of nearbySlides) {
      const id = item.id;
      if (!id || requested.has(id)) continue;
      requested.add(id);

      const cached = readCachedHeroAssets(id);
      if (cached) {
        seeded[id] = cached;
        continue;
      }

      seeded[id] = "pending";
      idsToFetch.push(id);
    }

    if (Object.keys(seeded).length > 0) {
      setHeroAssets((current) => {
        const next = { ...current };
        for (const [key, entry] of Object.entries(seeded)) {
          const id = Number(key);
          // A retry after a failed request must not drop the slide back into
          // pending and blank out the title it is already showing.
          if (entry === "pending" && resolvedHeroAssets(current[id])) continue;
          next[id] = entry;
        }
        return next;
      });
    }

    for (const id of idsToFetch) {
      void fetch(`/api/anilist/title-logo?id=${id}`)
        .then((response) => (
          response.ok
            ? (response.json() as Promise<Partial<AnilistHeroAssets>>)
            : null
        ))
        .then((payload) => {
          const assets: AnilistHeroAssets = {
            logo: payload?.logo || null,
            backdrop: payload?.backdrop || null,
          };

          writeCachedHeroAssets(id, assets);
          setHeroAssets((current) => ({ ...current, [id]: assets }));
        })
        .catch(() => {
          // Resolve so the slide stops waiting and shows the accent title, but
          // do not cache the failure and do not keep the id claimed: the next
          // time this slide comes into the prefetch window it tries again.
          requested.delete(id);
          setHeroAssets((current) => ({
            ...current,
            [id]: { logo: null, backdrop: null },
          }));
        });
    }
  }, [activeIndex, deck, requestedAssetIds]);

  useEffect(() => {
    if (deck.length <= 1) return;
    const nextSlide = deck[(activeIndex + 1) % deck.length];
    if (!nextSlide) return;

    const warmNextArtwork = () => {
      // Read through the ref at idle time rather than depending on `heroAssets`:
      // that dependency re-ran this effect — and re-issued the preloads — every
      // time any slide's assets arrived. It now runs once per slide change, and
      // still sees the freshest backdrop because the read happens when the idle
      // callback fires, not when the effect is set up.
      const nextAssets = resolvedHeroAssets(heroAssetsRef.current[nextSlide.id]);
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
  }, [activeIndex, deck]);

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

  // Derived during render, not synced after it. The old effect left the icon
  // showing the previous slide's state for a frame on every slide change.
  // `isBookmarked` is a synchronous localStorage read that swallows its own
  // storage errors, so it is safe here; the server snapshot is a flat `false`
  // so hydration still matches the markup the server produced.
  const readBookmarkedSnapshot = useCallback(
    () => (animeId ? isBookmarked(animeId) : false),
    [animeId],
  );
  const bookmarked = useSyncExternalStore(
    subscribeToBookmarks,
    readBookmarkedSnapshot,
    () => false,
  );

  if (!slide) return null;

  const title = anilistTitle(slide);
  const rating = anilistRating(slide);
  const href = `/anime/${encodeAnilistRouteId(slide.id)}`;
  const watchHref = watchHrefs?.[String(slide.id)] || null;
  const availability = availabilityHints?.[String(slide.id)] || null;
  const description = slide.description?.replace(/<[^>]*>/g, "").slice(0, 180) || "";
  const accentColor = slide.coverImage.color || "#ff5500";
  const isAiring = slide.status === "RELEASING";
  const activeHeroAssets = resolvedHeroAssets(heroAssets[slide.id]);
  // Null until the question has actually been answered. While it is null the
  // logo box stays empty: its height is fixed, so nothing shifts, and the text
  // title is never shown only to be replaced by an image a moment later.
  const titleLogoState = activeHeroAssets?.logo && !failedLogoUrls.has(activeHeroAssets.logo)
    ? activeHeroAssets.logo
    : null;
  const showTextTitle = Boolean(activeHeroAssets) && !titleLogoState;
  const nativeTitle = slide.title.native?.trim() || "";
  const nativeKicker = nativeTitle && titleFingerprint(nativeTitle) !== titleFingerprint(title)
    ? nativeTitle
    : null;
  const heroTitleStyle = { "--hero-accent": accentColor } as React.CSSProperties;
  const desktopTitleSize = title.length > 50
    ? "text-2xl xl:text-3xl font-extrabold"
    : title.length > 30
      ? "text-3xl xl:text-4xl font-black"
      : "text-4xl xl:text-5xl font-black";
  const mobileTitleSize = title.length > 50
    ? "text-xl"
    : title.length > 30
      ? "text-2xl"
      : "text-3xl";
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
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured anime carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        // Scoped to the carousel's own subtree — deliberately not a window
        // listener, which would take the arrow keys away from the whole page.
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const target = e.target as HTMLElement | null;
        if (
          target
          && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        ) return;
        e.preventDefault();
        if (e.key === "ArrowLeft") goPrev();
        else goNext();
      }}
      onPointerEnter={(e) => {
        // Touch never fires a matching leave, so a tap would pause autoplay for
        // good. Only a hovering device counts as "the pointer is over this".
        if (e.pointerType !== "touch") pointerInsideRef.current = true;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") pointerInsideRef.current = false;
      }}
      onPointerCancel={() => { pointerInsideRef.current = false; }}
      onFocus={() => { focusInsideRef.current = true; }}
      onBlur={() => { focusInsideRef.current = false; }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <ThemeAccentSource color={accentColor} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Slide ${activeIndex + 1} of ${deck.length}: ${title}`}
      </div>
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
            {/* Fixed height, so an empty box while the logo request is in
                flight costs no layout shift and shows no title to replace. */}
            <div className="mb-4 flex h-[116px] max-w-[380px] items-start justify-start">
              {titleLogoState ? (
                <img
                  src={titleLogoState}
                  alt={title}
                  className="max-h-[112px] max-w-[340px] object-contain object-left-top drop-shadow-[0_8px_30px_rgba(0,0,0,0.95)]"
                  decoding="async"
                  onError={() => markLogoFailed(titleLogoState)}
                />
              ) : showTextTitle ? (
                // Bottom-anchored: an over-long two-line title then grows into
                // the empty space above rather than down into the pills.
                <div className="flex h-full w-full flex-col justify-end gap-2" style={heroTitleStyle}>
                  <span className="hero-title-rule" aria-hidden="true" />
                  {nativeKicker && (
                    <span className="hero-title-kicker line-clamp-1">{nativeKicker}</span>
                  )}
                  <h1
                    className={`${desktopTitleSize} hero-title-accent text-balance leading-tight tracking-tight line-clamp-2`}
                  >
                    {title}
                  </h1>
                </div>
              ) : null}
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

      <div
        className="carousel-persistent-control absolute bottom-10 left-14 z-20 hidden items-center lg:flex xl:left-20"
        style={{ viewTransitionName: "carousel-desktop-dots" }}
      >
        <NavButtons deck={deck} activeIndex={activeIndex} goTo={goTo} accentColor={accentColor} />
      </div>

      {/* Counter precedes the circular arrows, matching the reference. */}
      <div
        className="carousel-persistent-control absolute bottom-8 right-14 z-20 hidden items-center gap-3 lg:flex xl:right-20"
        style={{ viewTransitionName: "carousel-desktop-navigation" }}
      >
        <span className="mr-1 text-xs font-black text-white/55">{activeIndex + 1}/{deck.length}</span>
        <button type="button" onClick={goPrev} aria-label="Previous slide"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:border-white/35 hover:bg-white/15 active:scale-90 active:bg-white/25 motion-reduce:active:scale-100">
          <ChevronLeft className="h-4 w-4 text-white" aria-hidden="true" />
        </button>
        <button type="button" onClick={goNext} aria-label="Next slide"
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:bg-white/15 active:scale-90 active:bg-white/25 motion-reduce:active:scale-100"
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

          {/* Same three states as desktop: nothing at all while pending — the
              pulsing placeholder that used to sit here was itself a swap. */}
          <div className="mb-3 flex h-20 max-w-full items-end justify-start">
            {titleLogoState ? (
              <img
                src={titleLogoState}
                alt={title}
                className="max-h-20 max-w-[62vw] object-contain object-left-bottom drop-shadow-[0_7px_22px_rgba(0,0,0,0.98)]"
                decoding="async"
                onError={() => markLogoFailed(titleLogoState)}
              />
            ) : showTextTitle ? (
              <div
                className="flex h-full w-full max-w-[88vw] flex-col justify-end gap-1.5"
                style={heroTitleStyle}
              >
                <span className="hero-title-rule" aria-hidden="true" />
                {nativeKicker && (
                  <span className="hero-title-kicker line-clamp-1">{nativeKicker}</span>
                )}
                <h1
                  className={`${mobileTitleSize} hero-title-accent text-balance font-black leading-[1.05] tracking-tight line-clamp-2`}
                >
                  {title}
                </h1>
              </div>
            ) : null}
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

        <div
          className="carousel-persistent-control mt-4 flex items-center justify-between"
          style={{ viewTransitionName: "carousel-mobile-navigation" }}
        >
          <NavButtons deck={deck} activeIndex={activeIndex} goTo={goTo} accentColor={accentColor} />
          <div className="flex items-center gap-2">
            <span className="mr-1 text-[10px] font-black text-white/55">{activeIndex + 1}/{deck.length}</span>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:border-white/35 hover:bg-white/15 active:scale-90 active:bg-white/25 motion-reduce:active:scale-100"
            >
              <ChevronLeft className="h-4 w-4 text-white" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="flex h-9 w-9 items-center justify-center rounded-full border bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all hover:bg-white/15 active:scale-90 active:bg-white/25 motion-reduce:active:scale-100"
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
      {/* Dot timing is matched to the 280ms slide transition; at the old 500ms
          the indicator was still moving after the content had settled. */}
      {deck.map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => goTo(i)}
          aria-label={`Go to slide ${i + 1}`}
          aria-current={i === activeIndex ? "true" : undefined}
          className="flex h-5 shrink-0 items-center justify-center rounded-full transition-[width] duration-280 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{ width: i === activeIndex ? "20px" : "5px" }}
        >
          <span
            aria-hidden="true"
            className="h-[5px] w-full rounded-full transition-colors duration-280"
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
