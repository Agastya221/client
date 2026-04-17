"use client";

import Link from "next/link";
import { Search, Filter, Users, Shuffle, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  }

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#0a0b0c]/90 backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between px-4 lg:px-12 xl:px-16 gap-6">
        {/* Logo */}
        <div className="flex items-center gap-8 shrink-0">
          <Link href="/" className="flex items-center text-2xl font-black tracking-tight">
            <span className="text-white">Anime</span>
            <span className="text-[#52ff7f]">KAI</span>
          </Link>

          {/* Search bar */}
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

        {/* Nav links */}
        <div className="hidden lg:flex items-center gap-5 text-xs font-bold uppercase tracking-wider text-white/50">
          <Link href="/search?sort=trending" className="hover:text-white transition-colors">Trending</Link>
          <Link href="/search?sort=season" className="hover:text-white transition-colors">This Season</Link>
          <Link href="/search" className="hover:text-white transition-colors">Browse</Link>
          <Link href="/genres" className="hover:text-white transition-colors">Genres</Link>

          <div className="flex items-center gap-3 ml-2 border-l border-white/10 pl-5">
            <Link href="/random" className="hover:text-white transition-colors">
              <Shuffle className="w-4 h-4" />
            </Link>
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:border-[#ff5500]/50 transition-colors">
              <User className="w-4 h-4 text-white/60" />
            </div>
          </div>
        </div>

        {/* Mobile search button */}
        <Link href="/search" className="lg:hidden w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
          <Search className="w-4 h-4 text-white/60" />
        </Link>
      </div>
    </nav>
  );
}
