"use client";

import { useEffect } from "react";

/**
 * On the anime page, asks for the episode sub/dub availability the watch page needs, so the
 * DUB badges are already in the browser's cache (the response allows 5 minutes) when the viewer
 * opens the watch page. The URL must stay identical to loadEpisodeAvailability in WatchExperience.
 */
export default function WatchDataPrefetch({ anilistId }: { anilistId: number }) {
  useEffect(() => {
    if (!Number.isInteger(anilistId) || anilistId <= 0) return;
    const params = new URLSearchParams({ anilistId: String(anilistId), availabilityOnly: "1" });
    const timer = setTimeout(() => {
      void fetch(`/api/watch-page-context?${params.toString()}`, { priority: "low" } as RequestInit).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [anilistId]);
  return null;
}
