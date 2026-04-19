import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import AnilistCard from "@/components/anilist/AnilistCard";
import { getAnilistTrending, searchAnilist, anilistTitle, type AnilistMedia } from "@/lib/anilist/api";
import { Calendar, Clock, ChevronRight } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Schedule & Updates | AnimeKAI",
  description: "See the weekly airing schedule and latest episode updates on AnimeKAI.",
};

// Group airing anime by day of week
function groupByDay(media: AnilistMedia[]): Record<string, AnilistMedia[]> {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const grouped: Record<string, AnilistMedia[]> = {};

  for (const day of days) grouped[day] = [];

  for (const item of media) {
    if (!item.nextAiringEpisode) continue;
    const date = new Date(item.nextAiringEpisode.airingAt * 1000);
    const day = days[date.getDay()];
    grouped[day].push(item);
  }

  return grouped;
}

function formatAiringTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (diff < 0) return "Aired";
  if (hours < 1) return "< 1 hour";
  if (hours < 24) return `${hours}h`;
  return `${days}d ${hours % 24}h`;
}

export default async function UpdatesPage() {
  const { media } = await searchAnilist({
    sort: ["POPULARITY_DESC"],
    status: "RELEASING",
    perPage: 50,
  });

  // Only those with airing info
  const withAiring = media.filter((m) => m.nextAiringEpisode);
  const grouped = groupByDay(withAiring);
  const today = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];

  // Rotate days to start from today
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayIdx = days.indexOf(today);
  const orderedDays = [...days.slice(todayIdx), ...days.slice(0, todayIdx)];

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <Navbar />

      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Airing Schedule</p>
          </div>
          <h1 className="text-4xl font-black text-white mb-2">Schedule & Updates</h1>
          <p className="text-white/40 text-sm">Weekly airing schedule for currently releasing anime.</p>
        </div>

        <div className="space-y-8">
          {orderedDays.map((day) => {
            const items = grouped[day];
            const isToday = day === today;

            return (
              <div key={day}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className={`text-lg font-bold ${isToday ? "text-[#ff5500]" : "text-white/80"}`}>
                    {day}
                    {isToday && <span className="ml-2 text-xs bg-[#ff5500]/20 text-[#ff5500] px-2 py-0.5 rounded-full font-bold">Today</span>}
                  </h2>
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-xs text-white/30">{items.length} anime</span>
                </div>

                {items.length === 0 ? (
                  <p className="text-white/20 text-sm pl-4 py-2">No scheduled releases</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {items.map((item) => (
                      <Link
                        key={item.id}
                        href={`/anime/anilist~${item.id}`}
                        className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/5 p-3 hover:bg-white/[0.06] hover:border-white/10 transition-all group"
                      >
                        <img
                          src={item.coverImage.medium}
                          alt={anilistTitle(item)}
                          className="w-12 h-16 rounded-lg object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-[#ff5500] transition-colors">
                            {anilistTitle(item)}
                          </p>
                          {item.nextAiringEpisode && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                                EP {item.nextAiringEpisode.episode}
                              </span>
                              <span className="text-[11px] text-white/40 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatAiringTime(item.nextAiringEpisode.airingAt)}
                              </span>
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
