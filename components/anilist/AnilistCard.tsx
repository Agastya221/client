import Link from "next/link";
import Image from "next/image";
import { Play, Star } from "lucide-react";
import { type AnilistMedia, anilistTitle, anilistRating, anilistFormat, encodeAnilistRouteId } from "@/lib/anilist/api";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";

interface AnilistCardProps {
  media: AnilistMedia;
  rank?: number;
  size?: "sm" | "md" | "lg";
  availability?: CatalogAvailabilityHint | null;
  fromAiring?: boolean;
}

export default function AnilistCard({
  media,
  rank,
  size = "md",
  availability = null,
  fromAiring = false,
}: AnilistCardProps) {
  const title = anilistTitle(media) || "Untitled Anime";
  const rating = anilistRating(media);
  const format = anilistFormat(media);
  const href = `/anime/${encodeAnilistRouteId(media.id)}${fromAiring ? "?from=airing" : ""}`;
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
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 transform-gpu will-change-transform group-hover:scale-105"
            loading="lazy"
            quality={75}
            sizes="(max-width: 639px) 46vw, (max-width: 1023px) 30vw, (max-width: 1535px) 20vw, 18vw"
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
            className="flex h-12 w-12 items-center justify-center rounded-full border pl-1 shadow-2xl backdrop-blur-md"
            style={{
              backgroundColor: `${accentColor}32`,
              borderColor: `${accentColor}90`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15), 0 12px 32px ${accentColor}36`,
            }}
          >
            <Play className="w-5 h-5 text-white fill-current" />
          </div>
        </div>

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {isAiring && (
            <span
              className="flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur-md"
              style={{
                backgroundColor: `${accentColor}24`,
                borderColor: `${accentColor}75`,
                color: `color-mix(in srgb, ${accentColor} 68%, white)`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              AIRING
            </span>
          )}
          {rank && (
            <span className="ap-glass-pill px-2 py-1 text-[10px] font-black text-white">
              #{rank}
            </span>
          )}
        </div>

        {/* Rating badge */}
        {rating && (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full border border-amber-300/35 bg-amber-300/15 px-2 py-1 text-[10px] font-black text-amber-300 backdrop-blur-md">
            <Star className="w-2.5 h-2.5 fill-current" />
            {rating}
          </div>
        )}

        {/* Episodes count bottom right */}
        {media.episodes && (
          <div className="ap-glass-pill absolute bottom-2 right-2 px-2 py-1 text-[9px] font-bold text-white/80">
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
            <span className="ap-glass-pill px-2 py-1 text-[9px] font-bold text-white/55">
              {media.genres[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
