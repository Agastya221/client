"use client";

import { useEffect } from "react";

/**
 * Invisible prefetch component placed on the detail page.
 * When the detail page loads, this fires a background request to
 * /api/resolve-source for ep1, pre-warming the server-side cache.
 * 
 * By the time the user clicks "Watch Now", the stream source is
 * already cached and the watch page loads with the stream instantly.
 */
export default function StreamPrefetch({
  animeId,
  provider = "animekai",
}: {
  animeId: string;
  provider?: string;
}) {
  useEffect(() => {
    // Fire-and-forget — we don't care about the result here,
    // we just want to warm the server cache
    const controller = new AbortController();

    fetch("/api/resolve-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        animeId,
        episodeNumber: 1,
        provider,
        dubbed: false,
        server: "",
        episodeId: "",
      }),
      signal: controller.signal,
    }).catch(() => {
      // Silently ignore — this is best-effort prefetching
    });

    return () => controller.abort();
  }, [animeId, provider]);

  return null;
}
