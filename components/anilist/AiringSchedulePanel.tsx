"use client";

import { ChevronRight, Clock3, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export interface AiringScheduleDay {
  key: string;
  weekday: string;
  dateLabel: string;
  items: Array<{
    id: number;
    title: string;
    time: string;
    episode: number;
    href: string;
  }>;
}

export default function AiringSchedulePanel({ days }: { days: AiringScheduleDay[] }) {
  const firstPopulatedDay = days.find((day) => day.items.length > 0) || days[0];
  const [activeKey, setActiveKey] = useState(firstPopulatedDay?.key || "");
  const activeDay = days.find((day) => day.key === activeKey) || firstPopulatedDay;

  return (
    <section className="home-render-section ap-glass-panel overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d10]/80 shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] p-4 bg-gradient-to-r from-white/[0.03] to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-1 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 12px rgba(34,211,238,0.6)" }} />
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-cyan-400 animate-pulse" aria-hidden="true" />
            <h2 className="text-base font-black tracking-tight text-white">
              Airing Schedule
            </h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
          LIVE
        </span>
      </div>

      {/* Days Pill Tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-2.5 border-b border-white/[0.08] bg-black/25">
        {days.map((day) => {
          const active = day.key === activeDay?.key;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => setActiveKey(day.key)}
              aria-pressed={active}
              className={`relative flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition-all duration-200 ${
                active
                  ? "bg-cyan-500/15 border border-cyan-500/40 text-white shadow-[0_0_15px_rgba(34,211,238,0.25)]"
                  : "bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white hover:bg-white/[0.08] hover:border-white/15"
              }`}
            >
              <span className={`text-xs font-black uppercase tracking-wider ${active ? "text-cyan-300" : ""}`}>
                {day.weekday}
              </span>
              <span className={`text-[10px] font-semibold mt-0.5 ${active ? "text-white/80" : "text-white/40"}`}>
                {day.dateLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Schedule Items */}
      <div className="p-3">
        <div className="space-y-1.5">
          {activeDay && activeDay.items.length > 0 ? (
            activeDay.items.slice(0, 9).map((item) => (
              <Link
                key={`${activeDay.key}-${item.id}`}
                href={item.href}
                prefetch={false}
                className="group flex items-center justify-between gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] p-2.5 transition-all duration-200 hover:border-cyan-500/30 hover:bg-white/[0.06] hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
              >
                {/* Time Badge */}
                <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] font-bold text-cyan-300/90 transition-colors group-hover:border-cyan-500/40 group-hover:bg-cyan-500/10">
                  {item.time}
                </span>

                {/* Title */}
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-white/80 transition-colors group-hover:text-white">
                  {item.title}
                </span>

                {/* Episode Badge */}
                <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.15)] group-hover:bg-cyan-400/20 group-hover:border-cyan-400/50">
                  EP {item.episode}
                </span>
              </Link>
            ))
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-8 text-center">
              <Clock3 className="mx-auto h-6 w-6 text-white/20" aria-hidden="true" />
              <p className="mt-2 text-xs font-bold text-white/40">No releases scheduled for this day</p>
            </div>
          )}
        </div>

        {/* View Full Schedule Action Button */}
        <Link
          href="/updates"
          className="group mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white/70 transition-all duration-200 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
        >
          <span>View Full Schedule</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
