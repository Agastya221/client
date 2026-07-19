"use client";

import Link from "next/link";
import { Search, Shuffle, X, Menu, TrendingUp, Calendar, Radio, Sparkles, Film, Home, Bell, Tag, Library, Bookmark, History, LoaderCircle, Star } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import UserMenu from "@/components/ui/UserMenu";
import { type AnilistMedia, anilistTitle, anilistFormat, anilistYear, encodeAnilistRouteId } from "@/lib/anilist/api";
import { useNavigationPending } from "@/components/ui/NavigationPendingController";

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
  { href: "/search", label: "Browse", icon: Search },
  { href: "/genres", label: "Genres", icon: Tag },
  { href: "/types", label: "Types", icon: Library },
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

  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileHeaderSearchRef = useRef<HTMLDivElement>(null);
  const mobileHeaderInputRef = useRef<HTMLInputElement>(null);

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



  // Close mobile menu and search active state on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchActive(false);
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
      `}</style>
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#0a0b0c]/90 backdrop-blur-md">
        {/* Mobile Search Active Panel */}
        {mobileSearchActive && (
          <div className="flex h-16 w-full items-center px-4 gap-3 lg:hidden animate-slide-down">
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

        <div className={`h-16 w-full items-center justify-between px-4 lg:px-12 xl:px-16 gap-6 ${mobileSearchActive ? "hidden lg:flex" : "flex"}`}>
          {/* Logo */}
          <div className="flex shrink-0 items-center gap-3 lg:gap-8">
            {isWatchPage ? (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5 text-white/65" aria-hidden="true" />
              </button>
            ) : null}
            <Link href="/" className="flex items-center text-2xl font-black tracking-tight">
              <span className="text-white">Anime</span>
              <span className="text-[#52ff7f]">PLAY</span>
            </Link>

            {/* Search bar (desktop) */}
            <div ref={desktopSearchRef} className={`relative hidden lg:block flex-1 transition-all duration-300 ease-out ${isDesktopFocused ? "max-w-[320px]" : "max-w-[200px]"}`}>
              <form
                onSubmit={handleSearch}
                className="flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/8 px-4 py-2 border border-white/5 hover:border-white/10 w-full transition-all"
              >
                <Search className="w-4 h-4 text-white/40 shrink-0" aria-hidden="true" />
                <input
                  id="navbar-search"
                  name="q"
                  type="text"
                  value={searchValue}
                  onFocus={() => setDesktopFocused(true)}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search anime…"
                  className="bg-transparent text-sm text-white focus:outline-none w-full placeholder:text-white/30"
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={() => setSearchValue("")}
                    className="shrink-0"
                    aria-label="Clear search input"
                  >
                    <X className="w-3.5 h-3.5 text-white/40 hover:text-white transition-colors" aria-hidden="true" />
                  </button>
                )}
              </form>

              {isDesktopFocused && searchValue.trim() && (
                <div className="absolute top-full left-0 z-50 mt-2.5 w-[480px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#0c0d0f]/85 backdrop-blur-xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.55)] flex flex-col gap-1.5 animate-slide-down">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8 gap-2.5 text-white/60 text-sm">
                      <LoaderCircle className="w-5 h-5 animate-spin text-[#52ff7f]" aria-hidden="true" />
                      <span className="font-medium">Searching AniList catalog…</span>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="py-6 text-center text-sm text-white/40 font-medium">
                      No anime found matching your query
                    </div>
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
                              onClick={() => {
                                setSearchValue("");
                                setDesktopFocused(false);
                              }}
                              className="flex items-center gap-3.5 rounded-xl p-2.5 hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group duration-200"
                            >
                              <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
                                <img
                                  src={media.coverImage.medium || media.coverImage.large}
                                  alt=""
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  loading="lazy"
                                />
                              </div>
                              <div className="flex flex-col min-w-0 flex-1 text-left gap-0.5">
                                <div className="flex items-start justify-between gap-3">
                                  <span className="text-sm font-bold text-white group-hover:text-[#52ff7f] transition-colors truncate">
                                    {title}
                                  </span>
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
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap shrink-0">
                                    {media.genres.slice(0, 2).map((genre) => (
                                      <span
                                        key={genre}
                                        className="text-[9px] font-bold tracking-wider uppercase text-white/50 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded"
                                      >
                                        {genre}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                      <div className="border-t border-white/5 mt-1.5 pt-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            handleSearch(e);
                            setDesktopFocused(false);
                          }}
                          className="w-full text-center py-2 text-xs font-extrabold tracking-wider uppercase text-[#52ff7f] hover:text-[#3eff6c] transition-colors hover:underline flex items-center justify-center gap-1"
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

          {/* Nav links (desktop) */}
          <div className="hidden lg:flex items-center gap-5 text-xs font-bold uppercase tracking-wider text-white/50">
            <Link href="/search?sort=trending" className="nav-link hover:text-white transition-colors">Trending</Link>
            <Link href="/new" className="nav-link hover:text-white transition-colors text-emerald-400">New</Link>
            <Link href="/search?sort=season" className="nav-link hover:text-white transition-colors">This Season</Link>
            <Link href="/search" className="nav-link hover:text-white transition-colors">Browse</Link>
            <Link href="/genres" className="nav-link hover:text-white transition-colors">Genres</Link>
            <Link href="/types" className="nav-link hover:text-white transition-colors">Types</Link>
            <Link href="/updates" className="nav-link hover:text-white transition-colors">Schedule</Link>

            <div className="flex items-center gap-3 ml-2 border-l border-white/10 pl-5">
              <Link href="/random" className="hover:text-white transition-colors" aria-label="Random anime">
                <Shuffle className="w-4 h-4" aria-hidden="true" />
              </Link>
              <UserMenu user={resolvedUser} />
            </div>
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
            <UserMenu user={resolvedUser} />
            {!isWatchPage ? (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="w-4 h-4 text-white/60" aria-hidden="true" />
              </button>
            ) : null}
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
        <div className={`absolute right-0 top-0 bottom-0 w-[80%] max-w-sm bg-[#0f1012] border-l border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${mobileMenuOpen ? "translate-x-0" : "translate-x-full"}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="text-lg font-black text-white">
                Anime<span className="text-[#52ff7f]">PLAY</span>
              </span>
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
