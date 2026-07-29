"use client";

import { useEffect } from "react";
import { dispatchThemeAccent } from "@/lib/theme-accent";

export default function ThemeAccentSource({ color }: { color?: string | null }) {
  useEffect(() => {
    dispatchThemeAccent(color);
  }, [color]);

  return (
    <span
      aria-hidden="true"
      data-yorumi-accent-source="true"
      className="pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
    />
  );
}
