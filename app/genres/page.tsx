import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getAnilistGenres } from "@/lib/anilist/api";
import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse by Genre | AnimePlay",
  description: "Explore anime by genre. Find Action, Romance, Fantasy, Sci-Fi, Comedy and more — all sourced live from AniList.",
};

const GENRE_GRADIENTS = [
  "from-[#07353a] via-[#0f2022] to-[#131313]",
  "from-[#332717] via-[#20160d] to-[#131313]",
  "from-[#15233d] via-[#161829] to-[#131313]",
  "from-[#103121] via-[#14241a] to-[#131313]",
  "from-[#32141d] via-[#1d1214] to-[#131313]",
  "from-[#34241b] via-[#1a1410] to-[#131313]",
];

const FEATURED_GENRES = [
  "Action",
  "Adventure",
  "Fantasy",
  "Romance",
  "Comedy",
  "Sci-Fi",
];

export default async function GenresPage() {
  // Use AniList directly — no scraper, no AnimeKai dependency
  let genres: string[] = [];
  try {
    genres = await getAnilistGenres();
  } catch {
    // Use a hardcoded fallback if AniList is unreachable
    genres = [
      "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
      "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
    ];
  }

  const featuredGenres = FEATURED_GENRES.filter((g) => genres.includes(g) || true).slice(0, 6);

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <Navbar />

      {/* Hero */}
      <section className="border-b border-white/5 bg-gradient-to-br from-[#0f1114] to-[#0a0b0c] px-6 pb-14 pt-28">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#ff5500]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[#ff5500]">
              <Zap className="h-3.5 w-3.5" />
              Genre routes
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-white/50">
              AniList
            </span>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white md:text-6xl">
                Browse by genre
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-white/50">
                Every genre links directly to AniList search — the largest anime database with real-time episode counts and ratings.
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">
                Data source
              </p>
              <p className="mt-3 text-2xl font-black text-white">AniList</p>
              <p className="mt-2 text-sm leading-relaxed text-white/40">
                Genres are pulled live from AniList — the most accurate and up-to-date anime catalog available.
              </p>
              <p className="mt-3 text-[11px] text-white/20">
                {genres.length} genres available
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured genre cards */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-7xl space-y-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">
              Featured genres
            </p>
            <h2 className="mt-2 text-3xl font-black text-white">Quick jump into popular lanes</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredGenres.map((genre, index) => (
              <Link
                key={genre}
                href={`/search?genre=${encodeURIComponent(genre)}`}
                className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br p-6 transition-transform hover:-translate-y-1 ${GENRE_GRADIENTS[index % GENRE_GRADIENTS.length]}`}
              >
                <div
                  className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: "radial-gradient(circle at top right, rgba(255,85,0,0.12), transparent 50%)" }}
                />
                <div className="relative flex min-h-44 flex-col justify-between">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#ff5500]">Genre route</p>
                    <h3 className="text-3xl font-black tracking-tight text-white">{genre}</h3>
                  </div>
                  <div className="flex items-center justify-between text-sm text-white/40">
                    <span>Browse {genre.toLowerCase()} anime</span>
                    <ArrowRight className="h-4 w-4 text-[#ff5500] transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Full genre tag cloud */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-7xl rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">
                All genres
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">Complete genre list</h2>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/30">
              {genres.length} genres
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {genres.map((genre) => (
              <Link
                key={genre}
                href={`/search?genre=${encodeURIComponent(genre)}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/50 transition-colors hover:border-[#ff5500]/40 hover:bg-[#ff5500]/10 hover:text-[#ff5500]"
              >
                {genre}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
