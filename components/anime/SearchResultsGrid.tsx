"use client";

import type { SearchPageModel } from "@/lib/anime/types";
import AnimeCard from "@/components/ui/AnimeCard";
import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

interface SearchResultsGridProps {
  initialModel: SearchPageModel;
}

function buildSearchFeedUrl(model: SearchPageModel, page: number): string {
  const params = new URLSearchParams();
  if (model.query) params.set("q", model.query);
  if (model.genre) params.set("genre", model.genre);
  if (page > 1) params.set("page", String(page));
  if (model.dubbed) params.set("dub", "1");
  if (model.lockedProvider) params.set("provider", model.lockedProvider);
  return `/api/search-feed?${params.toString()}`;
}

function canLoadMore(model: SearchPageModel): boolean {
  return Boolean(model.hasNextPage || (model.totalPages ? model.page < model.totalPages : false));
}

export default function SearchResultsGrid({ initialModel }: SearchResultsGridProps) {
  const [results, setResults] = useState(initialModel.results);
  const [page, setPage] = useState(initialModel.page);
  const [hasMore, setHasMore] = useState(canLoadMore(initialModel));
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setResults(initialModel.results);
    setPage(initialModel.page);
    setHasMore(canLoadMore(initialModel));
    setIsLoading(false);
    setLoadError(null);
  }, [initialModel]);

  const loadNextPage = useEffectEvent(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(buildSearchFeedUrl(initialModel, page + 1), {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as SearchPageModel | { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload && "message" in payload && payload.message ? payload.message : "Unable to load more results");
      }

      const nextPage = payload as SearchPageModel;

      setResults((current) => {
        const seen = new Set(current.map((anime) => anime.id));
        const additions = nextPage.results.filter((anime) => !seen.has(anime.id));
        return [...current, ...additions];
      });
      setPage(nextPage.page);
      setHasMore(canLoadMore(nextPage));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load more results");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadNextPage]);

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low px-8 py-24 text-center">
        <Search className="h-12 w-12 text-on-surface-variant" />
        <h2 className="mt-5 text-2xl font-black text-on-surface">No anime matched this filter set</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-on-surface-variant">
          Try a broader title search, remove the dubbed-only filter, or unlock the provider so Kaido can keep
          falling back automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {results.map((anime) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            highlightProvider={!initialModel.lockedProvider && anime.provider !== "hianime"}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5 text-center">
        <p className="text-sm text-on-surface-variant">
          Loaded <span className="font-semibold text-on-surface">{results.length}</span> results so far.
          {hasMore ? " Scroll to keep loading more." : " You have reached the end of the detected results."}
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>Loading more anime...</span>
          </div>
        ) : null}

        {loadError ? (
          <div className="space-y-3">
            <p className="text-sm text-[#ffd79c]">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadNextPage()}
              className="rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/50"
            >
              Retry load
            </button>
          </div>
        ) : null}

        <div ref={sentinelRef} className="h-2 w-full" aria-hidden />
      </div>
    </div>
  );
}
