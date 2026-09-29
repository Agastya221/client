import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import ScheduleClient, { type WeekDayInfo, type ScheduleItem } from "@/components/schedule/ScheduleClient";
import { getWeeklyAiringSchedule, encodeAnilistRouteId } from "@/lib/anilist/api";
import { getCatalogAvailabilityForMedia, getWatchHrefsFromAvailability } from "@/lib/anilist/availability";

// Served from a cached, pre-rendered copy, rebuilt in the background at most every 1 hour.
// force-static is needed because the AniList fetches use cache: "no-store".
export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata = {
  title: "Anime Schedule & Airing Updates | Yorumi",
  description: "Weekly anime airing schedule for currently releasing anime.",
};

function getWeekDays(referenceDate = new Date()): WeekDayInfo[] {
  const currentDayOfWeek = referenceDate.getDay();
  const sunday = new Date(referenceDate);
  sunday.setDate(referenceDate.getDate() - currentDayOfWeek);
  sunday.setHours(0, 0, 0, 0);

  const days: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + i);

    const dayShort = day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    const dayNumber = day.getDate();
    const monthShort = day.toLocaleDateString("en-US", { month: "short" });
    const fullDayName = day.toLocaleDateString("en-US", { weekday: "long" });

    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, "0");
    const dateNum = String(day.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${dateNum}`;

    const isToday = day.toDateString() === referenceDate.toDateString();

    const startTimestamp = Math.floor(new Date(day).setHours(0, 0, 0, 0) / 1000);
    const endTimestamp = Math.floor(new Date(day).setHours(23, 59, 59, 999) / 1000);

    days.push({
      key,
      dayShort,
      dayNumber,
      monthShort,
      fullDayName,
      isToday,
      startTimestamp,
      endTimestamp,
    });
  }

  return days;
}

export default async function UpdatesPage() {
  const now = new Date();
  const weekDays = getWeekDays(now);

  const startOfWeek = weekDays[0].startTimestamp;
  const endOfWeek = weekDays[6].endTimestamp;

  const rawSchedules = await getWeeklyAiringSchedule(startOfWeek, endOfWeek);

  const mediaList = rawSchedules.map((s) => s.media);
  const availabilityHints = await getCatalogAvailabilityForMedia(mediaList);
  const watchHrefs = getWatchHrefsFromAvailability(availabilityHints);

  const nowSeconds = Math.floor(now.getTime() / 1000);

  const schedulesByDay: Record<string, ScheduleItem[]> = {};
  for (const day of weekDays) {
    schedulesByDay[day.key] = [];
  }

  for (const item of rawSchedules) {
    const itemDate = new Date(item.airingAt * 1000);
    const year = itemDate.getFullYear();
    const month = String(itemDate.getMonth() + 1).padStart(2, "0");
    const dateNum = String(itemDate.getDate()).padStart(2, "0");
    const dayKey = `${year}-${month}-${dateNum}`;

    const href = watchHrefs[String(item.media.id)] || `/anime/${encodeAnilistRouteId(item.media.id)}`;

    const scheduleItem: ScheduleItem = {
      id: item.id,
      airingAt: item.airingAt,
      episode: item.episode,
      media: item.media,
      watchHref: href,
      hasAired: item.airingAt <= nowSeconds,
    };

    if (schedulesByDay[dayKey]) {
      schedulesByDay[dayKey].push(scheduleItem);
    }
  }

  for (const dayKey in schedulesByDay) {
    schedulesByDay[dayKey].sort((a, b) => a.airingAt - b.airingAt);
  }

  const todayKey = weekDays.find((d) => d.isToday)?.key || weekDays[0].key;

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white page-transition-enter">
      <ScheduleClient
        weekDays={weekDays}
        schedulesByDay={schedulesByDay}
        todayKey={todayKey}
      />
      <SiteFooter />
    </main>
  );
}
