import Link from "next/link";
import { Play, Star } from "lucide-react";
import { type AnilistMedia, anilistTitle, anilistRating, anilistFormat, encodeAnilistRouteId } from "@/lib/anilist/api";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";

interface AnilistCardProps {
  media: AnilistMedia;
  rank?: number;
  size?: "sm" | "md" | "lg";
  availability?: CatalogAvailabilityHint | null;
}

export default function AnilistCard({ media, rank, size = "md", availability = null }: AnilistCardProps) {
  const title = anilistTitle(media) || "Untitled Anime";
  const rating = anilistRating(media);
  const format = anilistFormat(media);
  const href = `/anime/${encodeAnilistRouteId(media.id)}`;
  const image = media.coverImage.extraLarge || media.coverImage.large || media.coverImage.medium || "";
  const accentColor = media.coverImage.color || "#ff5500";
  const isAiring = media.status === "RELEASING";
  const availabilityTone =
    availability?.isAvailable
      ? "bg-emerald-500/85 text-black"
      : availability?.status === "NOT_FOUND"
        ? "bg-[#ff5500]/85 text-white"
        : null;

  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-2 transition-all duration-300 w-full"
    >
      {/* Poster */}
      <div
        className="relative overflow-hidden rounded-xl bg-[#1a1c22]"
        style={{ aspectRatio: "2/3" }}
      >
        {image ? (
          <img
            src={image}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#15171d] text-xs font-bold text-white/25">
            No Image
          </div>
        )}

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shadow-2xl pl-1"
            style={{ backgroundColor: accentColor }}
          >
            <Play className="w-5 h-5 text-white fill-current" />
          </div>
        </div>

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isAiring && (
            <span className="flex items-center gap-1 bg-[#ff5500] text-white text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              AIRING
            </span>
          )}
          {rank && (
            <span className="bg-black/70 backdrop-blur text-white text-[10px] font-black px-1.5 py-0.5 rounded-md">
              #{rank}
            </span>
          )}
        </div>

        {/* Rating badge */}
        {rating && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/70 backdrop-blur text-yellow-400 text-[10px] font-black px-1.5 py-0.5 rounded-md">
            <Star className="w-2.5 h-2.5 fill-current" />
            {rating}
          </div>
        )}

        {/* Episodes count bottom right */}
        {media.episodes && (
          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur text-white/80 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
            {media.nextAiringEpisode
              ? `EP ${media.nextAiringEpisode.episode - 1}/${media.episodes}`
              : `${media.episodes} EPS`}
          </div>
        )}

        {availability && availabilityTone && (
          <div className={`absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${availabilityTone}`}>
            {availability.message}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 px-0.5">
        <h3 className="text-[13px] font-bold text-white/90 group-hover:text-white line-clamp-2 leading-tight transition-colors">
          {title}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">
            {format}
          </span>
          {media.genres[0] && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ color: accentColor, background: `${accentColor}20` }}
            >
              {media.genres[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
