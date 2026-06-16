"use client";

import React, { useState } from "react";
import { CheckIcon, ChevronLeftIcon } from "../PlayerIcons";
import type { SubtitleTrack } from "@/lib/anime/types";
import type { SubtitleStyle } from "@/lib/player/player-prefs";

interface SubtitleMenuProps {
  tracks: SubtitleTrack[];
  activeTrack: string | null; // lang code or null = off
  subtitleStyle: SubtitleStyle;
  onSelectTrack: (lang: string | null) => void;
  onStyleChange: (style: Partial<SubtitleStyle>) => void;
  onClose: () => void;
}

const FONT_FAMILIES: { value: SubtitleStyle["fontFamily"]; label: string }[] = [
  { value: "sans", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
];

export default function SubtitleMenu({
  tracks,
  activeTrack,
  subtitleStyle,
  onSelectTrack,
  onStyleChange,
  onClose,
}: SubtitleMenuProps) {
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <div className="player-menu" onClick={(e) => e.stopPropagation()}>
        <button
          className="player-menu-item"
          onClick={() => setShowSettings(false)}
          style={{ gap: 4 }}
        >
          <span className="check">
            <ChevronLeftIcon />
          </span>
          Subtitle Settings
        </button>
        <div className="player-menu-divider" />

        <div className="subtitle-settings">
          {/* Font size */}
          <label>
            <span>Size ({subtitleStyle.fontSize}%)</span>
            <input
              type="range"
              min={50}
              max={250}
              step={10}
              value={subtitleStyle.fontSize}
              onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
            />
          </label>

          {/* Background opacity */}
          <label>
            <span>Background ({subtitleStyle.bgOpacity}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={subtitleStyle.bgOpacity}
              onChange={(e) => onStyleChange({ bgOpacity: Number(e.target.value) })}
            />
          </label>

          {/* Text color */}
          <label>
            <span>Text color</span>
            <input
              type="color"
              value={subtitleStyle.color}
              onChange={(e) => onStyleChange({ color: e.target.value })}
              style={{ width: 28, height: 28, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
          </label>

          {/* Font family */}
          <label>
            <span>Font</span>
            <select
              value={subtitleStyle.fontFamily}
              onChange={(e) =>
                onStyleChange({ fontFamily: e.target.value as SubtitleStyle["fontFamily"] })
              }
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="player-menu" onClick={(e) => e.stopPropagation()}>
      <div className="player-menu-title" style={{ marginBottom: 4 }}>
        Subtitles
      </div>
      <div className="player-menu-divider" />

      {/* Subtitle track list */}
      <div className="subtitle-menu-tracks-list">
        {/* Off option — always visible */}
        <button
          className={`player-menu-item${activeTrack === null ? " active" : ""}`}
          onClick={() => {
            onSelectTrack(null);
            onClose();
          }}
        >
          <span className="check">{activeTrack === null && <CheckIcon />}</span>
          Off
        </button>

        {tracks.length === 0 ? (
          <div
            style={{
              padding: "10px 10px 4px",
              fontSize: "11px",
              color: "rgba(255,255,255,0.3)",
              textAlign: "center",
            }}
          >
            No subtitle tracks available
          </div>
        ) : (
          tracks.map((track) => (
            <button
              key={track.lang}
              className={`player-menu-item${activeTrack === track.lang ? " active" : ""}`}
              onClick={() => {
                onSelectTrack(track.lang);
                onClose();
              }}
            >
              <span className="check">
                {activeTrack === track.lang && <CheckIcon />}
              </span>
              {track.label || track.lang}
            </button>
          ))
        )}
      </div>

      <div className="player-menu-divider" />

      {/* Settings shortcut */}
      <button
        className="player-menu-item"
        onClick={() => setShowSettings(true)}
        disabled={tracks.length === 0}
        style={{ opacity: tracks.length === 0 ? 0.5 : 1 }}
      >
        <span className="check" />
        Subtitle Settings ⚙
      </button>
    </div>
  );
}
