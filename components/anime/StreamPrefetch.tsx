"use client";

import { useEffect } from "react";

/**
 * Invisible prefetch component placed on the detail page.
 * When the detail page loads, this pre-warms a small episode window
 * so the first watch click and nearby episode switches feel instant.
 */
export default function StreamPrefetch({
  animeId,
  provider = "animekai",
}: {
  animeId: string;
  provider?: string;
}) {
  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        animeId,
        provider,
        episodeNumbers: [1, 2],
      }),
      signal: controller.signal,
    }).catch(() => {
      // Silently ignore — this is best-effort prefetching
    });

    return () => controller.abort();
  }, [animeId, provider]);

  return null;
}
