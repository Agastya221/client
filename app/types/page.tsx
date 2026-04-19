import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import AnilistCard from "@/components/anilist/AnilistCard";
import { searchAnilist } from "@/lib/anilist/api";
import { Film, Tv, MonitorPlay, Clapperboard, ChevronRight } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Anime Types | AnimeKAI",
  description: "Browse anime by type — TV series, Movies, OVAs, ONAs, and Specials on AnimeKAI.",
};

const FORMATS = [
  { key: "TV", label: "TV Series", icon: Tv, color: "#ff5500", desc: "Full-length anime aired on television" },
  { key: "MOVIE", label: "Movies", icon: Film, color: "#3b82f6", desc: "Feature-length anime films" },
  { key: "OVA", label: "OVA", icon: Clapperboard, color: "#a855f7", desc: "Original Video Animations released directly to home video" },
  { key: "ONA", label: "ONA", icon: MonitorPlay, color: "#22c55e", desc: "Original Net Animations — web exclusive series" },
  { key: "SPECIAL", label: "Specials", icon: Clapperboard, color: "#f59e0b", desc: "Bonus episodes, side stories, and specials" },
] as const;

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] || "" : v || "";
}

export default async function TypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const activeFormat = firstParam(query.format) || "";

  // If a format is selected, show results for it
  const selectedFormat = FORMATS.find((f) => f.key === activeFormat);

  const results = selectedFormat
    ? await searchAnilist({ sort: ["POPULARITY_DESC"], format: selectedFormat.key, perPage: 24 })
    : null;

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <Navbar />

      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#ff5500] mb-2">Categories</p>
          <h1 className="text-4xl font-black text-white mb-2">
            {selectedFormat ? selectedFormat.label : "Anime Types"}
          </h1>
          <p className="text-white/40 text-sm">
            {selectedFormat ? selectedFormat.desc : "Browse anime by format — TV series, movies, OVAs, and more."}
          </p>
        </div>

        {/* Format selector cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-12">
          {FORMATS.map((fmt) => {
            const Icon = fmt.icon;
            const isActive = activeFormat === fmt.key;
            return (
              <Link
                key={fmt.key}
                href={isActive ? "/types" : `/types?format=${fmt.key}`}
                className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                  isActive
                    ? "border-white/20 bg-white/10 shadow-lg"
                    : "border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
                }`}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${fmt.color}20`, color: fmt.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-white">{fmt.label}</p>
                <p className="text-[11px] text-white/40 mt-1 line-clamp-2">{fmt.desc}</p>
                {isActive && (
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ backgroundColor: fmt.color }} />
                )}
              </Link>
            );
          })}
        </div>

        {/* Results */}
        {results ? (
          results.media.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-white/40 text-lg font-semibold">No anime found for this type</p>
              <Link href="/types" className="mt-4 inline-flex items-center gap-2 text-[#ff5500] text-sm font-bold hover:underline">
                Back to all types <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 gap-y-8">
              {results.media.map((item, i) => (
                <AnilistCard key={item.id} media={item} rank={i + 1} />
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">👆</p>
            <p className="text-white/50 text-lg font-semibold">Select a type above to browse</p>
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
