import ProviderBadge from "@/components/anime/ProviderBadge";
import type { CatalogAnime } from "@/lib/anime/types";
import { Play } from "lucide-react";
import Link from "next/link";

interface AnimeCardProps {
  anime: CatalogAnime;
  highlightProvider?: boolean;
}

export default function AnimeCard({ anime, highlightProvider = false }: AnimeCardProps) {
  const genres = anime.genres.slice(0, 3).join(", ");
  const imageUrl = anime.poster || anime.banner || "https://placehold.co/600x900/201f1f/e5e2e1?text=KAIDO";
  const episodeCount = anime.episodeCount ? `${anime.episodeCount} EPS` : anime.type || anime.status || "ANIME";

  return (
    <Link
      href={anime.href}
      className="group relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-outline-variant/20 bg-surface-container-highest transition-all duration-300 hover:-translate-y-1 hover:shadow-ambient"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        <img
          src={imageUrl}
          alt={anime.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-highest via-transparent to-transparent opacity-80" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-14 h-14 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center border border-primary/50 shadow-ambient">
            <Play className="w-6 h-6 text-primary fill-current ml-1" />
          </div>
        </div>

        {episodeCount ? (
          <div className="absolute left-3 top-3 rounded-full bg-surface-container-low/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface backdrop-blur-sm">
            {episodeCount}
          </div>
        ) : null}
        <div className="absolute right-3 top-3">
          <ProviderBadge provider={anime.provider} active={highlightProvider} subtle={!highlightProvider} />
        </div>
      </div>

      <div className="flex flex-grow flex-col justify-end p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-on-surface transition-colors group-hover:text-primary">
          {anime.title}
        </h3>
        {genres ? (
          <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
            {genres}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
          {anime.year ? <span>{anime.year}</span> : null}
          {anime.subCount ? <span className="rounded-full bg-[#69f48d]/15 px-2 py-0.5 text-[#8dffab]">SUB {anime.subCount}</span> : null}
          {anime.dubCount ? <span className="rounded-full bg-[#ffb347]/15 px-2 py-0.5 text-[#ffd79c]">DUB {anime.dubCount}</span> : null}
        </div>
      </div>
    </Link>
  );
}
