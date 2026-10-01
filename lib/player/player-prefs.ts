"use client";

import type { ServerPreference } from "@/lib/anime/server-selection";

/**
 * Player preferences persisted in localStorage.
 * Each key is prefixed with `player:` to avoid collisions.
 */

const PREFIX = "player:";

function get(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(`${PREFIX}${key}`);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${PREFIX}${key}`, value);
  } catch {
    // Storage full or disabled — silent fail
  }
}

// ── Volume ──────────────────────────────────────────────────────────────────

export function getVolume(): number {
  const raw = get("volume");
  if (raw === null) return 1;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
}

export function setVolume(value: number): void {
  set("volume", String(Math.max(0, Math.min(1, value))));
}

export function getMuted(): boolean {
  return get("muted") === "1";
}

export function setMuted(value: boolean): void {
  set("muted", value ? "1" : "0");
}

// ── Quality ─────────────────────────────────────────────────────────────────

export type QualityPref = "auto" | number; // number = height (1080, 720, etc.)

export function getQualityPref(): QualityPref {
  const raw = get("quality");
  if (!raw || raw === "auto") return "auto";
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "auto";
}

export function setQualityPref(value: QualityPref): void {
  set("quality", String(value));
}

// ── Subtitles ───────────────────────────────────────────────────────────────

export function getSubtitleLang(): string | null {
  return get("subtitle-lang");
}

export function setSubtitleLang(lang: string | null): void {
  set("subtitle-lang", lang ?? "");
}

export function getSubtitlesEnabled(): boolean {
  const raw = get("subtitles-on");
  return raw === null ? true : raw === "1"; // default ON
}

export function setSubtitlesEnabled(on: boolean): void {
  set("subtitles-on", on ? "1" : "0");
}

export interface SubtitleStyle {
  fontSize: number;   // percentage, 80–200, default 100
  color: string;      // hex color, default "#ffffff"
  bgOpacity: number;  // 0–100, default 75
  fontFamily: "sans" | "serif" | "mono";
  presentation: "hard" | "classic";
}

const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 100,
  color: "#ffffff",
  bgOpacity: 75,
  fontFamily: "sans",
  presentation: "hard",
};

const SUBTITLE_PRESENTATION_KEY = "subtitle-presentation-v2";

export function getSubtitleStyle(): SubtitleStyle {
  const raw = get("subtitle-style");
  const presentation = get(SUBTITLE_PRESENTATION_KEY) === "classic" ? "classic" : "hard";
  if (!raw) return { ...DEFAULT_SUBTITLE_STYLE, presentation };
  try {
    const parsed = JSON.parse(raw);
    return {
      fontSize: typeof parsed.fontSize === "number" ? Math.max(50, Math.min(250, parsed.fontSize)) : DEFAULT_SUBTITLE_STYLE.fontSize,
      color: typeof parsed.color === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : DEFAULT_SUBTITLE_STYLE.color,
      bgOpacity: typeof parsed.bgOpacity === "number" ? Math.max(0, Math.min(100, parsed.bgOpacity)) : DEFAULT_SUBTITLE_STYLE.bgOpacity,
      fontFamily: ["sans", "serif", "mono"].includes(parsed.fontFamily) ? parsed.fontFamily : DEFAULT_SUBTITLE_STYLE.fontFamily,
      presentation,
    };
  } catch {
    return { ...DEFAULT_SUBTITLE_STYLE };
  }
}

export function setSubtitleStyle(style: Partial<SubtitleStyle>): void {
  const current = getSubtitleStyle();
  if (style.presentation) {
    set(SUBTITLE_PRESENTATION_KEY, style.presentation);
  }
  set("subtitle-style", JSON.stringify({ ...current, ...style }));
}

export function getSubtitlePresentation(): SubtitleStyle["presentation"] {
  return getSubtitleStyle().presentation;
}

export function setSubtitlePresentation(presentation: SubtitleStyle["presentation"]): void {
  setSubtitleStyle({ presentation });
}

// ── Remembered server choice (all anime) ─────────────────────────────────────

/** The viewer's last server choice (soft/hard/dub + provider, or an embed), shape-checked on read. */
export function getServerPreference(): ServerPreference | null {
  const raw = get("server-preference");
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ServerPreference;
    if (typeof value?.dubbed !== "boolean") return null;
    return { dubbed: value.dubbed, sub: value.sub ?? null, dub: value.dub ?? null };
  } catch {
    return null;
  }
}

export function setServerPreference(preference: ServerPreference): void {
  set("server-preference", JSON.stringify(preference));
}

// ── Preferred subtitle source ───────────────────────────────────────────────

export function getPreferredSubServer(animeId: string): string | null {
  return get(`preferred-sub-server:${animeId}`) || null;
}

export function setPreferredSubServer(animeId: string, serverId: string | null): void {
  set(`preferred-sub-server:${animeId}`, serverId || "");
}

// ── Playback Speed ──────────────────────────────────────────────────────────

const VALID_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function getPlaybackSpeed(): number {
  const raw = get("speed");
  if (!raw) return 1;
  const parsed = parseFloat(raw);
  return VALID_SPEEDS.includes(parsed) ? parsed : 1;
}

export function setPlaybackSpeed(value: number): void {
  set("speed", String(value));
}

// ── Auto-Skip ───────────────────────────────────────────────────────────────

export function getAutoSkip(): boolean {
  const raw = get("auto-skip");
  return raw === null ? true : raw === "1"; // default ON
}

export function setAutoSkip(on: boolean): void {
  set("auto-skip", on ? "1" : "0");
}

// ── Auto-Advance (next episode) ─────────────────────────────────────────────

export function getAutoAdvance(): boolean {
  const raw = get("auto-advance");
  return raw === null ? true : raw === "1"; // default ON
}

export function setAutoAdvance(on: boolean): void {
  set("auto-advance", on ? "1" : "0");
}

// ── Autoplay ───────────────────────────────────────────────────────────────

export function getAutoplay(): boolean {
  const raw = get("autoplay");
  // Default ON: it only starts episodes the viewer switches to after their first Play, which
  // browsers allow with sound. A viewer who turned it off keeps "0".
  return raw === null ? true : raw === "1";
}

export function setAutoplay(on: boolean): void {
  set("autoplay", on ? "1" : "0");
}
