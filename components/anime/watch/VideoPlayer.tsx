"use client";

import React from "react";
import AnimePlayer from "@/components/player/AnimePlayer";
import type { StreamSource, SubtitleTrack } from "@/lib/anime/types";

interface VideoPlayerProps {
  source: StreamSource | null;
  subtitles?: SubtitleTrack[];
  malId?: number | null;
  episodeNumber?: number;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  onReady?: () => void;
  onTimeUpdate?: (time: number) => void;
  onEpisodeEnd?: () => void;
}

/**
 * Drop-in replacement for the old VideoPlayer stub.
 * Delegates to AnimePlayer which selects HLS or iframe mode.
 */
export default function VideoPlayer({
  source,
  subtitles = [],
  malId,
  episodeNumber = 1,
  intro,
  outro,
  onReady,
  onTimeUpdate,
  onEpisodeEnd,
}: VideoPlayerProps) {
  return (
    <AnimePlayer
      source={source}
      subtitles={subtitles}
      malId={malId}
      episodeNumber={episodeNumber}
      intro={intro}
      outro={outro}
      onReady={onReady}
      onTimeUpdate={onTimeUpdate}
      onEpisodeEnd={onEpisodeEnd}
    />
  );
}
