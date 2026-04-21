"use client";

import { useEffect } from "react";
import { ensureWatchHistoryHydrated } from "@/lib/anime/watch-history";

export default function WatchHistorySyncClient() {
  useEffect(() => {
    void ensureWatchHistoryHydrated();
  }, []);

  return null;
}
