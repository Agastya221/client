"use client";

import React, { useState, useRef, useEffect } from "react";
import SeekBar, { formatTime } from "./controls/SeekBar";
import QualityMenu from "./controls/QualityMenu";
import SpeedMenu from "./controls/SpeedMenu";
import SubtitleMenu from "./controls/SubtitleMenu";
import {
  PlayIcon, PauseIcon,
  VolumeHighIcon, VolumeLowIcon, VolumeMuteIcon,
  FullscreenIcon, FullscreenExitIcon,
  PipIcon, SubtitleIcon, SpeedIcon,
} from "./PlayerIcons";
import type { SkipTimes } from "@/lib/player/aniskip";
import type { SubtitleTrack } from "@/lib/anime/types";
import type { SubtitleStyle } from "@/lib/player/player-prefs";

interface PlayerControlsProps {
  // Playback state
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  playbackSpeed: number;
  isFullscreen: boolean;

  // Quality
  qualityLevels: { height: number; bitrate: number }[];
  currentQualityLevel: number;
  autoQualityLabel: string;

  // Subtitles
  subtitleTracks: SubtitleTrack[];
  activeSubtitleTrack: string | null;
  subtitleStyle: SubtitleStyle;

  // Skip
  skipTimes: SkipTimes | null;

  // Actions
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onQualityChange: (level: number) => void;
  onSubtitleTrackChange: (lang: string | null) => void;
  onSubtitleStyleChange: (style: Partial<SubtitleStyle>) => void;
  onFullscreenToggle: () => void;
  onPipToggle: () => void;
  onToggleShortcuts: () => void;
}

type MenuType = "quality" | "speed" | "subtitle" | null;

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: "100%", height: "100%" }}>
      <path
        fill="currentColor"
        d="M20,5H4C2.9,5,2,5.9,2,7v10c0,1.1,0.9,2,2,2h16c1.1,0,2,-0.9,2-2V7C22,5.9,21.1,5,20,5z M20,17H4V7h16V17z M5,8h2v2H5V8z M5,11h2v2H5V11z M5,14h2v2H5V14z M8,8h2v2H8V8z M8,11h2v2H8V11z M8,14h2v2H8V14z M11,8h2v2h-2V8z M11,11h2v2h-2V11z M11,14h5v2h-5V14z M14,8h2v2h-2V8z M14,11h2v2h-2V11z M17,8h2v2h-2V8z M17,11h2v2h-2V11z M17,14h2v2h-2V14z"
      />
    </svg>
  );
}

export default function PlayerControls(props: PlayerControlsProps) {
  const [activeMenu, setActiveMenu] = useState<MenuType>(null);
  const [volumeVisible, setVolumeVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    // Delay to prevent the opening click from immediately closing
    const id = setTimeout(() => document.addEventListener("click", handler), 10);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", handler);
    };
  }, [activeMenu]);

  const toggleMenu = (menu: MenuType) => {
    setActiveMenu((prev) => (prev === menu ? null : menu));
  };

  // Volume icon selection
  const VolumeIcon = props.muted || props.volume === 0
    ? VolumeMuteIcon
    : props.volume < 0.5
      ? VolumeLowIcon
      : VolumeHighIcon;

  const volumePct = props.muted ? 0 : props.volume * 100;

  return (
    <>
      {/* Seek bar */}
      <SeekBar
        currentTime={props.currentTime}
        duration={props.duration}
        buffered={props.buffered}
        skipTimes={props.skipTimes}
        onSeek={props.onSeek}
      />

      {/* Bottom bar */}
      <div className="player-bottom-bar" ref={menuRef}>
        {/* Play/Pause */}
        <button className="player-btn" onClick={props.onPlayPause} title={props.playing ? "Pause (Space)" : "Play (Space)"}>
          {props.playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Volume */}
        <div className="volume-group" onMouseEnter={() => setVolumeVisible(true)} onMouseLeave={() => setVolumeVisible(false)}>
          <button className="player-btn" onClick={props.onMuteToggle} title="Mute (M)">
            <VolumeIcon />
          </button>
          <div className={`volume-slider-container${volumeVisible ? " visible" : ""}`}>
            <input
              type="range"
              className="volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={props.muted ? 0 : props.volume}
              onChange={(e) => props.onVolumeChange(parseFloat(e.target.value))}
              style={{ "--volume-pct": `${volumePct}%` } as React.CSSProperties}
            />
          </div>
        </div>

        {/* Time */}
        <span className="player-time">
          {formatTime(props.currentTime)} / {formatTime(props.duration)}
        </span>

        <div className="player-spacer" />

        {/* Speed */}
        <div className="player-menu-anchor">
          <button
            className="player-btn"
            onClick={() => toggleMenu("speed")}
            title="Playback Speed"
          >
            <SpeedIcon />
          </button>
          {activeMenu === "speed" && (
            <SpeedMenu
              currentSpeed={props.playbackSpeed}
              onSelect={props.onSpeedChange}
              onClose={() => setActiveMenu(null)}
            />
          )}
        </div>

        {/* Subtitles */}
        {props.subtitleTracks.length > 0 && (
          <div className="player-menu-anchor">
            <button
              className="player-btn"
              onClick={() => toggleMenu("subtitle")}
              title="Subtitles (C)"
              style={{ color: props.activeSubtitleTrack ? "#e040fb" : undefined }}
            >
              <SubtitleIcon />
            </button>
            {activeMenu === "subtitle" && (
              <SubtitleMenu
                tracks={props.subtitleTracks}
                activeTrack={props.activeSubtitleTrack}
                subtitleStyle={props.subtitleStyle}
                onSelectTrack={props.onSubtitleTrackChange}
                onStyleChange={props.onSubtitleStyleChange}
                onClose={() => setActiveMenu(null)}
              />
            )}
          </div>
        )}

        {/* Quality */}
        {props.qualityLevels.length > 1 && (
          <div className="player-menu-anchor">
            <button
              className="player-btn"
              onClick={() => toggleMenu("quality")}
              title="Quality"
            >
              <SettingsIconMini />
            </button>
            {activeMenu === "quality" && (
              <QualityMenu
                levels={props.qualityLevels}
                currentLevel={props.currentQualityLevel}
                autoLabel={props.autoQualityLabel}
                onSelect={props.onQualityChange}
                onClose={() => setActiveMenu(null)}
              />
            )}
          </div>
        )}

        {/* Keyboard Help */}
        <button className="player-btn" onClick={props.onToggleShortcuts} title="Keyboard Shortcuts (?)">
          <KeyboardIcon />
        </button>

        {/* PiP */}
        <button className="player-btn" onClick={props.onPipToggle} title="Picture in Picture (I)">
          <PipIcon />
        </button>

        {/* Fullscreen */}
        <button className="player-btn" onClick={props.onFullscreenToggle} title="Fullscreen (F)">
          {props.isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </>
  );
}

// Small settings gear for quality button
function SettingsIconMini() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: "100%", height: "100%" }}>
      <path
        fill="currentColor"
        d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
      />
    </svg>
  );
}
