"use client";

import { ChevronRight, Clock3 } from "lucide-react";
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
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1012]">
      <div className="border-b border-white/[0.08] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Estimated</p>
        <div className="mt-1 flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          <h2 className="text-lg font-black text-white">Airing Schedule</h2>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-white/[0.08] bg-black/15">
        {days.map((day) => {
          const active = day.key === activeDay?.key;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => setActiveKey(day.key)}
              className={`relative px-2 py-3 text-center transition-colors ${
                active ? "text-white" : "text-white/35 hover:text-white/65"
              }`}
              aria-pressed={active}
            >
              <span className="block text-sm font-black uppercase">{day.weekday}</span>
              <span className="mt-0.5 block text-[10px] font-semibold">{day.dateLabel}</span>
              {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-cyan-400" />}
            </button>
          );
        })}
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/10">
          {activeDay && activeDay.items.length > 0 ? (
            activeDay.items.slice(0, 9).map((item) => (
              <Link
                key={`${activeDay.key}-${item.id}`}
                href={item.href}
                className="group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 last:border-0 hover:bg-white/[0.035]"
              >
                <span className="text-[11px] font-semibold tabular-nums text-white/35">{item.time}</span>
                <span className="truncate text-xs font-semibold text-white/60 transition-colors group-hover:text-white">
                  {item.title}
                </span>
                <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[9px] font-black text-cyan-300/80">
                  EP {item.episode}
                </span>
              </Link>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <Clock3 className="mx-auto h-5 w-5 text-white/15" aria-hidden="true" />
              <p className="mt-2 text-xs font-semibold text-white/30">No releases scheduled</p>
            </div>
          )}
        </div>

        <Link
          href="/updates"
          className="mt-2 flex items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-bold text-white/35 transition-colors hover:bg-white/[0.03] hover:text-white/70"
        >
          View full schedule
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
