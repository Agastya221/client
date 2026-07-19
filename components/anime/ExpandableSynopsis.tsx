"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableSynopsisProps {
  text: string;
  maxLength?: number;
  className?: string;
  accentColor?: string;
}

export default function ExpandableSynopsis({
  text,
  maxLength = 280,
  className = "text-white/60",
  accentColor = "#ff5500",
}: ExpandableSynopsisProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > maxLength;

  return (
    <div className="space-y-2">
      <div
        className="transition-[max-height] duration-500 ease-in-out overflow-hidden relative"
        style={{
          maxHeight: expanded ? "1000px" : "76px",
        }}
      >
        <p className={`${className} leading-relaxed text-sm`}>{text}</p>
        {isLong && !expanded && (
          <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-[#0a0b0c] via-[#0a0b0c]/40 to-transparent pointer-events-none" />
        )}
      </div>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-bold transition-all duration-200 hover:-translate-y-px cursor-pointer"
          style={{ color: accentColor }}
        >
          {expanded ? (
            <>
              Read less <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Read more <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
