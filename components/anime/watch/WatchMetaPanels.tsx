"use client";

import type { WatchSessionModel } from "@/lib/anime/types";
import {
  anilistFormat,
  anilistRating,
  anilistTitle,
  encodeAnilistRouteId,
  type AnilistMedia,
} from "@/lib/anilist/api";
import {
  Calendar,
  Clock,
  ExternalLink,
  Film,
  Info,
  Play,
  Star,
  Tv2,
} from "lucide-react";
import Link from "next/link";

export function WatchAnimeDetailsPanel({
  session,
  heroImage,
  children,
}: {
  session: WatchSessionModel;
  heroImage: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <div className="flex gap-5">
          <div className="shrink-0">
            <div className="w-28 md:w-36 aspect-[2/3] rounded-xl overflow-hidden border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative group/poster">
              <img
                src={session.anime.poster || heroImage}
                alt={session.anime.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/poster:scale-105"
              />
              {session.anime.rating && (
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-[10px] font-bold text-white">{session.anime.rating}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <Link href={session.anime.href} className="group/title">
                <h2 className="text-lg md:text-xl font-bold text-white group-hover/title:text-[#ff5500] transition-colors leading-tight">
                  {session.anime.title}
                </h2>
              </Link>
              {session.anime.subtitle && (
                <p className="text-xs text-white/30 mt-1">{session.anime.subtitle}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {session.anime.type && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                  <Film className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Type</p>
                  <p className="text-xs font-bold text-white/80">{session.anime.type}</p>
                </div>
              )}
              {session.anime.year && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                  <Calendar className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Year</p>
                  <p className="text-xs font-bold text-white/80">{session.anime.year}</p>
                </div>
              )}
              {session.anime.status && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                  <Clock className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Status</p>
                  <p
                    className={`text-xs font-bold ${
                      session.anime.status.toLowerCase().includes("airing") || session.anime.status.toLowerCase().includes("ongoing")
                        ? "text-green-400"
                        : "text-white/80"
                    }`}
                  >
                    {session.anime.status}
                  </p>
                </div>
              )}
              {session.anime.episodeCount && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-center">
                  <Tv2 className="w-3.5 h-3.5 text-[#ff5500] mx-auto mb-1" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Episodes</p>
                  <p className="text-xs font-bold text-white/80">{session.anime.episodeCount}</p>
                </div>
              )}
            </div>

            {session.anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {session.anime.genres.map((genre) => (
                  <Link
                    key={genre}
                    href={`/search?genre=${genre}`}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
                    style={{ color: "#ff5500", background: "rgba(255,85,0,0.1)", border: "1px solid rgba(255,85,0,0.15)" }}
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 pt-2 border-t border-white/5">
              <Link href={session.anime.href} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#ff5500] hover:text-[#ff7733] transition-colors">
                <Info className="w-3.5 h-3.5" /> Full Details
              </Link>
              {session.anime.anilistId && (
                <a href={`https://anilist.co/anime/${session.anime.anilistId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-white/35 hover:text-white/60 transition-colors">
                  <ExternalLink className="w-3 h-3" /> AniList
                </a>
              )}
              {session.anime.malId && (
                <a href={`https://myanimelist.net/anime/${session.anime.malId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-white/35 hover:text-white/60 transition-colors">
                  <ExternalLink className="w-3 h-3" /> MAL
                </a>
              )}
            </div>
          </div>
        </div>

        {session.anime.description && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Synopsis</h3>
            <p className="text-[13px] text-white/50 leading-relaxed">
              {session.anime.description.replace(/<[^>]+>/g, "")}
            </p>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function WatchRecommendationsPanel({
  recommendations,
}: {
  recommendations: AnilistMedia[] | null;
}) {
  if (recommendations === null) {
    return (
      <div className="sticky top-20 space-y-4">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-white/40">
          Loading Recommendations
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[2/3] rounded-xl border border-white/5 bg-white/[0.03] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-20 space-y-4">
      <h2 className="text-[11px] font-black uppercase tracking-widest text-white/40">
        {recommendations.length > 0 ? "Recommended for You" : "Trending Now"}
      </h2>

      {recommendations.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {recommendations.slice(0, 8).map((rec) => {
            const recTitle = anilistTitle(rec);
            const recRating = anilistRating(rec);
            const recFormat = anilistFormat(rec);
            const recHref = `/anime/${encodeAnilistRouteId(rec.id)}`;
            const recImage = rec.coverImage.extraLarge || rec.coverImage.large;
            const recColor = rec.coverImage.color || "#ff5500";
            const isAiring = rec.status === "RELEASING";
            return (
              <Link
                key={rec.id}
                href={recHref}
                className="group/rec flex flex-col gap-1.5 transition-all duration-300"
              >
                <div className="relative overflow-hidden rounded-xl bg-[#1a1c22]" style={{ aspectRatio: "2/3" }}>
                  <img
                    src={recImage}
                    alt={recTitle}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/rec:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/rec:opacity-100 transition-opacity duration-300" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/rec:opacity-100 transition-opacity duration-300">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-2xl pl-0.5" style={{ backgroundColor: recColor }}>
                      <Play className="w-4 h-4 text-white fill-current" />
                    </div>
                  </div>
                  <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                    {isAiring && (
                      <span className="flex items-center gap-1 bg-[#ff5500] text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        Airing
                      </span>
                    )}
                  </div>
                  {recRating && (
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 backdrop-blur text-yellow-400 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      {recRating}
                    </div>
                  )}
                  {rec.episodes && (
                    <div className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur text-white/80 text-[8px] font-bold px-1.5 py-0.5 rounded-md">
                      {rec.nextAiringEpisode
                        ? `EP ${rec.nextAiringEpisode.episode - 1}/${rec.episodes}`
                        : `${rec.episodes} EP`}
                    </div>
                  )}
                </div>
                <div className="px-0.5">
                  <h3 className="text-[11px] font-bold text-white/80 group-hover/rec:text-white line-clamp-2 leading-tight transition-colors">
                    {recTitle}
                  </h3>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[9px] text-white/30 font-semibold uppercase tracking-wider">
                      {recFormat}
                    </span>
                    {rec.genres[0] && (
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ color: recColor, background: `${recColor}20` }}
                      >
                        {rec.genres[0]}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
