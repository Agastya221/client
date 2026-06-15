"use client";

import Link from "next/link";
import { Search, Shuffle, X, Menu, TrendingUp, Calendar, Radio, Sparkles, Film, Home, Bell, Tag, Library, Bookmark, History, LoaderCircle } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import UserMenu from "@/components/ui/UserMenu";
import { type AnilistMedia, anilistTitle, anilistFormat, anilistYear, encodeAnilistRouteId } from "@/lib/anilist/api";

interface NavbarClientProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
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
  const router = useRouter();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchActive, setMobileSearchActive] = useState(false);
  const [suggestions, setSuggestions] = useState<AnilistMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDesktopFocused, setDesktopFocused] = useState(false);
  const [isMobileFocused, setMobileFocused] = useState(false);

  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileHeaderSearchRef = useRef<HTMLDivElement>(null);
  const mobileDrawerSearchRef = useRef<HTMLDivElement>(null);
  const mobileHeaderInputRef = useRef<HTMLInputElement>(null);
  const mobileDrawerInputRef = useRef<HTMLInputElement>(null);

  // Focus mobile header search input when activated
  useEffect(() => {
    if (mobileSearchActive) {
      mobileHeaderInputRef.current?.focus();
    }
  }, [mobileSearchActive]);

  // Focus mobile drawer search input when menu opens
  useEffect(() => {
    if (mobileMenuOpen) {
      const timer = setTimeout(() => {
        mobileDrawerInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [mobileMenuOpen]);

  // Close mobile menu and search active state on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchActive(false);
  }, [pathname]);

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
      if (mobileDrawerSearchRef.current && !mobileDrawerSearchRef.current.contains(event.target as Node)) {
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
      router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`);
      setMobileMenuOpen(false);
      setMobileSearchActive(false);
      setDesktopFocused(false);
      setMobileFocused(false);
    }
  }

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
          <div className="flex items-center gap-8 shrink-0">
            <Link href="/" className="flex items-center text-2xl font-black tracking-tight">
              <span className="text-white">Anime</span>
              <span className="text-[#52ff7f]">PLAY</span>
            </Link>

            {/* Search bar (desktop) */}
            <div ref={desktopSearchRef} className="relative hidden lg:block flex-1 max-w-sm">
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
                <div className="absolute top-full left-0 z-50 mt-2 w-full rounded-2xl border border-white/10 bg-[#0f1012]/95 backdrop-blur-md p-2 shadow-2xl flex flex-col gap-1">
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
                              setDesktopFocused(false);
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
                            setDesktopFocused(false);
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

          {/* Nav links (desktop) */}
          <div className="hidden lg:flex items-center gap-5 text-xs font-bold uppercase tracking-wider text-white/50">
            <Link href="/search?sort=trending" className="hover:text-white transition-colors">Trending</Link>
            <Link href="/new" className="hover:text-white transition-colors text-emerald-400">New</Link>
            <Link href="/search?sort=season" className="hover:text-white transition-colors">This Season</Link>
            <Link href="/search" className="hover:text-white transition-colors">Browse</Link>
            <Link href="/genres" className="hover:text-white transition-colors">Genres</Link>
            <Link href="/types" className="hover:text-white transition-colors">Types</Link>
            <Link href="/updates" className="hover:text-white transition-colors">Schedule</Link>

            <div className="flex items-center gap-3 ml-2 border-l border-white/10 pl-5">
              <Link href="/random" className="hover:text-white transition-colors" aria-label="Random anime">
                <Shuffle className="w-4 h-4" aria-hidden="true" />
              </Link>
              <UserMenu user={user} />
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
            <UserMenu user={user} />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4 text-white/60" aria-hidden="true" />
            </button>
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

            {/* Search (mobile) */}
            <div ref={mobileDrawerSearchRef} className="px-5 py-3 border-b border-white/5 relative">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" aria-hidden="true" />
                <input
                  ref={mobileDrawerInputRef}
                  type="text"
                  value={searchValue}
                  onFocus={() => setMobileFocused(true)}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search anime…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff5500]/50"
                />
              </form>

              {isMobileFocused && searchValue.trim() && (
                <div className="absolute top-full left-5 right-5 z-50 mt-1 rounded-2xl border border-white/10 bg-[#0f1012]/98 p-2 shadow-2xl flex flex-col gap-1">
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
                              setMobileFocused(false);
                              setMobileMenuOpen(false);
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
