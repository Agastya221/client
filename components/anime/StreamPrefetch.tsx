"use client";

import { useEffect, useRef } from "react";

/**
 * Invisible prefetch component placed on the detail page.
 * When the detail page loads, this pre-warms the backend cache
 * for the first episode so the initial watch click feels instant.
 *
 * BUDGET CONTROL:
 * - Only prefetches episode 1 (the most likely first action)
 * - Skips if already fired for this animeId (deduped via ref)
 * - Best-effort: silently ignores failures
 *
 * This replaces the old approach that always warmed episodes [1, 2].
 * Episode 2 warming is now handled intent-based by WatchExperience
 * once the user actually starts watching.
 */
export default function StreamPrefetch({
  animeId,
  provider = "animekai",
}: {
  animeId: string;
  provider?: string;
}) {
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    // Deduplicate: don't fire again if we already prefetched for this animeId
    const key = `${animeId}:${provider}`;
    if (firedRef.current === key) return;
    firedRef.current = key;

    const controller = new AbortController();

    fetch("/api/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        animeId,
        provider,
        episodeNumbers: [1],
        resolveSources: true,
      }),
      signal: controller.signal,
    }).catch(() => {
      // Silently ignore — this is best-effort prefetching
    });

    return () => controller.abort();
  }, [animeId, provider]);

  return null;
}
