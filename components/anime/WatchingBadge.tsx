"use client";

import { useEffect, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { DEFAULT_WATCHING, type WatchingSettings } from "@/lib/access/settings";
import { animeWatching } from "@/lib/watching";

const REFRESH_MS = 20_000;

// One config request per page load of the site, shared by every badge. The number itself
// is computed here from the clock, so there is nothing to wait for: the settings only
// adjust it if they differ from the defaults.
let configPromise: Promise<WatchingSettings> | null = null;
function loadConfig(): Promise<WatchingSettings> {
  configPromise ??= fetch("/api/site-config")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data?.watching ? { ...DEFAULT_WATCHING, ...data.watching } : DEFAULT_WATCHING))
    .catch(() => DEFAULT_WATCHING);
  return configPromise;
}

/** "● 12 WATCHING": how many are on this title right now, following the time of day. */
export default function WatchingBadge({ seed, className = "" }: { seed: string; className?: string }) {
  const hydrated = useHydrated();
  const [settings, setSettings] = useState<WatchingSettings>(DEFAULT_WATCHING);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    void loadConfig().then((value) => { if (alive) setSettings(value); });
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!hydrated || !settings.enabled) return null;
  const count = animeWatching(seed, now, settings);
  if (count <= 0) return null;

  return (
    <p className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest ${className}`} aria-live="off">
      <span className="h-1.5 w-1.5 shrink-0 bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.8)]" aria-hidden="true" />
      <span className="text-sm font-black tabular-nums text-lime-400">{count}</span>
      <span className="text-white/55">Watching</span>
    </p>
  );
}
