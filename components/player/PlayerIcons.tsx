/**
 * Inline SVG icons for the player — no external icon library needed.
 * Each icon is a small React component.
 */
import React from "react";

const S = { width: "100%", height: "100%" };

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M8 5v14l11-7z" /></svg>
);

export const PauseIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);

export const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
);

export const VolumeLowIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" /></svg>
);

export const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
);

export const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
);

export const FullscreenExitIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
);

export const PipIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" /></svg>
);

export const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" /></svg>
);

export const SubtitleIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h2zm-6-4h8v2h-8z" /></svg>
);

export const SpeedIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M10 8v8l6-4-6-4zM13.05 4.24l-1.2-1.2C6.82 3.76 2.84 7.93 3.05 13.05l1.7-.01C4.56 8.83 7.95 5.25 12.15 5.02l.9-.78zM20.25 13.04l1.7.01c.21-5.12-3.77-9.29-8.8-10.01l-1.2 1.2.9.78c4.2.23 7.59 3.81 7.4 8.02z" /></svg>
);

export const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
);

export const SkipBackIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" /></svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
);

export const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" style={S}><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
);
