"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BellRing, CalendarDays, Play, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { FollowedReleaseUpdate } from "@/lib/anilist/release-updates";

export default function FollowedReleaseUpdatesRail() {
  const { status } = useSession();
  const [updates, setUpdates] = useState<FollowedReleaseUpdate[]>([]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();
    void fetch("/api/anilist/release-updates", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (Array.isArray(payload?.updates)) {
          setUpdates(payload.updates);
        }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("[FollowedReleaseUpdatesRail] Unable to load updates:", error);
        }
      });

    return () => controller.abort();
  }, [status]);

  if (status !== "authenticated" || updates.length === 0) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1012]/90 p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/15">
            <BellRing className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-white">New from Your List</h2>
            <p className="truncate text-[11px] font-medium text-white/40">
              New episodes and seasons from anime you follow
            </p>
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/45 sm:inline-flex">
          <Sparkles className="h-3 w-3 text-emerald-300" aria-hidden="true" />
          AniList synced
        </span>
      </div>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5 hide-scrollbar">
        {updates.map((update) => {
          const accent = update.accentColor || "#22d3ee";
          const artwork = update.banner || update.poster;
          const badge =
            update.kind === "season"
              ? "New season"
              : update.newEpisodeCount === 1
                ? `Episode ${update.latestEpisode} is out`
                : `${update.newEpisodeCount} new episodes`;

          return (
            <Link
              key={update.key}
              href={update.href}
              className="group relative min-h-[170px] w-[280px] shrink-0 overflow-hidden rounded-2xl border bg-[#14161a] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 sm:w-[330px]"
              style={{
                borderColor: `${accent}35`,
                boxShadow: `inset 0 -1px 0 ${accent}18`,
              }}
            >
              {artwork ? (
                <Image
                  src={artwork}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 280px, 330px"
                  quality={72}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/72 to-black/25" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />

              <div className="relative flex h-full min-h-[170px] flex-col justify-between p-4">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em]"
                    style={{
                      color: accent,
                      borderColor: `${accent}55`,
                      backgroundColor: `${accent}18`,
                    }}
                  >
                    {badge}
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform group-hover:scale-105">
                    {update.kind === "episode" ? (
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    ) : (
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                </div>

                <div>
                  <h3 className="line-clamp-2 text-base font-black leading-tight text-white">
                    {update.title}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-[11px] font-medium text-white/55">
                    {update.kind === "season"
                      ? `A new season of ${update.sourceTitle} is available`
                      : `You watched through episode ${update.progress}`}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-white/40">
                    {update.format ? <span>{update.format.replaceAll("_", " ")}</span> : null}
                    {update.seasonYear ? <span>• {update.seasonYear}</span> : null}
                    <span style={{ color: accent }}>Open now →</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
