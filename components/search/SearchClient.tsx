"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import AnilistCard from "@/components/anilist/AnilistCard";
import { Search, SlidersHorizontal, ChevronRight } from "lucide-react";
import type { AnilistMedia, AnilistPageInfo } from "@/lib/anilist/api";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";

interface SearchData {
  media: AnilistMedia[];
  pageInfo: AnilistPageInfo;
  availabilityHints: Record<number, CatalogAvailabilityHint>;
}

interface SearchClientProps {
  genres: string[];
}

function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-xl bg-white/[0.06]" />
      <div className="mt-2 h-4 w-3/4 rounded bg-white/[0.05]" />
      <div className="mt-1 h-3 w-1/2 rounded bg-white/[0.04]" />
    </div>
  );
}

export default function SearchClient({ genres }: SearchClientProps) {
  const searchParams = useSearchParams();

  const initialSearch = searchParams.get("q") || searchParams.get("search") || searchParams.get("keyword") || "";
  const initialGenre = searchParams.get("genre") || "";
  const initialPage = Number(searchParams.get("page")) || 1;
  const initialSort = searchParams.get("sort") || "";

  const [search, setSearch] = useState(initialSearch);
  const [genre, setGenre] = useState(initialGenre);
  const [page, setPage] = useState(initialPage);
  const [sortParam, setSortParam] = useState(initialSort);

  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state if browser Back / Forward buttons are used
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("q") || params.get("search") || params.get("keyword") || "");
      setGenre(params.get("genre") || "");
      setPage(Number(params.get("page")) || 1);
      setSortParam(params.get("sort") || "");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (genre) params.set("genre", genre);
    if (page > 1) params.set("page", String(page));
    if (sortParam) params.set("sort", sortParam);

    try {
      const res = await fetch(`/api/anilist-search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [search, genre, page, sortParam]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const updateFilter = (overrides: { q?: string; genre?: string; sort?: string; page?: string }) => {
    const newSearch = overrides.q !== undefined ? overrides.q : search;
    const newGenre = overrides.genre !== undefined ? overrides.genre : genre;
    const newSort = overrides.sort !== undefined ? overrides.sort : sortParam;
    const newPage = overrides.page !== undefined ? (Number(overrides.page) || 1) : 1;

    setSearch(newSearch);
    setGenre(newGenre);
    setSortParam(newSort);
    setPage(newPage);

    const base: Record<string, string> = {
      ...(newSearch && { q: newSearch }),
      ...(newGenre && { genre: newGenre }),
      ...(newSort && { sort: newSort }),
      ...(newPage > 1 && { page: String(newPage) }),
    };
    const qs = new URLSearchParams(base).toString();
    const href = `/search${qs ? `?${qs}` : ""}`;
    window.history.pushState(null, "", href);
  };

  const heading = genre
    ? `${genre} Anime`
    : search
    ? `Results for "${search}"`
    : sortParam === "trending"
    ? "Trending Now"
    : sortParam === "season"
    ? "This Season"
    : "Browse Anime";

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const value = (form.elements.namedItem("q") as HTMLInputElement)?.value || "";
    updateFilter({ q: value, page: "1" });
  };

  const pageInfo = data?.pageInfo ?? {
    total: 0, currentPage: page, lastPage: page, hasNextPage: false, perPage: 24,
  };

  return (
    <div className="min-h-screen bg-[#0a0b0c] text-white">
      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        {/* Header */}
        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#ff5500] mb-2">Browse</p>
          <h1 className="text-4xl font-black text-white mb-2">{heading}</h1>
          <div className="h-5 flex items-center">
            {loading ? (
              <div className="h-4 w-40 rounded animate-pulse bg-white/5" />
            ) : data && data.pageInfo.total > 0 ? (
              <p className="text-white/40 text-sm">{data.pageInfo.total.toLocaleString()} results from AniList</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-8">
          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Search box */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Search</label>
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="search-input"
                  name="q"
                  defaultValue={search}
                  key={search} // reset when navigating away
                  type="text"
                  placeholder="Search anime titles..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff5500]/50 transition-colors"
                />
              </form>
            </div>

            {/* Filters */}
            <details className="xl:open group" open={!!(genre || sortParam)}>
              <summary className="xl:hidden flex items-center gap-2 cursor-pointer text-sm font-bold text-white/60 hover:text-white transition-colors list-none [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {(genre || sortParam) && (
                  <span className="text-[10px] bg-[#ff5500]/20 text-[#ff5500] px-2 py-0.5 rounded-full font-black">Active</span>
                )}
              </summary>

              <div className="mt-4 xl:mt-0 space-y-6">
                {/* Genres */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-3">Genre</label>
                  <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto hide-scrollbar">
                    <button
                      onClick={() => updateFilter({ genre: "", page: "1" })}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-left ${
                        !genre ? "bg-[#ff5500]/20 text-[#ff5500] border border-[#ff5500]/30" : "text-white/50 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      All Genres
                    </button>
                    {genres.map((g) => (
                      <button
                        key={g}
                        onClick={() => updateFilter({ genre: g, page: "1" })}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-left ${
                          genre === g
                            ? "bg-[#ff5500]/20 text-[#ff5500] border border-[#ff5500]/30"
                            : "text-white/50 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-3">Sort By</label>
                  <div className="flex flex-col gap-1">
                    {[
                      { label: "Popularity", value: "" },
                      { label: "Trending", value: "trending" },
                      { label: "This Season", value: "season" },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => updateFilter({ sort: value, page: "1" })}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-left ${
                          sortParam === value
                            ? "bg-white/10 text-white border border-white/20"
                            : "text-white/50 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </aside>

          {/* Results */}
          <div>
            {/* Loading skeleton */}
            {loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-8">
                {Array.from({ length: 20 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="text-center py-24">
                <p className="text-5xl mb-4">⚠️</p>
                <p className="text-white/60 font-semibold">Failed to load results</p>
                <p className="text-white/30 text-sm mt-2">{error}</p>
                <button
                  onClick={fetchResults}
                  className="mt-6 px-6 py-2 rounded-full bg-[#ff5500]/20 text-[#ff5500] text-sm font-bold hover:bg-[#ff5500]/30 transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && data && data.media.length === 0 && (
              <div className="text-center py-24">
                <p className="text-6xl mb-4">🔍</p>
                <p className="text-white/40 text-lg font-semibold">No results found</p>
                <p className="text-white/20 text-sm mt-2">Try a different search term or genre</p>
                <button
                  onClick={() => updateFilter({ q: "", genre: "", sort: "", page: "1" })}
                  className="mt-6 inline-flex items-center gap-2 text-[#ff5500] text-sm font-bold hover:underline"
                >
                  Clear search <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Results grid */}
            {!loading && !error && data && data.media.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-8">
                  {data.media.map((item, i) => (
                    <AnilistCard
                      key={item.id}
                      media={item}
                      rank={i + 1 + (page - 1) * 24}
                      availability={data.availabilityHints[item.id]}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {(pageInfo.hasNextPage || page > 1) && (
                  <div className="flex items-center justify-center gap-3 mt-12">
                    {page > 1 && (
                      <button
                        onClick={() => updateFilter({ page: String(page - 1) })}
                        className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white/70 hover:text-white transition-all"
                      >
                        ← Previous
                      </button>
                    )}
                    <span className="text-white/40 text-sm">
                      Page {pageInfo.currentPage} of {pageInfo.lastPage}
                    </span>
                    {pageInfo.hasNextPage && (
                      <button
                        onClick={() => updateFilter({ page: String(page + 1) })}
                        className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white/70 hover:text-white transition-all"
                      >
                        Next →
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
