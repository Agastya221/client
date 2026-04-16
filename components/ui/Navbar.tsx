import Link from "next/link";
import { Search, Sparkles, User } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/8 bg-black/45 backdrop-blur-[24px]">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="text-2xl font-black tracking-[-0.08em] text-primary">
            KAIDO<span className="text-white">.</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[13px] font-semibold uppercase tracking-[0.22em]">
            <Link href="/" className="text-on-surface hover:text-primary transition-colors">Home</Link>
            <Link href="/search" className="text-on-surface-variant hover:text-on-surface transition-colors">Anime</Link>
            <Link href="/genres" className="text-on-surface-variant hover:text-on-surface transition-colors">Genres</Link>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/search" className="rounded-full border border-white/10 bg-white/5 p-2.5 text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary">
            <Search className="w-5 h-5" />
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary md:flex">
            <Sparkles className="h-3.5 w-3.5" />
            Watch smarter
          </div>
          <div className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-primary">
            <User className="w-4 h-4 text-on-surface" />
          </div>
        </div>
      </div>
    </nav>
  );
}
