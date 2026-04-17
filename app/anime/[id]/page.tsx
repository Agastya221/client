import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import AnilistCard from "@/components/anilist/AnilistCard";
import {
  getAnilistDetail,
  anilistTitle,
  anilistRating,
  anilistFormat,
  anilistStatus,
  anilistYear,
  encodeAnilistRouteId,
  type AnilistDetailMedia,
} from "@/lib/anilist/api";
import { Play, Star, Calendar, Tv, Users, BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-white/5 rounded-xl p-4 border border-white/5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</span>
      <span className="text-sm font-semibold text-white/80">{value}</span>
    </div>
  );
}

function CharacterCard({ char }: { char: { name: { full: string }; image: { medium: string } } }) {
  return (
    <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
      <img
        src={char.image.medium}
        alt={char.name.full}
        className="w-10 h-10 rounded-full object-cover shrink-0"
      />
      <span className="text-sm font-semibold text-white/80 line-clamp-1">{char.name.full}</span>
    </div>
  );
}

async function AnilistDetailContent({ anilistId }: { anilistId: number }) {
  const media = await getAnilistDetail(anilistId);
  const title = anilistTitle(media);
  const rating = anilistRating(media);
  const format = anilistFormat(media);
  const status = anilistStatus(media);
  const year = anilistYear(media);
  const studios = media.studios.nodes.map((s) => s.name).join(", ");
  const description = media.description?.replace(/<[^>]*>/g, "") || "";
  const accentColor = media.coverImage.color || "#ff5500";
  const selfHref = `/anime/${encodeAnilistRouteId(anilistId)}`;

  // Watch link: search AnimeKai by title (our Python API handles the lookup)
  const watchHref = `/anime/${encodeAnilistRouteId(anilistId)}/watch?ep=1&provider=animekai`;

  const relations = media.relations.edges.filter(
    (e) => e.relationType === "SEQUEL" || e.relationType === "PREQUEL" || e.relationType === "SIDE_STORY"
  );

  const recommendations = media.recommendations.nodes
    .map((n) => n.mediaRecommendation)
    .filter(Boolean)
    .slice(0, 8) as AnilistDetailMedia[];

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Banner bg */}
        {media.bannerImage && (
          <div className="absolute inset-0 z-0">
            <img src={media.bannerImage} alt={title} className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0b0c]/60 via-[#0a0b0c]/80 to-[#0a0b0c]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] via-transparent to-transparent" />
          </div>
        )}

        {/* Glow from accent color */}
        <div
          className="absolute inset-0 z-0 opacity-10"
          style={{ background: `radial-gradient(ellipse at 20% 50%, ${accentColor} 0%, transparent 60%)` }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-6 pt-28 pb-16">
          <div className="grid gap-10 lg:grid-cols-[280px_1fr] items-end">
            {/* Poster */}
            <div className="hidden lg:block">
              <div className="relative">
                <div
                  className="absolute -inset-3 rounded-2xl blur-2xl opacity-30"
                  style={{ backgroundColor: accentColor }}
                />
                <img
                  src={media.coverImage.extraLarge}
                  alt={title}
                  className="relative w-full rounded-2xl shadow-2xl border border-white/10"
                  style={{ aspectRatio: "2/3", objectFit: "cover" }}
                />
              </div>
            </div>

            {/* Info */}
            <div className="space-y-6">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2">
                {media.status === "RELEASING" && (
                  <span className="flex items-center gap-1.5 bg-[#ff5500] text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    NOW AIRING
                  </span>
                )}
                <span className="bg-white/10 text-white/70 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                  <Tv className="w-3 h-3" /> {format}
                </span>
                {year && (
                  <span className="bg-white/10 text-white/70 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {year}
                  </span>
                )}
                {rating && (
                  <span className="flex items-center gap-1 bg-yellow-400/20 text-yellow-400 text-[10px] font-black px-3 py-1.5 rounded-full">
                    <Star className="w-3 h-3 fill-current" /> {rating}
                  </span>
                )}
              </div>

              {/* Title */}
              <div>
                <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight max-w-2xl">
                  {title}
                </h1>
                {media.title.native && media.title.native !== title && (
                  <p className="text-white/30 text-lg font-semibold mt-2">{media.title.native}</p>
                )}
              </div>

              {/* Studios + genres */}
              <div className="flex flex-wrap items-center gap-2">
                {studios && <span className="text-white/50 text-sm font-semibold">{studios}</span>}
                {studios && media.genres.length > 0 && <span className="w-1 h-1 rounded-full bg-white/20" />}
                {media.genres.slice(0, 4).map((g) => (
                  <Link
                    key={g}
                    href={`/search?genre=${encodeURIComponent(g)}`}
                    className="text-xs font-bold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
                    style={{ color: accentColor, background: `${accentColor}20`, border: `1px solid ${accentColor}30` }}
                  >
                    {g}
                  </Link>
                ))}
              </div>

              {/* Description */}
              {description && (
                <p className="text-white/60 text-sm leading-relaxed max-w-2xl line-clamp-4">
                  {description}
                </p>
              )}

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={watchHref}
                  className="flex items-center gap-2.5 text-white font-black text-sm px-8 py-4 rounded-full transition-all hover:scale-105 shadow-xl"
                  style={{ backgroundColor: accentColor, boxShadow: `0 12px 32px ${accentColor}50` }}
                >
                  <Play className="w-4 h-4 fill-current" />
                  WATCH NOW
                </Link>
                <Link
                  href="/search"
                  className="flex items-center gap-2 text-white/70 hover:text-white font-bold text-sm px-6 py-4 rounded-full bg-white/10 hover:bg-white/15 transition-all border border-white/10"
                >
                  Browse More
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Details Section */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          {/* Left */}
          <div className="space-y-10">
            {/* Metadata grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetaBadge label="Status" value={status} />
              {format && <MetaBadge label="Format" value={format} />}
              {year && <MetaBadge label="Year" value={year} />}
              {media.episodes && <MetaBadge label="Episodes" value={String(media.episodes)} />}
              {studios && <MetaBadge label="Studio" value={studios} />}
              {media.season && media.seasonYear && (
                <MetaBadge label="Season" value={`${media.season} ${media.seasonYear}`} />
              )}
              {rating && <MetaBadge label="Score" value={`${rating} / 10`} />}
              {media.popularity && <MetaBadge label="Popularity" value={`#${media.popularity.toLocaleString()}`} />}
            </div>

            {/* Synopsis */}
            {description && (
              <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Synopsis</h2>
                </div>
                <p className="text-white/70 leading-relaxed text-sm">{description}</p>
              </div>
            )}

            {/* Characters */}
            {media.characters.nodes.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Characters</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {media.characters.nodes.map((char) => (
                    <CharacterCard key={char.name.full} char={char} />
                  ))}
                </div>
              </div>
            )}

            {/* Relations */}
            {relations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <ChevronRight className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Related</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {relations.map((edge) => (
                    <Link
                      key={edge.node.id}
                      href={`/anime/${encodeAnilistRouteId(edge.node.id)}`}
                      className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 transition-all"
                    >
                      <img
                        src={edge.node.coverImage.large}
                        alt={edge.node.title.english || edge.node.title.romaji}
                        className="w-10 h-14 rounded-lg object-cover"
                      />
                      <div>
                        <p className="text-[10px] text-white/40 font-bold uppercase">{edge.relationType}</p>
                        <p className="text-sm font-bold text-white/80 line-clamp-1 max-w-[160px]">
                          {edge.node.title.english || edge.node.title.romaji}
                        </p>
                        <p className="text-[10px] text-white/40">{edge.node.format}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Recommendations */}
          {recommendations.length > 0 && (
            <aside>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-white/40">Recommended</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {recommendations.slice(0, 6).map((rec) => (
                  <AnilistCard key={rec.id} media={rec as any} />
                ))}
              </div>
            </aside>
          )}
        </div>
      </section>
    </>
  );
}

export default async function AnilistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Check if this is an anilist route
  if (!id.startsWith("anilist~")) {
    // Delegate to the original AnimeKai detail handler
    const { default: AnimeKaiDetailPage } = await import("./animekai-detail");
    return <AnimeKaiDetailPage params={params} searchParams={Promise.resolve({})} />;
  }

  const anilistId = parseInt(id.replace("anilist~", ""), 10);
  if (isNaN(anilistId)) return notFound();

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea]">
      <Navbar />
      <AnilistDetailContent anilistId={anilistId} />
      <SiteFooter />
    </main>
  );
}
