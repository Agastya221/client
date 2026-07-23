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
import { configureAnilistListEntryCache } from "@/lib/anilist/list-entry-client";

export default function WatchHistorySyncClient() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    const authenticated = status === "authenticated";
    configureAnilistListEntryCache(authenticated ? session?.user?.id : null);
    setWatchHistoryAuthentication(authenticated);
    setBookmarksAuthentication(authenticated);
    if (!authenticated) return;

    void ensureWatchHistoryHydrated();
    void ensureBookmarksHydrated();
  }, [session?.user?.id, status]);

  return null;
}
