"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

export default function AnimeDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-3xl font-black mb-3">Anime Not Found</h1>
        <p className="text-white/40 text-sm mb-8">
          We couldn&apos;t load this anime. It may not be available from our providers, or the page may have moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-6 py-3 text-sm font-bold text-white hover:bg-[#e64d00] transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
        </div>
      </div>
    </main>
  );
}
