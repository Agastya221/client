"use client";

import { useEffect } from "react";
import { ensureBookmarksHydrated } from "@/lib/anime/bookmarks";
import { ensureWatchHistoryHydrated } from "@/lib/anime/watch-history";

export default function WatchHistorySyncClient() {
  useEffect(() => {
    void ensureWatchHistoryHydrated();
    void ensureBookmarksHydrated();
  }, []);

  return null;
}
