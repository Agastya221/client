import Link from "next/link";
import { Search, Sparkles, User } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-outline-variant/20 bg-surface-variant/60 backdrop-blur-[24px]">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="text-2xl font-bold tracking-tighter text-primary">
            KAIDO<span className="text-white">.</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide">
            <Link href="/" className="text-on-surface hover:text-primary transition-colors">Home</Link>
            <Link href="/search" className="text-on-surface-variant hover:text-on-surface transition-colors">Anime</Link>
            <Link href="/genres" className="text-on-surface-variant hover:text-on-surface transition-colors">Genres</Link>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/search" className="text-on-surface-variant hover:text-primary transition-colors">
            <Search className="w-5 h-5" />
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary md:flex">
            <Sparkles className="h-3.5 w-3.5" />
            Anime fallback
          </div>
          <div className="w-9 h-9 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
            <User className="w-4 h-4 text-on-surface" />
          </div>
        </div>
      </div>
    </nav>
  );
}
