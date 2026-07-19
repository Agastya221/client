"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Link2, Loader2, Users, X, Play, LogIn } from "lucide-react";

export type PartyMode = "create" | "join";

interface WatchPartyModalProps {
  animeId: string;
  animeTitle: string;
  animePoster?: string;
  episodeNumber: number;
  memberId: string;
  memberName: string;
  accentColor?: string;
  onClose: () => void;
  onRoomReady: (code: string, isHost: boolean, animeId?: string, episodeNumber?: number) => void;
  activeRoomCode?: string | null;
  onLeaveRoom?: () => void;
}

export default function WatchPartyModal({
  animeId,
  animeTitle,
  animePoster,
  episodeNumber,
  memberId,
  memberName,
  accentColor = "#ff5500",
  onClose,
  onRoomReady,
  activeRoomCode,
  onLeaveRoom,
}: WatchPartyModalProps) {
  const [mode, setMode] = useState<PartyMode>("create");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const joinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "join") joinInputRef.current?.focus();
  }, [mode]);

  const handleCreate = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/watch-party/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: memberId, hostName: memberName, animeId, animeTitle, animePoster, episodeNumber }),
      });
      if (!res.ok) throw new Error("Failed to create room");
      const data = await res.json() as { code: string };
      setCreatedCode(data.code);
    } catch {
      setErrorMsg("Could not create room. Please try again.");
      setStatus("idle");
      return;
    }
    setStatus("idle");
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setErrorMsg("Enter a valid room code"); return; }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/watch-party/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, memberId, memberName }),
      });
      if (res.status === 404) { setErrorMsg("Room not found or expired"); setStatus("idle"); return; }
      if (res.status === 409) { setErrorMsg("Room is full (max 20 members)"); setStatus("idle"); return; }
      if (!res.ok) throw new Error();
      const room = await res.json() as { animeId: string; episodeNumber: number };
      onRoomReady(code, false, room.animeId, room.episodeNumber);
    } catch {
      setErrorMsg("Could not join room. Please try again.");
      setStatus("idle");
    }
  };

  const handleEnterRoom = () => {
    if (createdCode) onRoomReady(createdCode, true);
  };

  const copyLink = async () => {
    if (!createdCode) return;
    const url = `${window.location.origin}/watch-party?code=${createdCode}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLinkActive = async () => {
    if (!activeRoomCode) return;
    const url = `${window.location.origin}/watch-party?code=${activeRoomCode}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = async () => {
    if (!createdCode) return;
    await navigator.clipboard.writeText(createdCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-in"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Watch Party"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 shadow-2xl animate-modal-in"
        style={{
          background: "linear-gradient(135deg, #0f1012 0%, #141618 100%)",
          boxShadow: `0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06), 0 0 60px ${accentColor}18`,
        }}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-white/[0.06] px-6 py-5">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{ background: `radial-gradient(ellipse at 30% 50%, ${accentColor}, transparent 70%)` }}
          />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-[12px]"
                style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}
              >
                <Users className="h-4 w-4" style={{ color: accentColor }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Watch Together</h2>
                <p className="text-[11px] text-white/40 truncate max-w-[200px]">{animeTitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white btn-press-active"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {activeRoomCode ? (
            /* Active Room Details / Leave Warning */
            <div className="space-y-5 animate-message-in">
              <div className="rounded-[12px] border border-red-500/20 bg-red-500/5 p-4">
                <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Active Watch Party</h3>
                <p className="text-[12px] text-white/60 leading-relaxed">
                  You are currently connected to Watch Together room <strong className="text-white">{activeRoomCode}</strong>.
                  Leaving this room will disconnect you and you will stop syncing with other members.
                </p>
              </div>

              <button
                type="button"
                onClick={copyLinkActive}
                className="w-full flex items-center justify-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] py-2.5 text-[12px] font-bold text-white/60 transition-all hover:bg-white/[0.07] hover:text-white btn-press-active"
              >
                <Link2 className="h-3.5 w-3.5" />
                {copied ? "Invite link copied!" : "Copy invite link"}
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-[12px] border border-white/10 bg-white/[0.03] py-3.5 text-[13px] font-bold text-white/50 hover:text-white transition-all btn-press-active"
                >
                  Keep Watching
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLeaveRoom?.();
                    onClose();
                  }}
                  className="flex-1 rounded-[12px] bg-red-600 hover:bg-red-700 py-3.5 text-[13px] font-bold text-white transition-all btn-press-active shadow-lg shadow-red-600/20"
                >
                  Leave Party
                </button>
              </div>
            </div>
          ) : !createdCode ? (
            <>
              {/* Mode tabs */}
              <div className="relative mb-6 flex rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-1">
                {/* Sliding active pill indicator */}
                <div
                  className="absolute bottom-1 top-1 rounded-[8px] transition-all duration-300 ease-out"
                  style={{
                    width: "calc(50% - 4px)",
                    background: accentColor,
                    boxShadow: `0 4px 16px ${accentColor}44`,
                    transform: mode === "create" ? "translateX(0)" : "translateX(100%)",
                    left: "4px",
                  }}
                />
                
                {(["create", "join"] as PartyMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setErrorMsg(""); }}
                    className="relative z-10 flex-1 py-2 text-[12px] font-bold capitalize transition-colors duration-200"
                    style={{
                      color: mode === m ? "#fff" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {m === "create" ? "Create Room" : "Join Room"}
                  </button>
                ))}
              </div>

              <div
                className="transition-[max-height] duration-300 ease-in-out overflow-hidden"
                style={{
                  maxHeight: mode === "create"
                    ? (errorMsg ? "380px" : "300px")
                    : (errorMsg ? "240px" : "180px")
                }}
              >
                {mode === "create" ? (
                  <div className="space-y-4 animate-message-in">
                    <div className="rounded-[12px] border border-white/[0.07] bg-white/[0.025] p-4">
                      <p className="text-[12px] text-white/50 leading-relaxed">
                        Create a private room and share the code with friends. You&apos;ll control playback — everyone follows your lead.
                      </p>
                    </div>
                    <div className="rounded-[12px] border border-white/[0.07] bg-white/[0.025] p-3 flex items-center gap-3">
                      {animePoster && (
                        <img src={animePoster} alt="" className="h-12 w-8 rounded-md object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-white/90 truncate">{animeTitle}</p>
                        <p className="text-[10px] text-white/40 mt-0.5">Episode {episodeNumber}</p>
                      </div>
                    </div>
                    {errorMsg && (
                      <p className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{errorMsg}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={status === "loading"}
                      className="w-full flex items-center justify-center gap-2 rounded-[12px] py-3.5 text-[13px] font-bold text-white transition-all disabled:opacity-60 btn-press-active"
                      style={{ background: accentColor, boxShadow: `0 8px 24px ${accentColor}44` }}
                    >
                      {status === "loading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Users className="h-4 w-4" />
                      )}
                      {status === "loading" ? "Creating…" : "Create Room"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 animate-message-in">
                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white/40">
                        Room Code
                      </label>
                      <input
                        ref={joinInputRef}
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                        onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                        placeholder="ANIM4X"
                        maxLength={6}
                        className="w-full rounded-[12px] border border-white/10 bg-white/[0.04] px-4 py-3.5 text-center text-2xl font-black tracking-[0.3em] text-white placeholder-white/20 outline-none transition-all focus:border-white/25"
                      />
                    </div>
                    {errorMsg && (
                      <p className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{errorMsg}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleJoin}
                      disabled={status === "loading" || joinCode.length < 4}
                      className="w-full flex items-center justify-center gap-2 rounded-[12px] py-3.5 text-[13px] font-bold text-white transition-all disabled:opacity-50 btn-press-active"
                      style={{ background: accentColor }}
                    >
                      {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                      {status === "loading" ? "Joining…" : "Join Room"}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Room created — show code */
            <div className="space-y-5">
              <div className="text-center">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-white/40">Your Room Code</p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="group mx-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-8 py-4 transition-all hover:bg-white/[0.07] btn-press-active"
                >
                  <span
                    className="text-4xl font-black tracking-[0.25em]"
                    style={{ color: accentColor }}
                  >
                    {createdCode}
                  </span>
                  <Copy className="h-4 w-4 text-white/30 group-hover:text-white/60" />
                </button>
                <p className="mt-2 text-[11px] text-white/30">Click to copy code · Expires in 6 hours</p>
              </div>

              <button
                type="button"
                onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] py-2.5 text-[12px] font-bold text-white/60 transition-all hover:bg-white/[0.07] hover:text-white btn-press-active"
              >
                <Link2 className="h-3.5 w-3.5" />
                {copied ? "Link copied!" : "Copy invite link"}
              </button>

              <button
                type="button"
                onClick={handleEnterRoom}
                className="w-full flex items-center justify-center gap-2 rounded-[12px] py-3.5 text-[13px] font-bold text-white transition-all btn-press-active"
                style={{ background: accentColor, boxShadow: `0 8px 24px ${accentColor}44` }}
              >
                <Play className="h-4 w-4 fill-current" />
                Start Watching
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
