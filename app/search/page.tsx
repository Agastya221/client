import AttemptTrail from "@/components/anime/AttemptTrail";
import SearchControls from "@/components/anime/SearchControls";
import ProviderBadge from "@/components/anime/ProviderBadge";
import SearchResultsGrid from "@/components/anime/SearchResultsGrid";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getSearchPageModel } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { Search } from "lucide-react";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parsePositiveInt(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
                <span className="font-semibold text-on-surface">{model.results.length}</span> cards loaded first.
                {model.totalPages ? ` Starting on page ${model.page} of ${model.totalPages}.` : ""}
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
            <SearchResultsGrid initialModel={model} />
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
