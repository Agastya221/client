"use client";

import {
  WATCH_REPORT_ISSUES,
  type WatchReportIssue,
} from "@/lib/anime/watch-report";
import {
  AlertTriangle,
  Bug,
  Check,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

interface BugReportModalProps {
  animeId: string;
  anilistId?: number | null;
  animeTitle: string;
  episodeNumber: number;
  dubbed: boolean;
  provider: string;
  serverId?: string | null;
  accentColor: string;
  onClose: () => void;
  onSubmitted: (message: string) => void;
  onError: () => void;
}

function colorWithAlpha(color: string, alpha: string): string {
  const normalized = color.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized)
    ? `${normalized}${alpha}`
    : normalized;
}

export default function BugReportModal({
  animeId,
  anilistId,
  animeTitle,
  episodeNumber,
  dubbed,
  provider,
  serverId,
  accentColor,
  onClose,
  onSubmitted,
  onError,
}: BugReportModalProps) {
  const [selectedIssues, setSelectedIssues] = useState<WatchReportIssue[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status !== "sending") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, status]);

  const toggleIssue = (issue: WatchReportIssue) => {
    setSelectedIssues((current) =>
      current.includes(issue)
        ? current.filter((entry) => entry !== issue)
        : [...current, issue]
    );
    setErrorMessage("");
  };

  const submitReport = async () => {
    if (selectedIssues.length === 0 || status === "sending") return;

    setStatus("sending");
    setErrorMessage("");
    try {
      const response = await fetch("/api/watch/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          anilistId: anilistId ?? null,
          animeTitle,
          episodeNumber,
          dubbed,
          provider,
          serverId: serverId || null,
          issues: selectedIssues,
          notes: notes.trim(),
          pageUrl: window.location.href,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "The report could not be submitted.");
      }
      onSubmitted(payload.message || "Report received. Thank you for helping us improve playback.");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "The report could not be submitted.");
      onError();
    }
  };

  const canSubmit = selectedIssues.length > 0 && status !== "sending";
  const accentSoft = colorWithAlpha(accentColor, "18");
  const accentBorder = colorWithAlpha(accentColor, "55");

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && status !== "sending") onClose();
      }}
    >
      <section
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.5rem] border border-white/10 bg-[#101113] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl shadow-black/80 sm:max-w-xl sm:rounded-2xl sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
              style={{ color: accentColor, background: accentSoft, borderColor: accentBorder }}
            >
              <Bug className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="bug-report-title" className="text-base font-extrabold text-white sm:text-lg">
                Report Episode {episodeNumber}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-white/38 sm:text-xs">
                {animeTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={status === "sending"}
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-white/45 transition-colors hover:border-white/15 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Close report form"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold text-white/65">What went wrong?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {WATCH_REPORT_ISSUES.map((issue) => {
              const selected = selectedIssues.includes(issue.id);
              return (
                <button
                  key={issue.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => toggleIssue(issue.id)}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[11px] font-semibold transition-colors sm:text-xs"
                  style={selected
                    ? { color: "#fff", background: accentSoft, borderColor: accentBorder }
                    : { color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.08)" }}
                >
                  <span
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                    style={selected
                      ? { color: "#fff", background: accentColor, borderColor: accentColor }
                      : { borderColor: "rgba(255,255,255,0.22)" }}
                    aria-hidden="true"
                  >
                    {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  {issue.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-bold text-white/65">
            Notes <span className="font-medium text-white/25">(optional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 500))}
            rows={4}
            placeholder="Tell us what happened, which server you used, or what you expected..."
            className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-xs leading-relaxed text-white/75 outline-none transition-colors placeholder:text-white/22 focus:border-white/20"
          />
          <span className="mt-1 block text-right text-[9px] text-white/25">{notes.length}/500</span>
        </label>

        {errorMessage ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2.5 text-[11px] text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={status === "sending"}
            onClick={onClose}
            className="h-11 rounded-xl border border-white/9 bg-white/[0.025] px-5 text-xs font-bold text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submitReport}
            className="inline-flex h-11 min-w-40 items-center justify-center gap-2 rounded-xl border px-5 text-xs font-extrabold text-white transition-all disabled:cursor-not-allowed disabled:border-white/6 disabled:bg-white/[0.035] disabled:text-white/25"
            style={canSubmit ? {
              background: accentColor,
              borderColor: accentColor,
              boxShadow: `0 8px 24px ${accentSoft}`,
            } : undefined}
          >
            {status === "sending" ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending report…
              </>
            ) : (
              <>
                <Bug className="h-4 w-4" aria-hidden="true" />
                Submit report
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
