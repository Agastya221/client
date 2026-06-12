"use client";

import React from "react";
import { CheckIcon } from "../PlayerIcons";

interface QualityMenuProps {
  levels: { height: number; bitrate: number }[];
  currentLevel: number; // -1 = auto
  autoLabel: string;    // e.g. "Auto (1080p)"
  onSelect: (levelIndex: number) => void; // -1 = auto
  onClose: () => void;
}

function formatLevel(height: number): string {
  if (height >= 1080) return `${height}p HD`;
  if (height >= 720) return `${height}p HD`;
  return `${height}p`;
}

export default function QualityMenu({ levels, currentLevel, autoLabel, onSelect, onClose }: QualityMenuProps) {
  // Sort levels descending by height
  const sorted = [...levels]
    .map((l, i) => ({ ...l, index: i }))
    .sort((a, b) => b.height - a.height);

  return (
    <div className="player-menu" onClick={(e) => e.stopPropagation()}>
      <div className="player-menu-title">Quality</div>

      {/* Auto option */}
      <button
        className={`player-menu-item${currentLevel === -1 ? " active" : ""}`}
        onClick={() => { onSelect(-1); onClose(); }}
      >
        <span className="check">
          {currentLevel === -1 && <CheckIcon />}
        </span>
        {autoLabel}
      </button>

      <div className="player-menu-divider" />

      {sorted.map((level) => (
        <button
          key={level.index}
          className={`player-menu-item${currentLevel === level.index ? " active" : ""}`}
          onClick={() => { onSelect(level.index); onClose(); }}
        >
          <span className="check">
            {currentLevel === level.index && <CheckIcon />}
          </span>
          {formatLevel(level.height)}
        </button>
      ))}
    </div>
  );
}
