import AttemptTrail from "@/components/anime/AttemptTrail";
import SearchControls from "@/components/anime/SearchControls";
import ProviderBadge from "@/components/anime/ProviderBadge";
import AnimeCard from "@/components/ui/AnimeCard";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getSearchPageModel } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parsePositiveInt(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildSearchHref(params: {
  query: string;
  genre: string;
  page: number;
  dubbed: boolean;
  provider: string;
}): string {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.genre) search.set("genre", params.genre);
  if (params.page > 1) search.set("page", String(params.page));
  if (params.dubbed) search.set("dub", "1");
  if (params.provider) search.set("provider", params.provider);
  return `/search${search.size > 0 ? `?${search.toString()}` : ""}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const genre = firstParam(params.genre).trim();
  const page = parsePositiveInt(firstParam(params.page)) || 1;
  const dubbed = firstParam(params.dub) === "1" || firstParam(params.dub) === "true";
  const provider = normalizeProviderParam(firstParam(params.provider));
  const model = await getSearchPageModel({
    query,
    genre,
    page,
    dubbed,
    provider,
  });

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <Navbar />

      <section className="border-b border-outline-variant/20 bg-gradient-to-b from-surface-container-low to-surface px-6 pb-10 pt-28">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
              Search and fallback
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="text-4xl font-black tracking-tight text-on-surface md:text-5xl">
                {model.browsingLabel}
              </h1>
              <ProviderBadge provider={model.activeProvider} active={model.activeProvider !== "hianime"} />
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-on-surface-variant md:text-base">
              Search is backed by real provider filters only. If the primary search source fails or returns nothing,
              Kaido steps down through AnimeKai and then DesiDub.
            </p>
          </div>

          <SearchControls
            query={model.query}
            genre={model.genre}
            dubbed={model.dubbed}
            provider={model.lockedProvider}
            genres={model.genres}
          />
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                Results
              </p>
              <p className="mt-2 text-sm text-on-surface-variant">
                <span className="font-semibold text-on-surface">{model.results.length}</span> cards on this page.
                {model.totalPages ? ` Page ${model.page} of ${model.totalPages}.` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {model.lockedProvider ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  Locked to {model.lockedProvider}
                </span>
              ) : (
                <span className="rounded-full border border-outline-variant/20 px-3 py-1.5 text-xs text-on-surface-variant">
                  Automatic provider fallback
                </span>
              )}
              {model.genre ? (
                <span className="rounded-full border border-outline-variant/20 px-3 py-1.5 text-xs text-on-surface-variant">
                  Genre: {model.genre}
                </span>
              ) : null}
              {model.dubbed ? (
                <span className="rounded-full border border-[#ffb347]/20 bg-[#ffb347]/10 px-3 py-1.5 text-xs text-[#ffd79c]">
                  Dub only
                </span>
              ) : null}
            </div>
          </div>

          <AttemptTrail
            attempts={model.attempts}
            activeProvider={model.activeProvider}
            label="Search provider trail"
          />

          {model.results.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low px-8 py-24 text-center">
              <Search className="h-12 w-12 text-on-surface-variant" />
              <h2 className="mt-5 text-2xl font-black text-on-surface">No anime matched this filter set</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-on-surface-variant">
                Try a broader title search, remove the dubbed-only filter, or unlock the provider so Kaido can keep
                falling back automatically.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              {model.results.map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  highlightProvider={!model.lockedProvider && anime.provider !== "hianime"}
                />
              ))}
            </div>
          )}

          {model.results.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5">
              <Link
                href={buildSearchHref({
                  query: model.query,
                  genre: model.genre,
                  page: Math.max(1, model.page - 1),
                  dubbed: model.dubbed,
                  provider: model.lockedProvider || "",
                })}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  model.page > 1
                    ? "border border-outline-variant/20 text-on-surface hover:border-primary/30 hover:text-primary"
                    : "pointer-events-none border border-outline-variant/10 text-on-surface-variant/40"
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Link>

              <p className="text-sm text-on-surface-variant">
                {model.hasNextPage || (model.totalPages && model.page < model.totalPages)
                  ? "More pages are available."
                  : "You are on the last detected page."}
              </p>

              <Link
                href={buildSearchHref({
                  query: model.query,
                  genre: model.genre,
                  page: model.page + 1,
                  dubbed: model.dubbed,
                  provider: model.lockedProvider || "",
                })}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  model.hasNextPage || (model.totalPages ? model.page < model.totalPages : true)
                    ? "border border-outline-variant/20 text-on-surface hover:border-primary/30 hover:text-primary"
                    : "pointer-events-none border border-outline-variant/10 text-on-surface-variant/40"
                }`}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
