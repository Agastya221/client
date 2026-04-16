import Link from "next/link";
import { Search, Filter, Users, Shuffle, User } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#161616]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[95rem] items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center text-2xl font-black tracking-tight">
            <span className="text-white">Anime</span>
            <span className="text-[#52ff7f]">KAI</span>
          </Link>

          <div className="hidden items-center gap-2 rounded-full bg-[#1b1c20] px-4 py-2 border border-white/5 lg:flex flex-1 max-w-sm">
            <Search className="w-4 h-4 text-white/50" />
            <input 
              type="text" 
              placeholder="Search anime" 
              className="bg-transparent text-sm text-white focus:outline-none w-full ml-2 placeholder:text-white/30"
            />
            <button className="flex items-center gap-1 text-[10px] font-bold text-white/50 hover:text-white transition-colors uppercase ml-2 border-l border-white/10 pl-3">
              <Filter className="w-3 h-3" />
              Filter
            </button>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-5 text-xs font-bold uppercase tracking-wider text-white/70">
          <Link href="/social" className="hover:text-white transition-colors">
            <Users className="w-4 h-4" />
          </Link>
          <Link href="/random" className="hover:text-white transition-colors">
            <Shuffle className="w-4 h-4" />
          </Link>
          <Link href="/genres" className="hover:text-white transition-colors">Genres</Link>
          <Link href="/types" className="hover:text-white transition-colors">Types</Link>
          <Link href="/new" className="hover:text-white transition-colors">New Releases</Link>
          <Link href="/updates" className="hover:text-white transition-colors">Updates</Link>
          <Link href="/ongoing" className="hover:text-white transition-colors">Ongoing</Link>
          <Link href="/recent" className="hover:text-white transition-colors">Recent</Link>
          
          <div className="flex items-center ml-2 bg-[#20222a] rounded-full p-1 border border-white/5">
            <button className="px-3 py-1 rounded-full bg-primary text-white text-[10px] font-black">EN</button>
            <button className="px-3 py-1 rounded-full text-white/50 hover:text-white text-[10px] font-black transition-colors">JP</button>
          </div>

          <div className="ml-2 w-8 h-8 rounded-full bg-[#20222a] border border-white/10 flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
            <User className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </nav>
  );
}
