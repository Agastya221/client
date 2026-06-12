import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#080809] px-4 lg:px-12 xl:px-16 py-12">
      <div className="mx-auto max-w-7xl">
        {/* Top section */}
        <div className="flex flex-col gap-10 md:flex-row md:justify-between mb-10">
          {/* Brand */}
          <div className="space-y-3 max-w-sm">
            <p className="text-2xl font-black tracking-tight">
              <span className="text-white">Anime</span>
              <span className="text-[#52ff7f]">PLAY</span>
            </p>
            <p className="text-sm text-white/40 leading-relaxed">
              The ultimate anime streaming experience. Powered by MegaPlay, AnimePlay, TryEmbed, and MoStream — plus DesiDub for Hindi dub.
            </p>

          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Browse</p>
              <div className="flex flex-col gap-2">
                <Link href="/search?sort=trending" className="text-sm text-white/50 hover:text-white transition-colors">Trending</Link>
                <Link href="/search?sort=season" className="text-sm text-white/50 hover:text-white transition-colors">This Season</Link>
                <Link href="/ongoing" className="text-sm text-white/50 hover:text-white transition-colors">Ongoing</Link>
                <Link href="/new" className="text-sm text-white/50 hover:text-white transition-colors">New Releases</Link>
                <Link href="/types" className="text-sm text-white/50 hover:text-white transition-colors">Types</Link>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Explore</p>
              <div className="flex flex-col gap-2">
                <Link href="/genres" className="text-sm text-white/50 hover:text-white transition-colors">Genres</Link>
                <Link href="/updates" className="text-sm text-white/50 hover:text-white transition-colors">Schedule</Link>
                <Link href="/random" className="text-sm text-white/50 hover:text-white transition-colors">Random</Link>
                <Link href="/search" className="text-sm text-white/50 hover:text-white transition-colors">Search</Link>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Account</p>
              <div className="flex flex-col gap-2">
                <Link href="/my-list" className="text-sm text-white/50 hover:text-white transition-colors">My List</Link>
                <Link href="/history" className="text-sm text-white/50 hover:text-white transition-colors">Watch History</Link>
                <Link href="/auth/signin" className="text-sm text-white/50 hover:text-white transition-colors">Sign In</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} AnimePlay. For educational purposes only.
          </p>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/15">
            <span>Multi-provider</span>
            <span>•</span>
            <span>Fallback ready</span>
            <span>•</span>
            <span>Proxy playback</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
