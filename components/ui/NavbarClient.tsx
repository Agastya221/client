"use client";

import Link from "next/link";
import { Search, Shuffle, X, Menu, TrendingUp, Calendar, Radio, Sparkles, Film, Home, Bell, Tag, Library, Bookmark, History, LoaderCircle, Star } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import UserMenu from "@/components/ui/UserMenu";
import { HOME_VIEW_EVENT, type HomeViewMode } from "@/lib/home-view";
import { type AnilistMedia, anilistTitle, anilistFormat, anilistYear, encodeAnilistRouteId } from "@/lib/anilist/api";
import { useNavigationPending } from "@/components/ui/NavigationPendingController";
import YorumiWordmark from "@/components/ui/YorumiWordmark";
import { DEFAULT_THEME_ACCENT, dispatchThemeAccent } from "@/lib/theme-accent";

type NavbarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

interface NavbarClientProps {
  user: NavbarUser | null;
}

let navbarSessionPromise: Promise<NavbarUser | null> | null = null;

function loadNavbarSession(): Promise<NavbarUser | null> {
  if (!navbarSessionPromise) {
    navbarSessionPromise = fetch("/api/auth/session", { credentials: "same-origin" })
      .then(async (response) => response.ok
        ? response.json() as Promise<{ user?: NavbarUser | null }>
        : { user: null })
      .then((session) => session.user ?? null)
      .catch(() => null);
  }
  return navbarSessionPromise;
}

const NAV_LINKS = [
  { href: "/search?sort=trending", label: "Trending", icon: TrendingUp },
  { href: "/search?sort=season", label: "This Season", icon: Sparkles },
  { href: "/ongoing", label: "Ongoing", icon: Radio },
  { href: "/new", label: "New", icon: Bell },
  { href: "/updates", label: "Schedule", icon: Calendar },
  { href: "/?view=browse", label: "Browse", icon: Search },
  { href: "/genres", label: "Genres", icon: Tag },
  { href: "/types", label: "Types", icon: Library },
];

const DESKTOP_TABS: { id: string; label: string; href: string; mode?: HomeViewMode }[] = [
  { id: "home", label: "Home", href: "/", mode: "home" },
  { id: "browse", label: "Browse", href: "/?view=browse", mode: "browse" },
  { id: "schedule", label: "Schedule", href: "/updates" },
  { id: "new", label: "New", href: "/new" },
  { id: "ongoing", label: "Ongoing", href: "/ongoing" },
  { id: "genres", label: "Genres", href: "/genres" },
  { id: "types", label: "Types", href: "/types" },
];

export default function NavbarClient({ user }: NavbarClientProps) {
  const { beginNavigation } = useNavigationPending();
  const router = useRouter();
  const pathname = usePathname();
  const [resolvedUser, setResolvedUser] = useState<NavbarUser | null>(user);
  const [searchValue, setSearchValue] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchActive, setMobileSearchActive] = useState(false);
  const [suggestions, setSuggestions] = useState<AnilistMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDesktopFocused, setDesktopFocused] = useState(false);
  const [isMobileFocused, setMobileFocused] = useState(false);
  const [homeView, setHomeView] = useState<HomeViewMode>("home");

  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const activeTabId =
    pathname === "/"
      ? (homeView === "browse" ? "browse" : "home")
      : pathname === "/updates"
        ? "schedule"
        : pathname === "/new"
          ? "new"
          : pathname === "/ongoing"
            ? "ongoing"
            : pathname.startsWith("/genres")
              ? "genres"
              : pathname === "/types"
                ? "types"
                : pathname === "/search"
                  ? "browse"
                  : "";

  useEffect(() => {
    const el = tabRefs.current[activeTabId];
    if (el) {
      setIndicator({
        left: el.offsetLeft,
        width: el.offsetWidth,
        opacity: 1,
      });
    } else {
      setIndicator((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [activeTabId, pathname, homeView]);

  useEffect(() => {
    const handleResize = () => {
      const el = tabRefs.current[activeTabId];
      if (el) {
        setIndicator({
          left: el.offsetLeft,
          width: el.offsetWidth,
          opacity: 1,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTabId]);

  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileHeaderSearchRef = useRef<HTMLDivElement>(null);
  const mobileHeaderInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setResolvedUser(user);
      return;
    }

    let cancelled = false;
    void loadNavbarSession().then((sessionUser) => {
      if (!cancelled) setResolvedUser(sessionUser);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Focus mobile header search input when activated
  useEffect(() => {
    if (mobileSearchActive) {
      mobileHeaderInputRef.current?.focus();
    }
  }, [mobileSearchActive]);

  // Focus desktop search input when activated
  useEffect(() => {
    if (isDesktopFocused) {
      requestAnimationFrame(() => desktopInputRef.current?.focus());
    }
  }, [isDesktopFocused]);



  // Close mobile menu and search active state on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchActive(false);
  }, [pathname]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const hasVisibleAccentSource = Array.from(
        document.querySelectorAll<HTMLElement>('[data-yorumi-accent-source="true"]'),
      ).some((element) => element.getClientRects().length > 0);

      if (!hasVisibleAccentSource) {
        dispatchThemeAccent(DEFAULT_THEME_ACCENT);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const syncHomeView = () => {
      if (window.location.pathname !== "/") {
        setHomeView("home");
        return;
      }
      setHomeView(new URLSearchParams(window.location.search).get("view") === "browse" ? "browse" : "home");
    };
    const handleHomeView = (event: Event) => {
      setHomeView((event as CustomEvent<{ mode?: HomeViewMode }>).detail?.mode === "browse" ? "browse" : "home");
    };
    syncHomeView();
    window.addEventListener("popstate", syncHomeView);
    window.addEventListener(HOME_VIEW_EVENT, handleHomeView);
    return () => {
      window.removeEventListener("popstate", syncHomeView);
      window.removeEventListener(HOME_VIEW_EVENT, handleHomeView);
    };
  }, [pathname]);

  // The logo is the most common exit from detail/watch pages. Warm the home
  // RSC payload once the current page is idle so the click can swap screens
  // immediately without competing with the critical player request.
  useEffect(() => {
    if (pathname === "/") return;

    const timer = window.setTimeout(() => router.prefetch("/"), 1_200);
    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (desktopSearchRef.current && !desktopSearchRef.current.contains(event.target as Node)) {
        setDesktopFocused(false);
      }
      if (mobileHeaderSearchRef.current && !mobileHeaderSearchRef.current.contains(event.target as Node)) {
        setMobileFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search suggestions
  useEffect(() => {
    const trimmed = searchValue.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`/api/anilist-search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const json = await res.json();
          setSuggestions(json.media?.slice(0, 5) || []);
        }
      } catch (err) {
        console.error("Suggestions fetch failed", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchValue]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchValue.trim()) {
      const href = `/search?q=${encodeURIComponent(searchValue.trim())}`;
      if (!beginNavigation(href)) return;
      router.push(href);
      setMobileMenuOpen(false);
      setMobileSearchActive(false);
      setDesktopFocused(false);
      setMobileFocused(false);
    }
  }

  function handleHomeViewClick(event: React.MouseEvent<HTMLAnchorElement>, mode: HomeViewMode) {
    setHomeView(mode);
    setMobileMenuOpen(false);
    if (pathname === "/") {
      event.preventDefault();
      const href = mode === "browse" ? "/?view=browse" : "/";
      router.push(href, { scroll: false });
    }
  }

  const isWatchPage = pathname.includes("/watch");

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-down {
          animation: slideDown 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .nav-pill {
          padding: 0.4rem 0.85rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.025em;
          transition: color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
          color: rgba(255,255,255,0.6);
        }
        .nav-pill:hover {
          color: white;
          background: rgba(255,255,255,0.08);
        }
        .nav-pill.active {
          color: white;
          background: rgba(255,255,255,0.12);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.12);
        }
      `}</style>
      <nav
        className="fixed top-0 z-50 w-full"
        style={{ viewTransitionName: "persistent-nav" }}
        data-menu-open={mobileMenuOpen || mobileSearchActive || isDesktopFocused || isMobileFocused ? "true" : "false"}
      >
        {/* Mobile Search Active Panel */}
        {mobileSearchActive && (
          <div className="flex h-16 w-full items-center px-4 gap-3 lg:hidden animate-slide-down bg-[#0a0b0c]/95 backdrop-blur-xl border-b border-white/5">
            <button
              type="button"
              onClick={() => {
                setMobileSearchActive(false);
                setSearchValue("");
                setMobileFocused(false);
              }}
              className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0 hover:bg-white/10 transition-colors"
              aria-label="Close search"
            >
              <X className="w-4 h-4 text-white/60" aria-hidden="true" />
            </button>
            <div ref={mobileHeaderSearchRef} className="relative flex-1">
              <form onSubmit={handleSearch} className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" aria-hidden="true" />
                <input
                  ref={mobileHeaderInputRef}
                  type="text"
                  value={searchValue}
                  onFocus={() => setMobileFocused(true)}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search anime…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff5500]/50"
                />
              </form>

              {isMobileFocused && (
                <div
                  className="fixed inset-0 top-16 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-backdrop-in"
                  onClick={() => setMobileFocused(false)}
                />
              )}

              {isMobileFocused && searchValue.trim() && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-2xl border border-white/10 bg-[#0f1012]/98 p-2 shadow-2xl flex flex-col gap-1">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-white/50 text-sm">
                      <LoaderCircle className="w-5 h-5 animate-spin text-[#52ff7f]" aria-hidden="true" />
                      <span>Searching…</span>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="py-4 text-center text-sm text-white/40">
                      No results found
                    </div>
                  ) : (
                    <>
                      {suggestions.map((media) => {
                        const title = anilistTitle(media);
                        const format = anilistFormat(media);
                        const year = anilistYear(media);
                        const href = `/anime/${encodeAnilistRouteId(media.id)}`;
                        return (
                          <Link
                            key={media.id}
                            href={href}
                            prefetch={false}
                            onClick={() => {
                              setSearchValue("");
                              setMobileSearchActive(false);
                              setMobileFocused(false);
                            }}
                            className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-colors group"
                          >
                            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
                              <img
                                src={media.coverImage.medium || media.coverImage.large}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1 text-left">
                              <span className="text-sm font-semibold text-white group-hover:text-[#52ff7f] transition-colors truncate">
                                {title}
                              </span>
                              <span className="text-xs text-white/40 mt-0.5">
                                {format} {year ? `• ${year}` : ""}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                      <div className="border-t border-white/5 mt-1 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            handleSearch(e);
                            setMobileSearchActive(false);
                            setMobileFocused(false);
                          }}
                          className="w-full text-center py-2 text-xs font-bold text-[#52ff7f] hover:underline"
                        >
                          See all results
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`h-16 w-full items-center justify-between gap-3 bg-gradient-to-b from-[#080809]/85 via-[#080809]/45 to-transparent px-4 lg:gap-6 lg:bg-transparent lg:px-12 lg:backdrop-blur-none xl:px-16 ${mobileSearchActive ? "hidden lg:flex" : "flex"}`}>
          {/* Logo */}
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5 text-white/65" aria-hidden="true" />
            </button>
            <Link href="/" aria-label="Yorumi home" className="flex items-center">
              <YorumiWordmark className="text-[28px] sm:text-[30px] lg:text-[32px]" />
            </Link>
          </div>

          {/* Pill nav tabs (desktop) — centered with smooth sliding active pill */}
          <div className="hidden lg:flex items-center gap-1 bg-white/[0.06] backdrop-blur border border-white/[0.08] rounded-full px-1.5 py-1.5 relative">
            {/* Sliding Active Pill Background */}
            <div
              className="absolute top-1.5 bottom-1.5 rounded-full bg-white/15 border border-white/20 shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
              style={{
                left: `${indicator.left}px`,
                width: `${indicator.width}px`,
                opacity: indicator.opacity,
              }}
            />

            {DESKTOP_TABS.map((tab) => {
              const isActive = activeTabId === tab.id;
              return (
                <Link
                  key={tab.id}
                  ref={(el) => { tabRefs.current[tab.id] = el; }}
                  href={tab.href}
                  data-home-view={tab.mode}
                  onClick={(event) => {
                    if (tab.mode) {
                      handleHomeViewClick(event, tab.mode);
                    }
                  }}
                  className={`relative z-10 nav-pill ${isActive ? "active !bg-transparent !shadow-none text-white font-extrabold" : tab.id === "new" ? "!text-[#52ff7f]" : ""}`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Right: search + shuffle + user */}
          <div className="hidden lg:flex items-center gap-2">
            {/* Search bar (desktop) — single persistent element to prevent ghosting */}
            <div ref={desktopSearchRef} className={`relative h-9 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isDesktopFocused ? "w-[260px]" : "w-9"}`}>
              <form
                onSubmit={handleSearch}
                onClick={() => { if (!isDesktopFocused) setDesktopFocused(true); }}
                className={`flex items-center h-full rounded-full overflow-hidden transition-[background-color,border-color,padding,gap] duration-200 ${
                  isDesktopFocused
                    ? "bg-white/8 border border-white/10 px-3 gap-2"
                    : "bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] justify-center px-0 gap-0 cursor-pointer"
                }`}
              >
                <Search className={`w-4 h-4 shrink-0 transition-colors duration-200 ${isDesktopFocused ? "text-white/50" : "text-white/70"}`} aria-hidden="true" />
                <input
                  ref={desktopInputRef}
                  id="navbar-search"
                  name="q"
                  type="text"
                  value={searchValue}
                  onFocus={() => setDesktopFocused(true)}
                  onBlur={() => { if (!searchValue) setDesktopFocused(false); }}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search anime…"
                  className={`bg-transparent text-sm text-white focus:outline-none placeholder:text-white/30 min-w-0 transition-[width,opacity] duration-200 ${
                    isDesktopFocused ? "w-full opacity-100" : "w-0 opacity-0"
                  }`}
                  tabIndex={isDesktopFocused ? 0 : -1}
                />
                {isDesktopFocused && searchValue && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setSearchValue(""); }} className="shrink-0" aria-label="Clear search">
                    <X className="w-3.5 h-3.5 text-white/40 hover:text-white transition-colors" aria-hidden="true" />
                  </button>
                )}
              </form>

              {isDesktopFocused && searchValue.trim() && (
                <div className="absolute top-full right-0 z-50 mt-2 w-[420px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#0c0d0f]/95 backdrop-blur-xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col gap-1.5 animate-slide-down">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8 gap-2.5 text-white/60 text-sm">
                      <LoaderCircle className="w-5 h-5 animate-spin text-[#52ff7f]" aria-hidden="true" />
                      <span className="font-medium">Searching…</span>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="py-6 text-center text-sm text-white/40 font-medium">No anime found</div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1">
                        {suggestions.map((media) => {
                          const title = anilistTitle(media);
                          const format = anilistFormat(media);
                          const year = anilistYear(media);
                          const href = `/anime/${encodeAnilistRouteId(media.id)}`;
                          return (
                            <Link
                              key={media.id}
                              href={href}
                              prefetch={false}
                              onClick={() => { setSearchValue(""); setDesktopFocused(false); }}
                              className="flex items-center gap-3.5 rounded-xl p-2.5 hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group duration-200"
                            >
                              <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
                                <img src={media.coverImage.medium || media.coverImage.large} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                              </div>
                              <div className="flex flex-col min-w-0 flex-1 text-left gap-0.5">
                                <div className="flex items-start justify-between gap-3">
                                  <span className="text-sm font-bold text-white group-hover:text-[#52ff7f] transition-colors truncate">{title}</span>
                                  {media.averageScore && (
                                    <span className="flex items-center gap-0.5 text-amber-400 font-semibold text-xs shrink-0 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/15">
                                      ★ {(media.averageScore / 10).toFixed(1)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-white/45 font-medium">
                                  <span className="text-white/60">{format}</span>
                                  {year && <span>• {year}</span>}
                                  {media.episodes && <span>• {media.episodes} EP</span>}
                                </div>
                                {media.genres && media.genres.length > 0 && (
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {media.genres.slice(0, 2).map((genre) => (
                                      <span key={genre} className="text-[9px] font-bold tracking-wider uppercase text-white/50 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded">{genre}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                      <div className="border-t border-white/5 mt-1.5 pt-1.5">
                        <button type="button" onClick={(e) => { handleSearch(e); setDesktopFocused(false); }}
                          className="w-full text-center py-2 text-xs font-extrabold tracking-wider uppercase text-[#52ff7f] hover:text-[#3eff6c] transition-colors hover:underline flex items-center justify-center gap-1">
                          See all results
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <Link href="/random" className="w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/[0.12] flex items-center justify-center border border-white/[0.08] transition-all" aria-label="Random anime">
              <Shuffle className="w-4 h-4 text-white/70" aria-hidden="true" />
            </Link>
            <UserMenu user={resolvedUser} />
          </div>

          {/* Mobile: hamburger + user */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileSearchActive(true)}
              className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-white/60" aria-hidden="true" />
            </button>
            <Link
              href="/updates"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5"
              aria-label="Release updates"
            >
              <Bell className="h-4 w-4 text-white/60" aria-hidden="true" />
            </Link>
            <UserMenu user={resolvedUser} />
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      <div className={`fixed inset-0 z-[60] lg:hidden transition-all duration-300 ${mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Menu panel */}
        <div className={`absolute left-0 top-0 bottom-0 w-[80%] max-w-sm bg-[#0f1012] border-r border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <YorumiWordmark className="text-2xl" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                aria-label="Close navigation menu"
              >
                <X className="w-4 h-4 text-white/60" aria-hidden="true" />
              </button>
            </div>



            {/* Links */}
            <div className="flex-1 overflow-y-auto py-2">
              <Link
                href="/"
                data-home-view="home"
                onClick={(event) => handleHomeViewClick(event, "home")}
                className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Home className="w-4 h-4 text-white/40" aria-hidden="true" />
                Home
              </Link>
              {NAV_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-home-view={link.label === "Browse" ? "browse" : undefined}
                    onClick={link.label === "Browse" ? (event) => handleHomeViewClick(event, "browse") : undefined}
                    className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-white/40" aria-hidden="true" />
                    {link.label}
                  </Link>
                );
              })}

              <div className="border-t border-white/5 mt-2 pt-2">
                <Link
                  href="/random"
                  className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Shuffle className="w-4 h-4 text-[#ff5500]" aria-hidden="true" />
                  Random Anime
                </Link>
                <Link
                  href="/my-list"
                  className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Bookmark className="w-4 h-4 text-white/40 shrink-0" aria-hidden="true" />
                  My List
                </Link>
                <Link
                  href="/history"
                  className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <History className="w-4 h-4 text-white/40 shrink-0" aria-hidden="true" />
                  Watch History
                </Link>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
