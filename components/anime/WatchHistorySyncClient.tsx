"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  ensureBookmarksHydrated,
  setBookmarksAuthentication,
} from "@/lib/anime/bookmarks";
import {
  ensureWatchHistoryHydrated,
  setWatchHistoryAuthentication,
} from "@/lib/anime/watch-history";

export default function WatchHistorySyncClient() {
  const { status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    const authenticated = status === "authenticated";
    setWatchHistoryAuthentication(authenticated);
    setBookmarksAuthentication(authenticated);
    if (!authenticated) return;

    void ensureWatchHistoryHydrated();
    void ensureBookmarksHydrated();
  }, [status]);

  return null;
}
