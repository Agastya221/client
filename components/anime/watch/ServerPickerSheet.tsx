"use client";

import { useEffect, useRef } from "react";
import { Check, Server, X } from "lucide-react";
import { useExitTransition } from "@/components/ui/useExitTransition";
import { displayServerLabel } from "@/lib/anime/server-selection";
import { SERVER_MODE_BADGES } from "@/components/anime/watch/WatchUiPrimitives";
import type { ServerOption } from "@/lib/anime/types";

export interface ServerSheetGroup {
  id: string;
  label: string;
  entries: ServerOption[];
  /** Handed back to onSelect/isActive so the caller can tell sub, dub and Hindi apart. */
  meta: { dubbed?: boolean; provider?: "desidub" };
}

interface ServerPickerSheetProps {
  groups: ServerSheetGroup[];
  accentColor: string;
  disabled?: boolean;
  /** Scrolls this group into view when the sheet opens (used by the Embed button). */
  focusGroupId?: string | null;
  isActive: (entry: ServerOption, group: ServerSheetGroup) => boolean;
  onSelect: (entry: ServerOption, group: ServerSheetGroup) => void;
  onClose: () => void;
}

const SWIPE_CLOSE_DISTANCE_PX = 70;

/**
 * Mobile server picker: every server for the current audio in one bottom sheet, so none
 * are hidden behind sideways scrolling. Same sheet shell as BugReportModal.
 */
export default function ServerPickerSheet({
  groups,
  accentColor,
  disabled = false,
  focusGroupId = null,
  isActive,
  onSelect,
  onClose,
}: ServerPickerSheetProps) {
  const { isClosing, requestClose } = useExitTransition(true, onClose);
  const touchStartY = useRef<number | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const visibleGroups = groups.filter((group) => group.entries.length > 0);
  const total = visibleGroups.reduce((sum, group) => sum + group.entries.length, 0);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [requestClose]);

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div
      className={`modal-backdrop-motion fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm ${
        isClosing ? "modal-transition-closing" : ""
      }`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className="modal-panel-motion flex max-h-[88dvh] w-full flex-col rounded-t-[1.5rem] border border-white/10 bg-[#101113] shadow-2xl shadow-black/80"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-sheet-title"
      >
        <div
          className="touch-none px-4 pb-2 pt-3"
          onTouchStart={(event) => { touchStartY.current = event.touches[0].clientY; }}
          onTouchEnd={(event) => {
            if (touchStartY.current === null) return;
            const distance = event.changedTouches[0].clientY - touchStartY.current;
            touchStartY.current = null;
            if (distance > SWIPE_CLOSE_DISTANCE_PX) requestClose();
          }}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{ color: accentColor, background: `${accentColor}18`, borderColor: `${accentColor}55` }}
              >
                <Server className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="server-sheet-title" className="text-base font-extrabold text-white">Select server</h2>
                <p className="text-[11px] text-white/45">
                  {total} {total === 1 ? "server" : "servers"} available
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close server list"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-5 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {visibleGroups.map((group) => (
            <div key={group.id} ref={group.id === focusGroupId ? focusRef : undefined} className="scroll-mt-2">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{group.label}</p>
              <div className="grid grid-cols-2 gap-2">
                {group.entries.map((entry) => {
                  const active = isActive(entry, group);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => {
                        onSelect(entry, group);
                        requestClose();
                      }}
                      className={`flex min-h-14 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                        active ? "text-white" : "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                      }`}
                      style={active ? { background: `${accentColor}1f`, borderColor: `${accentColor}99` } : undefined}
                    >
                      <span
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/25"
                        style={active ? { color: accentColor, borderColor: `${accentColor}55` } : undefined}
                      >
                        <Server className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{displayServerLabel(entry, group.entries)}</span>
                        {(() => {
                          const modeBadge = group.id === "soft" || group.id === "hard" || group.id === "dub"
                            ? SERVER_MODE_BADGES[group.id]
                            : null;
                          // Cards with a tag are too narrow for "Active" as well; the check mark and
                          // highlighted border already say which one is playing.
                          const activeLabel = active && !modeBadge;
                          if (!modeBadge && !activeLabel) return null;
                          return (
                            <span className="mt-0.5 flex items-center gap-1.5">
                              {modeBadge ? (
                                <span
                                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black tracking-widest"
                                  style={modeBadge.style}
                                >
                                  {modeBadge.badge}
                                </span>
                              ) : null}
                              {activeLabel ? (
                                <span className="truncate text-[11px] font-semibold" style={{ color: accentColor }}>Active server</span>
                              ) : null}
                            </span>
                          );
                        })()}
                      </span>
                      {active ? (
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: accentColor }}>
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
