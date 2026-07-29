"use client";

import { useSyncExternalStore } from "react";

export const DEFAULT_THEME_ACCENT = "#52ff7f";

let currentGlobalAccent = DEFAULT_THEME_ACCENT;
const accentListeners = new Set<() => void>();

export function dispatchThemeAccent(color: string | null | undefined) {
  if (typeof window === "undefined") return;
  const targetColor = color && color.trim() ? color.trim() : DEFAULT_THEME_ACCENT;
  if (currentGlobalAccent === targetColor) return;
  currentGlobalAccent = targetColor;
  accentListeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent("yorumi:theme-accent", { detail: { color: targetColor } }));
}

export function useThemeAccent(): string {
  return useSyncExternalStore(
    (listener) => {
      accentListeners.add(listener);
      return () => accentListeners.delete(listener);
    },
    () => currentGlobalAccent,
    () => DEFAULT_THEME_ACCENT,
  );
}
