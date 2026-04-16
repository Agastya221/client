import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { getGenresPageModel } from "@/lib/anime/api";
import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

const GENRE_GRADIENTS = [
  "from-[#07353a] via-[#0f2022] to-[#131313]",
  "from-[#332717] via-[#20160d] to-[#131313]",
  "from-[#15233d] via-[#161829] to-[#131313]",
  "from-[#103121] via-[#14241a] to-[#131313]",
  "from-[#32141d] via-[#1d1214] to-[#131313]",
  "from-[#34241b] via-[#1a1410] to-[#131313]",
];

export default async function GenresPage() {
  const model = await getGenresPageModel();

  return (
    <main className="min-h-screen bg-surface-container-lowest text-on-surface">
      <Navbar />

      <section className="border-b border-outline-variant/20 bg-gradient-to-br from-surface-container-low to-surface-container-lowest px-6 pb-14 pt-28">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-primary">
              <Zap className="h-3.5 w-3.5" />
              Genre routes
            </span>
            <ProviderBadge provider={model.activeProvider} active={model.activeProvider !== "hianime"} />
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-black tracking-tight text-on-surface md:text-6xl">
                Browse real genres, not mock tags
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-on-surface-variant">
                These genre routes are sourced from the live provider stack. Every card lands directly on the real
                search page, so your frontend stays aligned with the fallback-enabled AnimeAPI catalog.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                Current source
              </p>
              <p className="mt-3 text-2xl font-black text-on-surface">
                {model.activeProvider === "hianime" ? "Primary genre map" : "Fallback genre map"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                When the primary provider does not return enough catalog metadata, Kaido keeps the genre links alive
                by reusing the next working provider.
              </p>
            </div>
          </div>

          <AttemptTrail
            attempts={model.attempts}
            activeProvider={model.activeProvider}
            label="Genre provider trail"
          />
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto max-w-7xl space-y-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
              Featured genres
            </p>
            <h2 className="mt-2 text-3xl font-black text-on-surface">Quick jump into the strongest lanes</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {model.featuredGenres.map((genre, index) => (
              <Link
                key={genre}
                href={`/search?genre=${encodeURIComponent(genre)}`}
                className={`group relative overflow-hidden rounded-[1.75rem] border border-outline-variant/20 bg-gradient-to-br p-6 transition-transform hover:-translate-y-1 ${GENRE_GRADIENTS[index % GENRE_GRADIENTS.length]}`}
              >
                <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "radial-gradient(circle at top right, rgba(0,240,255,0.18), transparent 45%)" }} />
                <div className="relative flex min-h-48 flex-col justify-between">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary">Genre route</p>
                    <h3 className="text-3xl font-black tracking-tight text-on-surface">{genre}</h3>
                  </div>
                  <div className="flex items-center justify-between text-sm text-on-surface-variant">
                    <span>Open live results</span>
                    <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-14">
        <div className="mx-auto max-w-7xl rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                Full tag cloud
              </p>
              <h2 className="mt-2 text-2xl font-black text-on-surface">All detected genres</h2>
            </div>
            <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-xs text-on-surface-variant">
              {model.genres.length} total tags
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            {model.genres.map((genre) => (
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
      </section>

      <SiteFooter />
    </main>
  );
}
