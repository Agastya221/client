"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, KeyRound, LoaderCircle } from "lucide-react";
import { safeNextPath } from "@/lib/access/next-path";

const PRIMARY = "#ff5500";

export default function InviteForm() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ready = code.trim().length > 0 || loading;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That invite code isn't valid.");
        setLoading(false);
        return;
      }
      // A full navigation, so the very next request already carries the new access cookie.
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"), window.location.origin);
      window.location.assign(next === "/" ? "/welcome" : `/welcome?next=${encodeURIComponent(next)}`);
    } catch {
      setError("Could not check the code. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label htmlFor="invite-code" className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
        Invite code
      </label>
      <div
        className={`group relative flex items-center rounded-2xl border bg-black/50 transition-colors focus-within:border-white/30 ${
          error ? "border-red-500/50" : "border-white/10"
        }`}
      >
        <KeyRound className="ml-4 h-4 w-4 shrink-0 text-white/35 transition-colors group-focus-within:text-white/70" aria-hidden="true" />
        <input
          id="invite-code"
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value); if (error) setError(""); }}
          placeholder="TK-000-XXXXXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "invite-error" : undefined}
          className="h-14 w-full bg-transparent px-3 font-mono text-[15px] uppercase tracking-[0.12em] text-white outline-none placeholder:normal-case placeholder:tracking-[0.12em] placeholder:text-white/20"
        />
      </div>

      {error ? (
        <p id="invite-error" role="alert" className="flex items-center gap-2 text-[13px] text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!ready}
        className={`group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl text-[15px] font-extrabold transition-all duration-200 disabled:cursor-not-allowed ${
          ready ? "text-white hover:-translate-y-px active:translate-y-0" : "border border-white/10 bg-white/[0.05] text-white/35"
        }`}
        style={ready ? { background: PRIMARY, boxShadow: `0 14px 40px -12px ${PRIMARY}` } : undefined}
      >
        {loading ? (
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <>
            Unlock YoruMi
            <ArrowRight className="h-4.5 w-4.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
