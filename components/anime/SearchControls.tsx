"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ProviderId } from "@/lib/anime/types";
import { humanizeProviderId } from "@/lib/anime/utils";

interface SearchControlsProps {
  query: string;
  genre: string;
  dubbed: boolean;
  provider: ProviderId | null;
  genres: string[];
}

export default function SearchControls({
  query,
  genre,
  dubbed,
  provider,
  genres,
}: SearchControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [draftQuery, setDraftQuery] = useState(query);
  const [isPending, startTransition] = useTransition();

  const pushParams = (next: {
    query?: string;
    genre?: string;
    dubbed?: boolean;
    provider?: ProviderId | null;
  }) => {
    const params = new URLSearchParams();
    const nextQuery = next.query ?? draftQuery;
    const nextGenre = next.genre ?? genre;
    const nextDubbed = next.dubbed ?? dubbed;
    const nextProvider = next.provider === undefined ? provider : next.provider;

    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextGenre) params.set("genre", nextGenre);
    if (nextDubbed) params.set("dub", "1");
    if (nextProvider) params.set("provider", nextProvider);

    startTransition(() => {
      router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  };

  return (
    <div className="space-y-5 rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5 shadow-ambient">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          pushParams({ query: draftQuery });
        }}
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-variant" />
        <input
          id="search-input-main"
          name="search-input-main"
          type="search"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="Search anime titles..."
          className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container px-12 py-4 text-base text-on-surface outline-none transition-colors focus:border-primary/40"
        />
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
            Genre
          </span>
          <select
            value={genre}
            onChange={(event) => pushParams({ genre: event.target.value })}
            className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40"
          >
            <option value="">All genres</option>
            {genres.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
            Provider
          </span>
          <select
            value={provider || ""}
            onChange={(event) =>
              pushParams({
                provider: event.target.value ? (event.target.value as ProviderId) : null,
              })
            }
            className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40"
          >
            <option value="">Automatic fallback</option>
            {(["hianime", "animekai", "desidub"] as ProviderId[]).map((entry) => (
              <option key={entry} value={entry}>
                {humanizeProviderId(entry)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
            Audio
          </span>
          <button
            type="button"
            onClick={() => pushParams({ dubbed: !dubbed })}
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
              dubbed
                ? "border-[#ffb347]/30 bg-[#ffb347]/10 text-[#ffd79c]"
                : "border-outline-variant/20 bg-surface-container text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>{dubbed ? "Dubbed only" : "Sub + dub"}</span>
            <span className="text-[10px] uppercase tracking-[0.24em]">{dubbed ? "On" : "Off"}</span>
          </button>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {genres.slice(0, 12).map((entry) => {
          const active = entry === genre;
          return (
            <button
              key={entry}
              type="button"
              onClick={() => pushParams({ genre: active ? "" : entry })}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-outline-variant/20 bg-surface-container text-on-surface-variant hover:border-primary/30 hover:text-on-surface"
              }`}
            >
              {entry}
            </button>
          );
        })}
      </div>

      {isPending ? (
        <p className="text-xs text-on-surface-variant">Refreshing results...</p>
      ) : null}
    </div>
  );
}
