import Link from "next/link";
import { Search, Sparkles, User } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/8 bg-[#16141d]/72 backdrop-blur-[24px]">
      <div className="mx-auto flex h-20 max-w-[92rem] items-center justify-between px-6">
        <div className="flex items-center gap-12">
          <Link href="/" className="text-2xl font-bold tracking-tighter text-[#52ff7f]">
            KAIDO<span className="text-white">.</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide">
            <Link href="/" className="text-white hover:text-[#52ff7f] transition-colors">Home</Link>
            <Link href="/search" className="text-white/65 hover:text-white transition-colors">Anime</Link>
            <Link href="/genres" className="text-white/65 hover:text-white transition-colors">Genres</Link>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/search" className="text-white/65 hover:text-[#52ff7f] transition-colors">
            <Search className="w-5 h-5" />
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-[#52ff7f] md:flex">
            <Sparkles className="h-3.5 w-3.5" />
            Anime fallback
          </div>
          <div className="w-9 h-9 rounded-full bg-white/6 border border-white/10 flex items-center justify-center cursor-pointer hover:border-[#52ff7f]/35 transition-colors">
            <User className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </nav>
  );
}
