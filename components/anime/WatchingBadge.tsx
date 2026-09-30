"use client";

import { useEffect, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { animeWatching, viewerTimezone } from "@/lib/watching";

const REFRESH_MS = 20_000;
const DEFAULT_SPOTS = 50;

interface SiteConfig {
  enabled: boolean;
  maxMembers: number;
}

// One config request per page load of the site, shared by every badge. The number itself is
// computed here from the clock, so there is nothing to wait for: the config only rescales it
// if the open spots differ from the default.
let configPromise: Promise<SiteConfig> | null = null;
function loadConfig(): Promise<SiteConfig> {
  configPromise ??= fetch("/api/site-config")
    .then((res) => (res.ok ? res.json() : null))
    .then((data): SiteConfig => ({
      enabled: data?.watching?.enabled ?? true,
      maxMembers: Number.isFinite(data?.maxMembers) ? data.maxMembers : DEFAULT_SPOTS,
    }))
    .catch(() => ({ enabled: true, maxMembers: DEFAULT_SPOTS }));
  return configPromise;
}

/** "● 12 WATCHING": how many are on this title right now. Sizes and times itself; see lib/watching.ts. */
export default function WatchingBadge({
  seed,
  airing = false,
  accentColor = "#52ff7f",
  className = "",
}: {
  seed: string;
  airing?: boolean;
  /** The anime's own colour, like the rest of the watch page; the site green otherwise. */
  accentColor?: string;
  className?: string;
}) {
  const hydrated = useHydrated();
  const [config, setConfig] = useState<SiteConfig>({ enabled: true, maxMembers: DEFAULT_SPOTS });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    void loadConfig().then((value) => { if (alive) setConfig(value); });
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!hydrated || !config.enabled) return null;
  const count = animeWatching(seed, now, { maxMembers: config.maxMembers, timezone: viewerTimezone() }, { airing });
  if (count <= 0) return null;

  return (
    <p className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest ${className}`} aria-live="off">
      <span
        className="watching-dot h-1.5 w-1.5 shrink-0 rounded-[2px]"
        style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
        aria-hidden="true"
      />
      <span
        className="text-sm font-black tabular-nums"
        style={{ color: accentColor, textShadow: `0 0 14px color-mix(in srgb, ${accentColor} 35%, transparent)` }}
      >
        {count}
      </span>
      <span className="text-white/55">Watching</span>
    </p>
  );
}
