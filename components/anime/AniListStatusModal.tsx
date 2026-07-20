"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Check, Loader2, Plus, Minus, Star, Heart, Bookmark } from "lucide-react";

interface AniListStatusModalProps {
  animeId: string;
  title: string;
  poster?: string | null;
  totalEpisodes?: number | null;
}

const ANILIST_STATUSES = [
  { key: "WATCHING", label: "Watching", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { key: "COMPLETED", label: "Completed", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { key: "PLAN_TO_WATCH", label: "Plan to Watch", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { key: "ON_HOLD", label: "On Hold", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { key: "DROPPED", label: "Dropped", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
] as const;

export default function AniListStatusModal({
  animeId,
  title,
  poster,
  totalEpisodes,
}: AniListStatusModalProps) {
  const session = useSession()?.data;
  const [isOpen, setIsOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>("PLAN_TO_WATCH");
  const [progress, setProgress] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(false);

  // If user is not logged in with AniList, don't show full editor modal
  if (!session?.user) {
    return null;
  }

  const saveToAniList = async (newStatus?: string, newProgress?: number, newScore?: number) => {
    setSaving(true);
    setSynced(false);

    const targetStatus = newStatus !== undefined ? newStatus : currentStatus;
    const targetProgress = newProgress !== undefined ? newProgress : progress;
    const targetScore = newScore !== undefined ? newScore : score;

    try {
      const res = await fetch("/api/anilist/save-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          status: targetStatus,
          progress: targetProgress,
          score: targetScore,
        }),
      });

      if (res.ok) {
        if (newStatus !== undefined) setCurrentStatus(newStatus);
        if (newProgress !== undefined) setProgress(newProgress);
        if (newScore !== undefined) setScore(newScore);
        setSynced(true);
        setTimeout(() => setSynced(false), 2500);
      }
    } catch (err) {
      console.error("[AniListStatusModal] Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const currentStatusObj = ANILIST_STATUSES.find((s) => s.key === currentStatus) || ANILIST_STATUSES[2];

  return (
    <div className="relative inline-block">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs font-bold text-white shadow-lg"
      >
        <img src="https://anilist.co/img/icons/android-chrome-512x512.png" alt="AniList" className="w-4 h-4 rounded" />
        <span>AniList:</span>
        <span className={`px-2 py-0.5 rounded-md border text-[11px] uppercase font-extrabold ${currentStatusObj.color}`}>
          {currentStatusObj.label}
        </span>
        {progress > 0 && (
          <span className="text-white/60 text-[11px]">
            ({progress}{totalEpisodes ? `/${totalEpisodes}` : ""})
          </span>
        )}
      </button>

      {/* Popover / Modal */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-3 w-80 rounded-2xl bg-[#0f1115] border border-white/15 p-5 shadow-2xl z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <img src="https://anilist.co/img/icons/android-chrome-512x512.png" alt="" className="w-5 h-5 rounded" />
                <h4 className="text-sm font-black text-white">Sync to AniList</h4>
              </div>
              {synced && (
                <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Saved!
                </span>
              )}
            </div>

            {/* Status Selectors */}
            <div className="space-y-1.5 mb-5">
              <label className="text-[10px] uppercase font-extrabold tracking-wider text-white/40 mb-1 block">Watch Status</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ANILIST_STATUSES.map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => saveToAniList(st.key)}
                    disabled={saving}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all text-left border flex items-center justify-between ${
                      currentStatus === st.key
                        ? st.color
                        : "bg-white/5 border-white/5 text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <span>{st.label}</span>
                    {currentStatus === st.key && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Episode Progress Counter */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] uppercase font-extrabold tracking-wider text-white/40">Episode Progress</label>
                <span className="text-xs font-bold text-white">
                  {progress} {totalEpisodes ? `/ ${totalEpisodes}` : "eps"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => saveToAniList(undefined, Math.max(0, progress - 1))}
                  disabled={saving || progress <= 0}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white disabled:opacity-30 transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={0}
                  max={totalEpisodes || 9999}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  onBlur={() => saveToAniList(undefined, progress)}
                  className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-center text-sm font-bold text-white focus:outline-none focus:border-[#02A9FF]"
                />
                <button
                  type="button"
                  onClick={() => saveToAniList(undefined, progress + 1)}
                  disabled={saving}
                  className="w-10 h-10 rounded-xl bg-[#02A9FF]/20 hover:bg-[#02A9FF]/30 border border-[#02A9FF]/40 flex items-center justify-center text-[#02A9FF] transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Close / Action Footer */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-all"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
