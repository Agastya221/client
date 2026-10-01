"use client";

import { useEffect, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { siteWatching, viewerTimezone } from "@/lib/watching";

const REFRESH_MS = 20_000;
const ACCENT = "#52ff7f";

// One request per page load for the on/off switch in the admin panel. The number itself is
// computed here from the clock, so there is nothing to wait for.
let enabledPromise: Promise<boolean> | null = null;
function loadEnabled(): Promise<boolean> {
  enabledPromise ??= fetch("/api/site-config")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.watching?.enabled ?? true)
    .catch(() => true);
  return enabledPromise;
}

/** "● 27 WATCHING" for the header: one site-wide figure, never above 45. See lib/watching.ts. */
export default function SiteWatching({ className = "" }: { className?: string }) {
  const hydrated = useHydrated();
  const [enabled, setEnabled] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    void loadEnabled().then((value) => { if (alive) setEnabled(value); });
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!hydrated || !enabled) return null;
  const count = siteWatching(now, { timezone: viewerTimezone() });

  return (
    <p
      className={`flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.07] px-3 text-[11px] font-bold uppercase tracking-widest ${className}`}
      aria-live="off"
    >
      <span
        className="watching-dot h-1.5 w-1.5 shrink-0 rounded-[2px]"
        style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
        aria-hidden="true"
      />
      <span
        className="text-sm font-black tabular-nums"
        style={{ color: ACCENT, textShadow: `0 0 14px color-mix(in srgb, ${ACCENT} 35%, transparent)` }}
      >
        {count}
      </span>
      <span className="sr-only text-white/55 sm:not-sr-only">Watching</span>
    </p>
  );
}
