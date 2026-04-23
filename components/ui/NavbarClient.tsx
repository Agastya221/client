"use client";

import Link from "next/link";
import { Search, Shuffle, X, Menu, TrendingUp, Calendar, Radio, Sparkles, Film, Home, Bell, Tag, Library } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import UserMenu from "@/components/ui/UserMenu";

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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`);
      setMobileMenuOpen(false);
    }
  }

  return (
    <>
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#0a0b0c]/90 backdrop-blur-md">
        <div className="flex h-16 w-full items-center justify-between px-4 lg:px-12 xl:px-16 gap-6">
          {/* Logo */}
          <div className="flex items-center gap-8 shrink-0">
            <Link href="/" className="flex items-center text-2xl font-black tracking-tight">
              <span className="text-white">Anime</span>
              <span className="text-[#52ff7f]">KAI</span>
            </Link>

            {/* Search bar (desktop) */}
            <form
              onSubmit={handleSearch}
              className="hidden items-center gap-2 rounded-full bg-white/5 hover:bg-white/8 px-4 py-2 border border-white/5 hover:border-white/10 lg:flex flex-1 max-w-sm transition-all"
            >
              <Search className="w-4 h-4 text-white/40 shrink-0" />
              <input
                id="navbar-search"
                name="q"
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search anime..."
                className="bg-transparent text-sm text-white focus:outline-none w-full placeholder:text-white/30"
              />
              {searchValue && (
                <button type="button" onClick={() => setSearchValue("")} className="shrink-0">
                  <X className="w-3.5 h-3.5 text-white/40 hover:text-white transition-colors" />
                </button>
              )}
            </form>
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
              <Link href="/random" className="hover:text-white transition-colors">
                <Shuffle className="w-4 h-4" />
              </Link>
              <UserMenu user={user} />
            </div>
          </div>

          {/* Mobile: hamburger + user */}
          <div className="lg:hidden flex items-center gap-2">
            <Link href="/search" className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
              <Search className="w-4 h-4 text-white/60" />
            </Link>
            <UserMenu user={user} />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors"
            >
              <Menu className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Menu panel */}
          <div className="absolute right-0 top-0 bottom-0 w-[80%] max-w-sm bg-[#0f1012] border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="text-lg font-black text-white">
                Anime<span className="text-[#52ff7f]">KAI</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* Search (mobile) */}
            <div className="px-5 py-3 border-b border-white/5">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search anime..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff5500]/50"
                />
              </form>
            </div>

            {/* Links */}
            <div className="flex-1 overflow-y-auto py-2">
              <Link
                href="/"
                className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Home className="w-4 h-4 text-white/40" />
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
                    <Icon className="w-4 h-4 text-white/40" />
                    {link.label}
                  </Link>
                );
              })}

              <div className="border-t border-white/5 mt-2 pt-2">
                <Link
                  href="/random"
                  className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Shuffle className="w-4 h-4 text-[#ff5500]" />
                  Random Anime
                </Link>
                <Link
                  href="/my-list"
                  className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg leading-none">🔖</span>
                  My List
                </Link>
                <Link
                  href="/history"
                  className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg leading-none">📜</span>
                  Watch History
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
