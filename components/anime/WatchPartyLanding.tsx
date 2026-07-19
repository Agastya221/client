"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, Users, Wifi, Zap } from "lucide-react";
import Link from "next/link";

export default function WatchPartyLanding({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-fill code from URL param (?code=ANIM4X)
  useEffect(() => {
    searchParamsPromise.then((params) => {
      const c = typeof params.code === "string" ? params.code : "";
      if (c) setCode(c.toUpperCase());
    });
  }, [searchParamsPromise]);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) { setErrorMsg("Please enter a valid room code"); return; }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/watch-party/room?code=" + trimmed);
      if (res.status === 404) { setErrorMsg("Room not found or expired"); setStatus("idle"); return; }
      if (!res.ok) throw new Error();
      const room = await res.json() as { animeId: string; animeTitle: string; episodeNumber: number };
      // Redirect to the watch page with party code
      window.location.href = `/anime/${room.animeId}/watch?ep=${room.episodeNumber}&party=${trimmed}`;
    } catch {
      setErrorMsg("Could not find that room. Check the code and try again.");
      setStatus("idle");
    }
  };

  return (
    <section className="relative flex-1 overflow-hidden flex items-center justify-center px-4 py-20">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(255,85,0,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_80%_80%,rgba(82,255,127,0.05),transparent)]" />
        {/* Animated orbs */}
        <div
          className="absolute left-[15%] top-[20%] h-72 w-72 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "#ff5500", animation: "partyPulse 4s ease-in-out infinite" }}
        />
        <div
          className="absolute right-[10%] bottom-[25%] h-56 w-56 rounded-full opacity-[0.04] blur-3xl"
          style={{ background: "#52ff7f", animation: "partyPulse 6s ease-in-out infinite reverse" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo badge */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 backdrop-blur-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff5500]/20 text-[#ff5500]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">AnimePlay</p>
              <p className="text-base font-black text-white">Watch Together</p>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="mb-10 text-center">
          <h1 className="mb-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Watch anime
            <span className="block" style={{ color: "#ff5500" }}>with your crew</span>
          </h1>
          <p className="mx-auto max-w-sm text-base text-white/50 leading-relaxed">
            Create a room, share the code, and watch perfectly in sync — play, pause, seek, and chat together in real time.
          </p>
        </div>

        {/* Join card */}
        <div
          className="rounded-2xl border border-white/10 p-6 backdrop-blur-sm"
          style={{ background: "linear-gradient(135deg, rgba(15,16,18,0.95) 0%, rgba(20,22,24,0.95) 100%)" }}
        >
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white/40">
            Enter Room Code
          </label>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
            placeholder="ANIM4X"
            maxLength={6}
            className="mb-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-center text-3xl font-black tracking-[0.3em] text-white placeholder-white/20 outline-none transition-all focus:border-[#ff5500]/50 focus:ring-2 focus:ring-[#ff5500]/20"
          />

          {errorMsg && (
            <p className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-[11px] text-red-400">{errorMsg}</p>
          )}

          <button
            type="button"
            onClick={handleJoin}
            disabled={status === "loading" || code.length < 4}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #ff5500, #ff7730)", boxShadow: "0 8px 24px rgba(255,85,0,0.35)" }}
          >
            <LogIn className="h-4 w-4" />
            {status === "loading" ? "Finding room…" : "Join Room"}
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] text-white/25">or</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <p className="mt-4 text-center text-[12px] text-white/40">
            Don&apos;t have a code?{" "}
            <Link href="/" className="font-bold text-[#ff5500] hover:text-[#ff7730] transition-colors">
              Browse anime
            </Link>{" "}
            and create a room from the watch page.
          </p>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { icon: Wifi, label: "Real-time sync", desc: "Play, pause & seek together" },
            { icon: Users, label: "Up to 20 people", desc: "Invite your whole crew" },
            { icon: Zap, label: "Instant setup", desc: "No account required" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff5500]/15 text-[#ff5500]">
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-[11px] font-bold text-white/80">{label}</p>
              <p className="mt-0.5 text-[10px] text-white/35">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
