import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import AnilistCard from "@/components/anilist/AnilistCard";
import { getCatalogAvailabilityForMedia } from "@/lib/anilist/availability";
import { searchAnilist } from "@/lib/anilist/api";
import { Radio, ChevronRight } from "lucide-react";
import Link from "next/link";

// Served from a cached, pre-rendered copy, rebuilt in the background at most every 1 hour.
// force-static is needed because the AniList fetches use cache: "no-store".
export const dynamic = "force-static";
export const revalidate = 10800;

export const metadata = {
  title: "Ongoing Series | Yorumi",
  description: "Watch currently airing anime series on Yorumi. Updated daily.",
};

export default async function OngoingPage() {
  const { media } = await searchAnilist({
    sort: ["POPULARITY_DESC"],
    status: "RELEASING",
    perPage: 30,
  });
  const availabilityHints = await getCatalogAvailabilityForMedia(media);

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white page-transition-enter">

      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Radio className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Currently Airing</p>
          </div>
          <h1 className="text-4xl font-black text-white mb-2">Ongoing Series</h1>
          <p className="text-white/40 text-sm">Anime that are currently releasing new episodes every week.</p>
        </div>

        {media.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-6xl mb-4">📡</p>
            <p className="text-white/40 text-lg font-semibold">No ongoing series found</p>
            <Link href="/search" className="mt-6 inline-flex items-center gap-2 text-[#ff5500] text-sm font-bold hover:underline">
              Browse all anime <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 gap-y-8">
            {media.map((item, i) => (
              <AnilistCard key={item.id} media={item} rank={i + 1} availability={availabilityHints[item.id]} fromAiring />
            ))}
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
