import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import AnilistCard from "@/components/anilist/AnilistCard";
import { searchAnilist, getAnilistGenres, anilistTitle } from "@/lib/anilist/api";
import { Search, SlidersHorizontal, ChevronRight } from "lucide-react";
import Link from "next/link";

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] || "" : v || "";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const search = firstParam(query.q || query.search || query.keyword);
  const genre = firstParam(query.genre);
  const page = Number(firstParam(query.page)) || 1;
  const sortParam = firstParam(query.sort);

  const sort = sortParam === "trending" ? ["TRENDING_DESC"] :
               sortParam === "season" ? ["POPULARITY_DESC"] :
               search ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"];

  const [{ media, pageInfo }, genres] = await Promise.all([
    searchAnilist({ search: search || undefined, genre: genre || undefined, page, perPage: 24, sort }),
    getAnilistGenres(),
  ]);

  const heading = genre
    ? `${genre} Anime`
    : search
    ? `Results for "${search}"`
    : sortParam === "trending"
    ? "Trending Now"
    : sortParam === "season"
    ? "This Season"
    : "Browse Anime";

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <Navbar />

      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        {/* Header */}
        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#ff5500] mb-2">
            Browse
          </p>
          <h1 className="text-4xl font-black text-white mb-2">{heading}</h1>
          {pageInfo.total > 0 && (
            <p className="text-white/40 text-sm">{pageInfo.total.toLocaleString()} results from AniList</p>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-8">
          {/* Sidebar Filters */}
          <aside className="space-y-6">
            {/* Search box */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Search</label>
              <form method="GET" className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="search"
                  name="q"
                  defaultValue={search}
                  type="text"
                  placeholder="Search anime titles..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff5500]/50 transition-colors"
                />
                {genre && <input type="hidden" name="genre" value={genre} />}
              </form>
            </div>

            {/* Genres */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-3">Genre</label>
              <div className="flex flex-col gap-1">
                <Link
                  href={search ? `/search?q=${encodeURIComponent(search)}` : "/search"}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    !genre ? "bg-[#ff5500]/20 text-[#ff5500] border border-[#ff5500]/30" : "text-white/50 hover:text-white hover:bg-white/5"
                  }`}
                >
                  All Genres
                </Link>
                {genres.map((g) => (
                  <Link
                    key={g}
                    href={search ? `/search?q=${encodeURIComponent(search)}&genre=${encodeURIComponent(g)}` : `/search?genre=${encodeURIComponent(g)}`}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      genre === g
                        ? "bg-[#ff5500]/20 text-[#ff5500] border border-[#ff5500]/30"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {g}
                  </Link>
                ))}
              </div>
            </div>

            {/* Quick sort */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-3">Sort By</label>
              <div className="flex flex-col gap-1">
                {[
                  { label: "Popularity", value: "" },
                  { label: "Trending", value: "trending" },
                  { label: "This Season", value: "season" },
                ].map(({ label, value }) => (
                  <Link
                    key={value}
                    href={`/search${genre ? `?genre=${encodeURIComponent(genre)}&sort=${value}` : `?sort=${value}`}`}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      sortParam === value
                        ? "bg-white/10 text-white border border-white/20"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          {/* Results Grid */}
          <div>
            {media.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-6xl mb-4">🔍</p>
                <p className="text-white/40 text-lg font-semibold">No results found</p>
                <p className="text-white/20 text-sm mt-2">Try a different search term or genre</p>
                <Link href="/search" className="mt-6 inline-flex items-center gap-2 text-[#ff5500] text-sm font-bold hover:underline">
                  Clear search <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-8">
                  {media.map((item, i) => (
                    <AnilistCard key={item.id} media={item} rank={i + 1} />
                  ))}
                </div>

                {/* Pagination */}
                {(pageInfo.hasNextPage || page > 1) && (
                  <div className="flex items-center justify-center gap-3 mt-12">
                    {page > 1 && (
                      <Link
                        href={`/search?${new URLSearchParams({ ...(search && { q: search }), ...(genre && { genre }), ...(sortParam && { sort: sortParam }), page: String(page - 1) })}`}
                        className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white/70 hover:text-white transition-all"
                      >
                        ← Previous
                      </Link>
                    )}
                    <span className="text-white/40 text-sm">Page {page} of {pageInfo.lastPage}</span>
                    {pageInfo.hasNextPage && (
                      <Link
                        href={`/search?${new URLSearchParams({ ...(search && { q: search }), ...(genre && { genre }), ...(sortParam && { sort: sortParam }), page: String(page + 1) })}`}
                        className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white/70 hover:text-white transition-all"
                      >
                        Next →
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
