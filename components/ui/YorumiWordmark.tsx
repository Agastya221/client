"use client";

import { useThemeAccent } from "@/lib/theme-accent";

export default function YorumiWordmark({ className = "" }: { className?: string }) {
  const accentColor = useThemeAccent();

  return (
    <span
      aria-label="Yorumi"
      className={`yorumi-wordmark inline-flex items-baseline whitespace-nowrap font-display font-black ${className}`}
    >
      <span className="text-white">Yoru</span>
      <span
        aria-hidden="true"
        className="yorumi-wordmark-accent"
        style={{
          color: accentColor,
          textShadow: `0 0 22px color-mix(in srgb, ${accentColor} 28%, transparent)`,
        }}
      >
        Mi
      </span>
    </span>
  );
}
