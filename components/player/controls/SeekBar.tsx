"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import type { SkipTimes } from "@/lib/player/aniskip";

interface SeekBarProps {
  currentTime: number;
  duration: number;
  buffered: number; // percentage 0-100
  skipTimes: SkipTimes | null;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SeekBar({ currentTime, duration, buffered, skipTimes, onSeek }: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPos, setHoverPos] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState(0);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getTimeFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return fraction * duration;
    },
    [duration],
  );

  const getPctFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      const time = getTimeFromEvent(e.clientX);
      onSeek(time);
    },
    [getTimeFromEvent, onSeek],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pct = getPctFromEvent(e.clientX);
      setHoverPos(pct);
      setHoverTime(getTimeFromEvent(e.clientX));

      if (isDragging) {
        onSeek(getTimeFromEvent(e.clientX));
      }
    },
    [isDragging, getTimeFromEvent, getPctFromEvent, onSeek],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);
    },
    [],
  );

  const handlePointerLeave = useCallback(() => {
    setHoverPos(null);
    if (!isDragging) setIsDragging(false);
  }, [isDragging]);

  // Release drag on window pointer up (edge case: pointer leaves container while dragging)
  useEffect(() => {
    if (!isDragging) return;
    const up = () => setIsDragging(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [isDragging]);

  // Render skip zone markers
  const renderMarker = (interval: { start: number; end: number } | null, className: string) => {
    if (!interval || duration <= 0) return null;
    const left = (interval.start / duration) * 100;
    const width = ((interval.end - interval.start) / duration) * 100;
    return (
      <div
        className={`seek-bar-marker ${className}`}
        style={{ left: `${left}%`, width: `${Math.max(0.5, width)}%` }}
      />
    );
  };

  return (
    <div
      className={`seek-bar-container${isDragging ? " dragging" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <div className="seek-bar-track" ref={trackRef}>
        {/* Buffered range */}
        <div className="seek-bar-buffered" style={{ width: `${buffered}%` }} />

        {/* Skip zone markers */}
        {skipTimes && renderMarker(skipTimes.op, "intro")}
        {skipTimes && renderMarker(skipTimes.ed, "outro")}
        {skipTimes && renderMarker(skipTimes.recap, "recap")}

        {/* Progress fill */}
        <div className="seek-bar-progress" style={{ width: `${progress}%` }} />

        {/* Thumb */}
        <div className="seek-bar-thumb" style={{ left: `${progress}%` }} />

        {/* Hover time tooltip */}
        {hoverPos !== null && (
          <div className="seek-bar-tooltip" style={{ left: `${hoverPos}%` }}>
            {formatTime(hoverTime)}
          </div>
        )}
      </div>
    </div>
  );
}

export { formatTime };
