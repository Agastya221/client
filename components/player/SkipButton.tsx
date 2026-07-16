"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { SkipTimes } from "@/lib/player/aniskip";
import { getActiveSkipZone } from "@/lib/player/aniskip";

interface SkipButtonProps {
  currentTime: number;
  skipTimes: SkipTimes | null;
  autoSkip: boolean;
  onSkip: (toTime: number, trigger?: Event) => void;
}

const LABELS: Record<string, string> = {
  op: "Skip Intro",
  ed: "Skip Outro",
  recap: "Skip Recap",
};

const AUTO_SKIP_DELAY = 3000;

export default function SkipButton({ currentTime, skipTimes, autoSkip, onSkip }: SkipButtonProps) {
  const autoSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeZone = useMemo(
    () => skipTimes ? getActiveSkipZone(currentTime, skipTimes) : null,
    [currentTime, skipTimes],
  );
  const zoneKey = activeZone
    ? `${activeZone.type}:${activeZone.interval.start}:${activeZone.interval.end}`
    : null;
  const skipEnd = activeZone?.interval.end ?? 0;

  const clearAutoSkipTimer = useCallback(() => {
    if (autoSkipTimerRef.current) {
      clearTimeout(autoSkipTimerRef.current);
      autoSkipTimerRef.current = null;
    }
  }, []);

  // The primitive zone key remains stable as playback advances inside the same
  // intro/outro, so time-update renders do not restart the three-second timer.
  useEffect(() => {
    clearAutoSkipTimer();
    if (!autoSkip || !zoneKey) return;

    autoSkipTimerRef.current = setTimeout(() => {
      onSkip(skipEnd);
      autoSkipTimerRef.current = null;
    }, AUTO_SKIP_DELAY);

    return clearAutoSkipTimer;
  }, [autoSkip, zoneKey, skipEnd, onSkip, clearAutoSkipTimer]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSkip(skipEnd, event.nativeEvent);
    clearAutoSkipTimer();
  }, [skipEnd, onSkip, clearAutoSkipTimer]);

  if (!activeZone) return null;

  return (
    <button
      type="button"
      className="skip-button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={handleClick}
    >
      {LABELS[activeZone.type] || "Skip"}
      {autoSkip ? (
        <span className="skip-countdown" aria-label="Auto-skipping..." />
      ) : null}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
      </svg>
    </button>
  );
}
