"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Fixes the scroll position bug in Next.js App Router where navigating
 * from a scrolled page (e.g. bottom of homepage) to a new page (e.g. anime
 * detail) opens the new page at the same scroll offset instead of the top.
 *
 * Root cause: the browser's native scroll restoration (`history.scrollRestoration
 * = 'auto'`) saves the current scroll offset on navigation and then restores
 * it after Next.js finishes rendering the new page — which races with any
 * `scrollTo(0,0)` we call in a useEffect.
 *
 * Fix: set `history.scrollRestoration = 'manual'` so the browser never
 * auto-restores scroll, then call `scrollTo(0,0)` ourselves on every
 * path change. Back/forward navigation still works correctly because
 * Next.js App Router has its own scroll position stack.
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  // Disable browser scroll restoration once on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    // Skip initial mount — don't steal scroll from the first page load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Scroll to top immediately on every route change.
    // Using both `scrollTo` and rAF to cover both the synchronous paint
    // and any async layout shifts.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
  }, [pathname, searchParams]);

  return null;
}
