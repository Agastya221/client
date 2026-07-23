"use client";

import AnilistCard from "@/components/anilist/AnilistCard";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";
import type { AnilistMedia, AnilistPageInfo } from "@/lib/anilist/api";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ViewTransition, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface BrowseData {
  media: AnilistMedia[];
  pageInfo: AnilistPageInfo;
  availabilityHints: Record<number, CatalogAvailabilityHint>;
}

type FilterKey = "genre" | "format" | "status" | "season" | "year" | "language" | "sort";

interface BrowseFilters {
  q: string;
  genre: string;
  format: string;
  status: string;
  season: string;
  year: string;
  language: string;
  sort: string;
  page: number;
}

const EMPTY_FILTERS: BrowseFilters = {
  q: "",
  genre: "",
  format: "",
  status: "",
  season: "",
  year: "",
  language: "",
  sort: "popular",
  page: 1,
};

const FILTER_OPTIONS: Record<Exclude<FilterKey, "genre" | "year">, { label: string; value: string }[]> = {
  format: [
    { label: "All types", value: "" },
    { label: "TV", value: "TV" },
    { label: "Movie", value: "MOVIE" },
    { label: "OVA", value: "OVA" },
    { label: "ONA", value: "ONA" },
    { label: "Special", value: "SPECIAL" },
    { label: "Music", value: "MUSIC" },
  ],
  status: [
    { label: "All statuses", value: "" },
    { label: "Airing", value: "RELEASING" },
    { label: "Finished", value: "FINISHED" },
    { label: "Upcoming", value: "NOT_YET_RELEASED" },
    { label: "Hiatus", value: "HIATUS" },
  ],
  season: [
    { label: "All seasons", value: "" },
    { label: "Winter", value: "WINTER" },
    { label: "Spring", value: "SPRING" },
    { label: "Summer", value: "SUMMER" },
    { label: "Fall", value: "FALL" },
  ],
  language: [
    { label: "All languages", value: "" },
    { label: "Japanese", value: "JP" },
    { label: "Chinese", value: "CN" },
    { label: "Korean", value: "KR" },
  ],
  sort: [
    { label: "Most popular", value: "popular" },
    { label: "Trending", value: "trending" },
    { label: "This season", value: "season" },
    { label: "Highest rated", value: "score" },
    { label: "Newest", value: "newest" },
    { label: "Title A–Z", value: "title" },
  ],
};

const FILTER_LABELS: Record<FilterKey, string> = {
  genre: "Genre",
  format: "Type",
  status: "Status",
  season: "Season",
  year: "Year",
  language: "Language",
  sort: "Sort",
};

const resultCache = new Map<string, BrowseData>();

function filtersFromLocation(): BrowseFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    genre: params.get("genre") || "",
    format: params.get("format") || "",
    status: params.get("status") || "",
    season: params.get("season") || "",
    year: params.get("year") || "",
    language: params.get("language") || "",
    sort: params.get("sort") || "popular",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
}

function buildQuery(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.format) params.set("format", filters.format);
  if (filters.status) params.set("status", filters.status);
  if (filters.season) params.set("season", filters.season);
  if (filters.year) params.set("year", filters.year);
  if (filters.language) params.set("language", filters.language);
  if (filters.sort && filters.sort !== "popular") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}

function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-xl border border-white/[0.04] bg-white/[0.055]" />
      <div className="mt-2 h-4 w-4/5 rounded bg-white/[0.05]" />
      <div className="mt-2 h-3 w-2/5 rounded bg-white/[0.035]" />
    </div>
  );
}

function GlassSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="ap-glass-control h-11 w-full appearance-none px-3 pr-9 text-xs font-bold text-white/80 outline-none focus:border-white/30"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#121318] text-white">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
      </span>
    </label>
  );
}

export default function BrowseExperience({
  genres,
  embedded = true,
}: {
  genres: string[];
  embedded?: boolean;
}) {
  const [filters, setFilters] = useState<BrowseFilters>(() => filtersFromLocation());
  const [data, setData] = useState<BrowseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resultKey, setResultKey] = useState("initial");
  const requestRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => buildQuery(filters), [filters]);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear() + 1;
    return [
      { label: "All years", value: "" },
      ...Array.from({ length: currentYear - 1940 + 1 }, (_, index) => {
        const year = String(currentYear - index);
        return { label: year, value: year };
      }),
    ];
  }, []);

  const fetchResults = useCallback(async (force = false) => {
    const cached = resultCache.get(query);
    if (cached && !force) {
      startTransition(() => {
        setData(cached);
        setResultKey(query || "popular");
        setLoading(false);
        setError(null);
      });
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/anilist-search?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Browse request failed (${response.status})`);
      const payload = await response.json() as BrowseData;
      resultCache.set(query, payload);
      startTransition(() => {
        setData(payload);
        setResultKey(query || "popular");
      });
    } catch (fetchError) {
      if ((fetchError as Error).name !== "AbortError") {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load anime");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchResults();
    return () => requestRef.current?.abort();
  }, [fetchResults]);

  const updateFilters = useCallback((updates: Partial<BrowseFilters>) => {
    setFilters((current) => ({
      ...current,
      ...updates,
      page: updates.page ?? 1,
    }));
  }, []);

  useEffect(() => {
    if (embedded) {
      const params = new URLSearchParams(query);
      const ordered = new URLSearchParams();
      ordered.set("view", "browse");
      params.forEach((value, key) => ordered.set(key, value));
      window.history.replaceState(null, "", `/?${ordered.toString()}`);
      return;
    }
    window.history.replaceState(null, "", `/search${query ? `?${query}` : ""}`);
  }, [embedded, query]);

  const clearAll = () => {
    if (searchInputRef.current) searchInputRef.current.value = "";
    updateFilters({ ...EMPTY_FILTERS });
  };

  const activeFilters = (Object.keys(FILTER_LABELS) as FilterKey[])
    .filter((key) => {
      const value = filters[key];
      if (!value) return false;
      return key !== "sort" || value !== "popular";
    });

  const selectedLabel = (key: FilterKey, value: string) => {
    if (key === "genre" || key === "year") return value;
    return FILTER_OPTIONS[key].find((option) => option.value === value)?.label || value;
  };

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateFilters({ q: searchInputRef.current?.value.trim() || "" });
  };

  const pageInfo = data?.pageInfo;

  return (
    <section className={`min-h-[calc(100svh-4rem)] bg-[#0a0b0c] px-4 pb-16 text-white lg:px-12 xl:px-16 ${
      embedded ? "pt-8 lg:pt-10" : "pt-24 lg:pt-28"
    }`}>
      <div className="mx-auto max-w-[112rem]">
        <header className="mb-7 sm:mb-9">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Discover</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Browse Anime</h1>
              <p className="mt-2 min-h-5 text-xs font-medium text-white/40 sm:text-sm">
                {pageInfo?.total ? `${pageInfo.total.toLocaleString()} titles match your filters` : "Find your next anime"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="ap-glass-button inline-flex h-10 items-center gap-2 px-4 text-xs font-bold lg:hidden"
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilters.length > 0 ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px]">{activeFilters.length}</span>
              ) : null}
            </button>
          </div>
        </header>

        <div className="ap-glass-panel mb-7 overflow-hidden p-3 sm:p-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search anime</span>
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                ref={searchInputRef}
                defaultValue={filters.q}
                placeholder="Search anime titles…"
                className="ap-glass-control h-11 w-full pl-10 pr-4 text-sm font-medium text-white outline-none placeholder:text-white/28 focus:border-white/30"
              />
            </label>
            <button type="submit" className="ap-glass-button h-11 px-5 text-xs font-black">
              Search
            </button>
          </form>

          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:mt-4 lg:grid-rows-[1fr] lg:opacity-100 ${
              filtersOpen
                ? "visible mt-4 grid-rows-[1fr] opacity-100"
                : "invisible grid-rows-[0fr] opacity-0 lg:visible lg:mt-4"
            }`}
          >
            <div className="min-h-0">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <GlassSelect
                  label="Genre"
                  value={filters.genre}
                  options={[{ label: "All genres", value: "" }, ...genres.map((genre) => ({ label: genre, value: genre }))]}
                  onChange={(genre) => updateFilters({ genre })}
                />
                <GlassSelect label="Type" value={filters.format} options={FILTER_OPTIONS.format} onChange={(format) => updateFilters({ format })} />
                <GlassSelect label="Status" value={filters.status} options={FILTER_OPTIONS.status} onChange={(status) => updateFilters({ status })} />
                <GlassSelect label="Season" value={filters.season} options={FILTER_OPTIONS.season} onChange={(season) => updateFilters({ season })} />
                <GlassSelect label="Year" value={filters.year} options={yearOptions} onChange={(year) => updateFilters({ year })} />
                <GlassSelect label="Language" value={filters.language} options={FILTER_OPTIONS.language} onChange={(language) => updateFilters({ language })} />
                <GlassSelect label="Sort order" value={filters.sort} options={FILTER_OPTIONS.sort} onChange={(sort) => updateFilters({ sort })} />
              </div>
            </div>
          </div>

          {activeFilters.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
              {activeFilters.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateFilters({ [key]: key === "sort" ? "popular" : "" })}
                  className="ap-glass-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white/72"
                >
                  <Check className="h-3 w-3 text-white/45" />
                  {FILTER_LABELS[key]}: {selectedLabel(key, filters[key])}
                  <X className="h-3 w-3 text-white/45" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className="px-2 py-1 text-[10px] font-black text-white/42 transition-colors hover:text-white">
                Clear All
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative min-h-80">
          {loading && !data ? (
            <div className="grid grid-cols-2 gap-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: 18 }).map((_, index) => <CardSkeleton key={index} />)}
            </div>
          ) : null}

          {error && !data ? (
            <div className="ap-glass-panel flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-bold text-white/65">Browse results could not be loaded.</p>
              <p className="mt-2 text-xs text-white/35">{error}</p>
              <button type="button" onClick={() => void fetchResults(true)} className="ap-glass-button mt-5 px-5 py-2.5 text-xs font-black">
                Try again
              </button>
            </div>
          ) : null}

          {data ? (
            <ViewTransition key={resultKey} name="browse-results" share="auto" default="none">
              <div className={`transition-opacity duration-200 ${loading ? "opacity-45" : "opacity-100"}`}>
                {data.media.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {data.media.map((media, index) => (
                      <AnilistCard
                        key={media.id}
                        media={media}
                        rank={index + 1 + (filters.page - 1) * 24}
                        availability={data.availabilityHints[media.id]}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="ap-glass-panel flex min-h-72 flex-col items-center justify-center px-6 text-center">
                    <Search className="h-8 w-8 text-white/25" />
                    <p className="mt-4 text-sm font-bold text-white/65">No anime match this filter set.</p>
                    <button type="button" onClick={clearAll} className="ap-glass-button mt-5 px-5 py-2.5 text-xs font-black">
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </ViewTransition>
          ) : null}

          {loading && data ? (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
              <span className="ap-glass-pill inline-flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-white/70">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Updating results
              </span>
            </div>
          ) : null}
        </div>

        {pageInfo && data?.media.length ? (
          <div className="mt-12 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={filters.page <= 1 || loading}
              onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
              className="ap-glass-button flex h-10 items-center gap-2 px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="ap-glass-pill px-4 py-2.5 text-xs font-bold text-white/55">
              {pageInfo.currentPage} / {pageInfo.lastPage}
            </span>
            <button
              type="button"
              disabled={!pageInfo.hasNextPage || loading}
              onClick={() => updateFilters({ page: filters.page + 1 })}
              className="ap-glass-button flex h-10 items-center gap-2 px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
