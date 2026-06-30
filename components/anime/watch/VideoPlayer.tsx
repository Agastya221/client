"use client";

import React from "react";
import AnimePlayer from "@/components/player/AnimePlayer";
import type { StreamSource, SubtitleTrack } from "@/lib/anime/types";

interface VideoPlayerProps {
  source: StreamSource | null;
  subtitles?: SubtitleTrack[];
  malId?: number | null;
  episodeNumber?: number;
  dubbed?: boolean;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  /** When true the active stream has burnt-in subs — VTT overlay is auto-disabled. */
  isHardSubStream?: boolean;
  onReady?: () => void;
  onTimeUpdate?: (time: number) => void;
  onEpisodeEnd?: () => void;
  onPlaybackError?: () => void;
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
  dubbed = false,
  intro,
  outro,
  isHardSubStream = false,
  onReady,
  onTimeUpdate,
  onEpisodeEnd,
  onPlaybackError,
}: VideoPlayerProps) {
  return (
    <AnimePlayer
      source={source}
      subtitles={subtitles}
      malId={malId}
      episodeNumber={episodeNumber}
      dubbed={dubbed}
      intro={intro}
      outro={outro}
      isHardSubStream={isHardSubStream}
      onReady={onReady}
      onTimeUpdate={onTimeUpdate}
      onEpisodeEnd={onEpisodeEnd}
      onPlaybackError={onPlaybackError}
    />
  );
}
