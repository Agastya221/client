import Link from "next/link";
import { Search, Home, Shuffle } from "lucide-react";
import Navbar from "@/components/ui/Navbar";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <Navbar />

      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
        {/* Big 404 */}
        <div className="relative mb-8">
          <span className="text-[12rem] font-black text-white/[0.03] leading-none select-none">404</span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl">😵</span>
          </div>
        </div>

        <h1 className="text-3xl font-black mb-3">Page Not Found</h1>
        <p className="text-white/40 text-sm max-w-md mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved. Maybe try searching for what you need?
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-6 py-3 text-sm font-bold text-white hover:bg-[#e64d00] transition-colors"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
          >
            <Search className="w-4 h-4" />
            Search Anime
          </Link>
          <Link
            href="/random"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
          >
            <Shuffle className="w-4 h-4" />
            Random Anime
          </Link>
        </div>
      </div>
    </main>
  );
}
