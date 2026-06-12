"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import type { SubtitleTrack } from "@/lib/anime/types";
import type { SubtitleStyle } from "@/lib/player/player-prefs";
import { fetchAndParseVtt, getActiveCues, type VttCue } from "@/lib/player/subtitle-utils";

interface SubtitleRendererProps {
  tracks: SubtitleTrack[];
  activeTrack: string | null;     // lang code or null
  currentTime: number;
  style: SubtitleStyle;
  controlsVisible: boolean;
}

const FONT_MAP: Record<SubtitleStyle["fontFamily"], string> = {
  sans: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
};

export default function SubtitleRenderer({
  tracks,
  activeTrack,
  currentTime,
  style,
  controlsVisible,
}: SubtitleRendererProps) {
  const [cues, setCues] = useState<VttCue[]>([]);
  const loadedUrlRef = useRef<string | null>(null);

  // Find active track URL
  const activeUrl = useMemo(() => {
    if (!activeTrack) return null;
    const track = tracks.find((t) => t.lang === activeTrack);
    return track?.url ?? null;
  }, [tracks, activeTrack]);

  // Load and parse VTT when track changes
  useEffect(() => {
    if (!activeUrl) {
      setCues([]);
      loadedUrlRef.current = null;
      return;
    }

    // Don't re-fetch same URL
    if (loadedUrlRef.current === activeUrl) return;

    let cancelled = false;
    loadedUrlRef.current = activeUrl;

    fetchAndParseVtt(activeUrl).then((parsed) => {
      if (!cancelled) setCues(parsed);
    });

    return () => {
      cancelled = true;
    };
  }, [activeUrl]);

  // Find active cues at current time
  const activeCues = useMemo(() => {
    if (cues.length === 0 || !activeTrack) return [];
    return getActiveCues(cues, currentTime);
  }, [cues, currentTime, activeTrack]);

  if (activeCues.length === 0) return null;

  const fontSize = Math.max(12, Math.round(18 * (style.fontSize / 100)));
  const bgColor = `rgba(0, 0, 0, ${style.bgOpacity / 100})`;
  const fontFamily = FONT_MAP[style.fontFamily];

  return (
    <div className={`subtitle-overlay${controlsVisible ? "" : " controls-hidden"}`}>
      {activeCues.map((cue) => (
        <div
          key={cue.id}
          className="subtitle-cue"
          style={{
            fontSize: `${fontSize}px`,
            color: style.color,
            backgroundColor: bgColor,
            fontFamily,
          }}
          // dangerouslySetInnerHTML is used here to render VTT formatting tags (<i>, <b>, <u>)
          // The VTT parser only outputs these safe inline tags — no script injection risk.
          dangerouslySetInnerHTML={{ __html: sanitizeVttHtml(cue.text) }}
        />
      ))}
    </div>
  );
}

/**
 * Sanitize VTT cue text — only allow <i>, <b>, <u>, <br>, and strip everything else.
 */
function sanitizeVttHtml(text: string): string {
  return text
    .replace(/\n/g, "<br>")
    .replace(/<(?!\/?(?:i|b|u|br)\b)[^>]*>/gi, "");
}
