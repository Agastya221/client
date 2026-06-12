"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { SkipTimes } from "@/lib/player/aniskip";
import { getActiveSkipZone } from "@/lib/player/aniskip";

interface SkipButtonProps {
  currentTime: number;
  skipTimes: SkipTimes | null;
  autoSkip: boolean;
  onSkip: (toTime: number) => void;
}

const LABELS: Record<string, string> = {
  op: "Skip Intro",
  ed: "Skip Outro",
  recap: "Skip Recap",
};

const AUTO_SKIP_DELAY = 3000; // ms

export default function SkipButton({ currentTime, skipTimes, autoSkip, onSkip }: SkipButtonProps) {
  const [visible, setVisible] = useState(false);
  const [skipType, setSkipType] = useState<string | null>(null);
  const [skipEnd, setSkipEnd] = useState(0);
  const autoSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSkippedRef = useRef<string | null>(null);

  const clearAutoSkipTimer = useCallback(() => {
    if (autoSkipTimerRef.current) {
      clearTimeout(autoSkipTimerRef.current);
      autoSkipTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!skipTimes) {
      setVisible(false);
      return;
    }

    const zone = getActiveSkipZone(currentTime, skipTimes);

    if (zone) {
      // Don't show button for a zone we already auto-skipped
      if (lastSkippedRef.current === zone.type) {
        setVisible(false);
        return;
      }

      setVisible(true);
      setSkipType(zone.type);
      setSkipEnd(zone.interval.end);

      // Start auto-skip countdown if enabled
      if (autoSkip && !autoSkipTimerRef.current) {
        autoSkipTimerRef.current = setTimeout(() => {
          lastSkippedRef.current = zone.type;
          onSkip(zone.interval.end);
          setVisible(false);
          autoSkipTimerRef.current = null;
        }, AUTO_SKIP_DELAY);
      }
    } else {
      setVisible(false);
      clearAutoSkipTimer();
      // Reset skipped tracking when leaving all zones
      if (!getActiveSkipZone(currentTime, skipTimes)) {
        lastSkippedRef.current = null;
      }
    }
  }, [currentTime, skipTimes, autoSkip, onSkip, clearAutoSkipTimer]);

  // Clean up on unmount
  useEffect(() => clearAutoSkipTimer, [clearAutoSkipTimer]);

  // Reset when skip times change (episode change)
  useEffect(() => {
    lastSkippedRef.current = null;
    clearAutoSkipTimer();
  }, [skipTimes, clearAutoSkipTimer]);

  const handleClick = useCallback(() => {
    if (skipType) lastSkippedRef.current = skipType;
    onSkip(skipEnd);
    setVisible(false);
    clearAutoSkipTimer();
  }, [skipEnd, skipType, onSkip, clearAutoSkipTimer]);

  if (!visible || !skipType) return null;

  return (
    <button className="skip-button" onClick={handleClick}>
      {LABELS[skipType] || "Skip"}
      {autoSkip && (
        <span className="skip-countdown" aria-label="Auto-skipping..." />
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
      </svg>
    </button>
  );
}
