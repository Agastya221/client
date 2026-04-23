"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCcw, Home, ArrowLeft } from "lucide-react";

import { useEffect, useState } from "react";

export default function WatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [detailsUrl, setDetailsUrl] = useState("/");

  useEffect(() => {
    // Extract the /anime/[id] part from /anime/[id]/watch
    const path = window.location.pathname;
    const match = path.match(/^\/anime\/[^/]+/);
    if (match) {
      setDetailsUrl(match[0]);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white flex items-center justify-center p-4">
      <div className="text-center max-w-lg">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-3xl font-black mb-3">Stream Failed</h1>
        <p className="text-white/40 text-sm mb-2">
          We couldn&apos;t load this episode. The streaming provider might be temporarily unavailable.
        </p>
        {error.message && (
          <p className="text-red-400/60 text-xs font-mono bg-red-500/5 rounded-lg p-3 mb-6 border border-red-500/10">
            {error.message}
          </p>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-6 py-3 text-sm font-bold text-white hover:bg-[#e64d00] transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Retry
          </button>
          <Link
            href={detailsUrl}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Details
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
