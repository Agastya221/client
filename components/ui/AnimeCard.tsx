import type { CatalogAnime } from "@/lib/anime/types";
import Link from "next/link";
import { Play } from "lucide-react";

interface AnimeCardProps {
  anime: CatalogAnime;
  highlightProvider?: boolean;
}

export default function AnimeCard({ anime, highlightProvider = false }: AnimeCardProps) {
  const imageUrl = anime.poster || anime.banner || "https://placehold.co/600x900/201f1f/e5e2e1?text=Anime";
  const type = anime.type || "TV";

  return (
    <Link
      href={anime.href}
      className="group relative flex flex-col gap-2 transition-all duration-300 w-full"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-[#20222a]">
        <img
          src={imageUrl}
          alt={anime.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        
        {/* Play Icon Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[#ff5500] flex items-center justify-center pl-1 text-white shadow-lg">
            <Play className="w-6 h-6 fill-current" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 flex-1 mt-1">
        <h3 className="line-clamp-2 text-[14px] font-bold text-white group-hover:text-[#ff5500] transition-colors leading-tight">
          {anime.title}
        </h3>
        <div className="flex items-center justify-between text-[11px] font-bold mt-auto pt-1">
          <div className="flex gap-2">
            {anime.subCount && (
              <span className="flex items-center gap-1 bg-[#ff5500]/20 text-[#ff5500] px-1.5 py-0.5 rounded border border-[#ff5500]/30">
                <span className="w-3 h-3 bg-[#ff5500] text-[#161616] rounded-sm flex items-center justify-center text-[7px] font-black">CC</span>
                {anime.subCount}
              </span>
            )}
            {anime.dubCount && (
              <span className="flex items-center gap-1 bg-[#52ff7f]/20 text-[#52ff7f] px-1.5 py-0.5 rounded border border-[#52ff7f]/30">
                <span className="w-3 h-3 bg-[#52ff7f] text-[#161616] rounded-sm flex items-center justify-center text-[7px] font-black">🎤</span>
                {anime.dubCount}
              </span>
            )}
          </div>
          <span className="text-white/60 uppercase">{type}</span>
        </div>
      </div>
    </Link>
  );
}
