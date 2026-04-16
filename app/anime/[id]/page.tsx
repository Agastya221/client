import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import AnimeCard from "@/components/ui/AnimeCard";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getAnimeDetailModel } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { Play, Sparkles } from "lucide-react";
import Link from "next/link";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function AnimeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const preferredProvider = normalizeProviderParam(firstParam(query.provider));
  const detail = await getAnimeDetailModel(id, preferredProvider);
  const heroImage =
    detail.anime.banner ||
    detail.anime.poster ||
    "https://placehold.co/1600x900/131313/e5e2e1?text=KAIDO";
  const firstEpisode = detail.episodes[0];

  return (
    <main className="min-h-screen bg-surface-container-lowest text-on-surface">
      <Navbar />

      <section className="relative overflow-hidden pb-14 pt-24">
        <div className="absolute inset-0">
          <img src={heroImage} alt={detail.anime.title} className="h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/90 to-surface-container-lowest/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-end">
            <div className="hidden lg:block">
              <div className="overflow-hidden rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low shadow-[0_20px_40px_rgba(0,240,255,0.1)]">
                <img src={detail.anime.poster || heroImage} alt={detail.anime.title} className="aspect-[2/3] w-full object-cover" />
              </div>
            </div>

            <div className="space-y-6 py-12">
              <div className="flex flex-wrap items-center gap-3">
                <ProviderBadge provider={detail.activeProvider} active={detail.activeProvider !== "hianime"} />
                {detail.anime.type ? (
                  <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    {detail.anime.type}
                  </span>
                ) : null}
                {detail.anime.year ? (
                  <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    {detail.anime.year}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                <h1 className="max-w-4xl text-5xl font-black tracking-tight text-on-surface md:text-6xl">
                  {detail.anime.title}
                </h1>
                <p className="max-w-3xl text-base leading-relaxed text-on-surface-variant">
                  {detail.synopsis}
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                {firstEpisode ? (
                  <Link
                    href={`/anime/${id}/watch?ep=${firstEpisode.number}&provider=${detail.activeProvider}`}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Start watching
                  </Link>
                ) : null}
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 px-6 py-3 text-sm font-semibold text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  Browse another title
                </Link>
              </div>

              <div className="flex flex-wrap gap-3">
                {detail.availableProviders.map((provider) => (
                  <Link
                    key={provider}
                    href={`/anime/${id}?provider=${provider}`}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      provider === detail.activeProvider
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-outline-variant/20 bg-surface-container text-on-surface-variant hover:border-primary/30 hover:text-on-surface"
                    }`}
                  >
                    {provider}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <AttemptTrail
              attempts={detail.attempts}
              activeProvider={detail.activeProvider}
              label="Detail provider trail"
            />
          </div>
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail.metadata.map((row) => (
                <div
                  key={row.label}
                  className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                    {row.label}
                  </p>
                  <p className="mt-3 text-base font-semibold text-on-surface">{row.value}</p>
                </div>
              ))}
              {detail.anime.genres.length > 0 ? (
                <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5 md:col-span-2 xl:col-span-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                    Genres
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {detail.anime.genres.map((genre) => (
                      <Link
                        key={genre}
                        href={`/search?genre=${encodeURIComponent(genre)}`}
                        className="rounded-full border border-outline-variant/20 bg-surface-container px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        {genre}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                    Episodes
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-on-surface">Cross-provider episode map</h2>
                </div>
                <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-xs text-on-surface-variant">
                  {detail.episodes.length} episodes detected
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {detail.episodes.map((episode) => (
                  <Link
                    key={episode.number}
                    href={`/anime/${id}/watch?ep=${episode.number}&provider=${detail.activeProvider}`}
                    className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container p-4 transition-colors hover:border-primary/30"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                      Episode {episode.number}
                    </p>
                    <h3 className="mt-2 line-clamp-2 text-base font-semibold text-on-surface">
                      {episode.title}
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {episode.availableProviders.map((provider) => (
                        <ProviderBadge
                          key={`${episode.number}-${provider}`}
                          provider={provider}
                          active={provider === detail.activeProvider}
                          subtle
                        />
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-8">
            {detail.recommended.length > 0 ? (
              <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  Recommended
                </p>
                <div className="mt-5 space-y-4">
                  {detail.recommended.slice(0, 4).map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} />
                  ))}
                </div>
              </div>
            ) : null}

            {detail.related.length > 0 ? (
              <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  Related titles
                </p>
                <div className="mt-5 space-y-4">
                  {detail.related.slice(0, 3).map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} />
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
