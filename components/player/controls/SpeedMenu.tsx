"use client";

import React from "react";
import { CheckIcon } from "../PlayerIcons";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface SpeedMenuProps {
  currentSpeed: number;
  onSelect: (speed: number) => void;
  onClose: () => void;
}

export default function SpeedMenu({ currentSpeed, onSelect, onClose }: SpeedMenuProps) {
  return (
    <div className="player-menu" onClick={(e) => e.stopPropagation()}>
      <div className="player-menu-title">Playback Speed</div>
      {SPEEDS.map((speed) => (
        <button
          key={speed}
          className={`player-menu-item${currentSpeed === speed ? " active" : ""}`}
          onClick={() => { onSelect(speed); onClose(); }}
        >
          <span className="check">
            {currentSpeed === speed && <CheckIcon />}
          </span>
          {speed === 1 ? "Normal" : `${speed}×`}
        </button>
      ))}
    </div>
  );
}
