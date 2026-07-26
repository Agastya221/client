"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Clock, CalendarDays } from "lucide-react";
import { anilistTitle, type AnilistMedia } from "@/lib/anilist/api";

export interface WeekDayInfo {
  key: string;
  dayShort: string;
  dayNumber: number;
  monthShort: string;
  fullDayName: string;
  isToday: boolean;
  startTimestamp: number;
  endTimestamp: number;
}

export interface ScheduleItem {
  id: number;
  airingAt: number;
  episode: number;
  media: AnilistMedia;
  watchHref: string;
  hasAired: boolean;
}

interface ScheduleClientProps {
  weekDays: WeekDayInfo[];
  schedulesByDay: Record<string, ScheduleItem[]>;
  todayKey: string;
}

function formatAiringTime12h(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, "0");
  const strMinutes = String(minutes).padStart(2, "0");
  return `${strHours}:${strMinutes} ${ampm}`;
}

export default function ScheduleClient({ weekDays, schedulesByDay, todayKey }: ScheduleClientProps) {
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayKey || weekDays[0]?.key || "");

  const selectedDay = weekDays.find((d) => d.key === selectedDayKey) || weekDays[0];
  const selectedItems = schedulesByDay[selectedDayKey] || [];

  return (
    <div className="w-full max-w-[1600px] mx-auto pt-24 pb-20 px-4 sm:px-6 lg:px-12 xl:px-16">
      {/* Header section */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#52ff7f] bg-[#52ff7f]/10 border border-[#52ff7f]/20 px-3 py-1 rounded-full mb-3">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>Weekly Schedule</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
          Anime Schedule
        </h1>
        <p className="text-white/50 text-xs sm:text-sm font-medium">
          New episodes airing this week — pick a day below.
        </p>
      </div>

      {/* Day Selector Pills Bar */}
      <div className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto pb-4 pt-1 no-scrollbar mb-8 border-b border-white/5">
        {weekDays.map((day) => {
          const isActive = day.key === selectedDayKey;
          const itemsCount = (schedulesByDay[day.key] || []).length;

          return (
            <button
              key={day.key}
              type="button"
              onClick={() => setSelectedDayKey(day.key)}
              className={`flex flex-col items-center justify-center min-w-[76px] sm:min-w-[92px] py-2.5 px-3 rounded-2xl border transition-all duration-200 ${
                isActive
                  ? "bg-white text-black border-white shadow-[0_4px_25px_rgba(255,255,255,0.22)] font-black scale-[1.02]"
                  : "bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white border-white/[0.06] hover:border-white/15"
              }`}
            >
              <span className={`text-[11px] font-extrabold tracking-wider uppercase ${isActive ? "text-black/60" : "text-white/40"}`}>
                {day.dayShort}
              </span>
              <span className={`text-lg sm:text-xl font-black my-0.5 ${isActive ? "text-black" : "text-white"}`}>
                {day.dayNumber}
              </span>
              <span className={`text-[10px] font-bold ${isActive ? "text-black/70" : "text-white/40"}`}>
                {itemsCount} ep
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Day Banner */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span>{selectedDay?.fullDayName}</span>
            {selectedDay?.isToday ? (
              <span className="text-xs bg-[#52ff7f]/15 text-[#52ff7f] border border-[#52ff7f]/25 px-2.5 py-0.5 rounded-full font-bold">
                Today
              </span>
            ) : (
              <span className="text-sm font-semibold text-white/40">
                • {selectedDay?.monthShort} {selectedDay?.dayNumber}
              </span>
            )}
          </h2>
        </div>
        <span className="text-xs sm:text-sm font-bold text-white/40">
          {selectedItems.length} {selectedItems.length === 1 ? "episode" : "episodes"}
        </span>
      </div>

      {/* Schedule Grid */}
      {selectedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-3xl bg-white/[0.02] border border-white/5 text-center">
          <Calendar className="w-10 h-10 text-white/20 mb-3" />
          <h3 className="text-base font-bold text-white/70 mb-1">No scheduled releases</h3>
          <p className="text-xs text-white/40">There are no new episodes scheduled for this day.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {selectedItems.map((item) => {
            const title = anilistTitle(item.media);

            return (
              <Link
                key={`${item.id}-${item.episode}`}
                href={item.watchHref}
                prefetch={false}
                className="group flex items-center gap-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/15 p-3 transition-all duration-200 hover:-translate-y-0.5 shadow-md hover:shadow-xl"
              >
                {/* Poster image */}
                <div className="relative w-[68px] h-[90px] sm:w-[72px] sm:h-[94px] shrink-0 rounded-xl overflow-hidden bg-white/5 ring-1 ring-white/10">
                  <img
                    src={item.media.coverImage.large || item.media.coverImage.medium}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="text-sm font-extrabold text-white group-hover:text-[#52ff7f] transition-colors line-clamp-2 leading-snug mb-2">
                    {title}
                  </h3>

                  {/* Airing info row */}
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-white/50 flex-wrap">
                    <span className="text-white/90 font-extrabold text-[11px] bg-white/10 px-1.5 py-0.5 rounded">
                      Ep {item.episode}
                    </span>
                    <span className="flex items-center gap-1 text-white/60">
                      <Clock className="w-3 h-3 text-white/40" />
                      {formatAiringTime12h(item.airingAt)}
                    </span>
                    <span className={`font-bold flex items-center gap-1 ${
                      item.hasAired
                        ? "text-emerald-400"
                        : "text-white/40"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${item.hasAired ? "bg-emerald-400" : "bg-white/30"}`} />
                      {item.hasAired ? "Aired" : "Soon"}
                    </span>
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
