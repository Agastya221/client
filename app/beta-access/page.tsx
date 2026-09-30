"use client";

import { useState } from "react";
import { Lock, Sparkles, Key, ExternalLink, ShieldCheck, AlertCircle } from "lucide-react";
import { safeNextPath } from "@/lib/access/next-path";

export default function BetaAccessPage() {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: passcode.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "That invite code isn't valid.");
        setLoading(false);
        return;
      }

      // A full navigation, so the very next request already carries the new access cookie.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(safeNextPath(next, window.location.origin));
    } catch {
      setError("Could not check the code. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#0a0a0f] text-white flex items-center justify-center p-4 overflow-hidden">
      {/* Dynamic Background Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 w-full max-w-md bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl shadow-purple-950/40 text-center">
        {/* Lock Icon Header */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-6 shadow-inner text-purple-400">
          <Lock className="w-8 h-8" />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Invite only • Limited spots</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          YoruMi is invite-only
        </h1>
        <p className="text-sm text-neutral-400 mb-6">
          This is a closed community for now. Enter your invite code to come in.
        </p>

        {/* Passcode Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Invite code
            </label>
            <div className="relative">
              <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="TK-001-XXXXXXXX"
                className="w-full bg-black/40 border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Enter</span>
              </>
            )}
          </button>
        </form>

        {/* Footer / Apply Link */}
        <div className="mt-8 pt-6 border-t border-white/5 text-xs text-neutral-400 flex flex-col items-center gap-2">
          <span>Don&apos;t have an invite yet?</span>
          <a
            href="https://discord.com/channels/1531000380123643904"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300 font-medium transition-colors"
          >
            <span>Apply in Discord (#apply-for-beta)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
