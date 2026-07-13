"use client";

import { prefetchClientStream } from "@/lib/anime/client-stream-resolver";
import type { ProviderId } from "@/lib/anime/types";
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
  episodeNumber = 1,
  provider = "anikoto",
  dubbed = false,
  server = null,
}: {
  animeId: string;
  episodeNumber?: number;
  provider?: ProviderId;
  dubbed?: boolean;
  server?: string | null;
}) {
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${animeId}:${episodeNumber}:${provider}:${dubbed ? "dub" : "sub"}:${server || "auto"}`;
    if (firedRef.current === key) return;
    firedRef.current = key;

    const timer = window.setTimeout(() => {
      prefetchClientStream({ animeId, episodeNumber, provider, dubbed, server });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [animeId, dubbed, episodeNumber, provider, server]);

  return null;
}
