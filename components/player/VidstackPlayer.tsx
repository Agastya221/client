"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  MediaPlayer,
  MediaProvider,
  isHLSProvider,
  isVideoProvider,
  type MediaPlayerInstance,
  type MediaProviderAdapter,
} from "@vidstack/react";
import { defaultLayoutIcons, DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import SkipButton from "./SkipButton";
import { fetchSkipTimes, type SkipTimes } from "@/lib/player/aniskip";
import type { SubtitleTrack, StreamSource } from "@/lib/anime/types";
import { Play, Pause } from "lucide-react";
import "./player.css";

interface VidstackPlayerProps {
  source: StreamSource;
  subtitles: SubtitleTrack[];
  malId?: number | null;
  episodeNumber: number;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  autoSkip?: boolean;
  autoPlay?: boolean;
  startTime?: number;
  /** When true the stream has burnt-in subtitles — VTT overlay is auto-disabled. */
  isHardSubStream?: boolean;
  onEpisodeEnd?: () => void;
  onTimeUpdate?: (time: number, duration: number) => void;
  onReady?: () => void;
  onError?: () => void;
  onPlay?: (time: number) => void;
  onPause?: (time: number) => void;
  onSeek?: (time: number) => void;
}

export default function VidstackPlayer({
  source,
  subtitles,
  malId,
  episodeNumber,
  intro,
  outro,
  autoSkip = true,
  autoPlay = false,
  startTime = 0,
  isHardSubStream = false,
  onEpisodeEnd,
  onTimeUpdate,
  onReady,
  onError,
  onPlay,
  onPause,
  onSeek,
}: VidstackPlayerProps) {
  const playerRef = useRef<MediaPlayerInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackStartedRef = useRef(false);
  const startupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeAppliedRef = useRef(false);
  const [glowDataUrl, setGlowDataUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Play/Pause Overlay Animation
  const [showPlayOverlay, setShowPlayOverlay] = useState(false);
  const [overlayIcon, setOverlayIcon] = useState<"play" | "pause" | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setOverlayIcon(playing ? "play" : "pause");
    setShowPlayOverlay(true);
    const t = setTimeout(() => setShowPlayOverlay(false), 500);
    return () => clearTimeout(t);
  }, [playing]);

  // Skip times
  const [skipTimes, setSkipTimes] = useState<SkipTimes | null>(null);

  // Setup HLS native provider setup
  const onProviderSetup = (provider: MediaProviderAdapter) => {
    if (isVideoProvider(provider)) {
      videoRef.current = provider.video;
    }
  };

  const onProviderChange = useCallback((provider: MediaProviderAdapter | null) => {
    if (!provider || !isHLSProvider(provider)) return;

    // Use the app-bundled HLS runtime so playback does not wait on jsDelivr
    // after the stream URL has already resolved.
    provider.library = Hls;
    provider.config = {
      enableWorker: true,
      lowLatencyMode: false,
      startLevel: 0,
      startFragPrefetch: true,
      capLevelToPlayerSize: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    };
  }, []);

  // ── Ambient Glow Periodic Capturer ─────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let intervalId: ReturnType<typeof setInterval>;

    const updateGlow = () => {
      const canvas = glowCanvasRef.current;
      if (!canvas || !video || video.paused || video.ended) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.3); // low res for speed
        setGlowDataUrl(dataUrl);
      } catch {
        // Fallback under CORS constraints
        setGlowDataUrl(null);
      }
    };

    if (playing) {
      updateGlow();
      intervalId = setInterval(updateGlow, 250);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [playing]);

  // Trigger onReady on mount to immediately dismiss the loading overlay
  // and show the Vidstack player structure.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const streamUrl = source.proxiedUrl || source.url;
  const activeSubtitles = useMemo(() => isHardSubStream ? [] : subtitles, [isHardSubStream, subtitles]);
  const streamType = source.kind === "hls" || source.isM3U8 || streamUrl?.includes(".m3u8")
    ? "application/x-mpegurl"
    : "video/mp4";

  // AnimeGG MP4 URLs can be slow because the first range request redirects to
  // a CDN. Give them time, then fall back to the provider embed if playback
  // never becomes ready.
  useEffect(() => {
    playbackStartedRef.current = false;
    if (startupTimerRef.current) {
      clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }

    if (source.kind === "video" && source.iframeUrl && onError) {
      startupTimerRef.current = setTimeout(() => {
        if (!playbackStartedRef.current) {
          console.warn(JSON.stringify({
            at: new Date().toISOString(),
            scope: "vidstack-player",
            event: "mp4_startup_timeout",
            streamUrl,
            fallbackIframeUrl: source.iframeUrl,
          }));
          onError();
        }
      }, 25000);
    }

    return () => {
      if (startupTimerRef.current) {
        clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
    };
  }, [source.kind, source.iframeUrl, streamUrl, onError]);

  // ── AniSkip Integration ────────────────────────────────────────
  useEffect(() => {
    const serverSkips: SkipTimes = {
      op: intro ?? null,
      ed: outro ?? null,
      recap: null,
    };
    let cancelled = false;

    if (malId && malId > 0 && duration >= 60) {
      fetchSkipTimes(malId, episodeNumber, duration).then((aniskipData) => {
        if (cancelled) return;
        setSkipTimes({
          op: aniskipData.op || serverSkips.op,
          ed: aniskipData.ed || serverSkips.ed,
          recap: aniskipData.recap,
        });
      });
      return () => {
        cancelled = true;
      };
    }

    const updateTimer = setTimeout(() => setSkipTimes(serverSkips), 0);
    return () => clearTimeout(updateTimer);
  }, [malId, episodeNumber, duration, intro, outro]);

  const handleSkip = useCallback((toTime: number, trigger?: Event) => {
    const maximum = Number.isFinite(duration) && duration > 0 ? duration : toTime;
    const targetTime = Math.max(0, Math.min(toTime, maximum));
    const player = playerRef.current;

    if (player) {
      // Keep Vidstack's store, HLS provider, controls, and native video in sync.
      // Writing only to a cached <video> can target a stale provider node.
      player.remoteControl.seek(targetTime, trigger);
      player.currentTime = targetTime;
    } else if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }

    setCurrentTime(targetTime);
    onTimeUpdate?.(targetTime, duration);
  }, [duration, onTimeUpdate]);

  useEffect(() => {
    console.info(JSON.stringify({
      at: new Date().toISOString(),
      scope: "vidstack-player",
      event: "source_loaded",
      sourceKind: source.kind,
      streamUrl,
      streamType,
      isHardSubStream,
      subtitleCount: subtitles.length,
      activeSubtitleCount: activeSubtitles.length,
      subtitles: activeSubtitles.map((sub) => ({ label: sub.label, lang: sub.lang, url: sub.url })),
    }));
  }, [source.kind, streamUrl, streamType, isHardSubStream, subtitles, activeSubtitles]);

  return (
    <div className="player-wrapper">
      {/* Immersive Ambient Glow Background */}
      <div
        className="player-glow-backdrop"
        style={{
          backgroundImage: glowDataUrl ? `url(${glowDataUrl})` : undefined,
          backgroundColor: glowDataUrl ? undefined : "rgba(224, 64, 251, 0.08)",
        }}
      />

      {/* Hidden Frame Grabber Canvas */}
      <canvas ref={glowCanvasRef} width={16} height={9} style={{ display: "none" }} />

      <MediaPlayer
        ref={playerRef}
        className="w-full h-full aspect-video rounded-lg overflow-hidden border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.8)] bg-black"
        src={streamUrl ? { src: streamUrl, type: streamType } : undefined}
        onTimeUpdate={(event) => {
          const time = event.currentTime;
          setCurrentTime(time);
          onTimeUpdate?.(time, duration);
        }}
        onDurationChange={(duration) => setDuration(duration)}
        onEnded={() => onEpisodeEnd?.()}
        onPlay={() => {
          console.info(JSON.stringify({ at: new Date().toISOString(), scope: "vidstack-player", event: "play", streamUrl }));
          playbackStartedRef.current = true;
          if (startupTimerRef.current) {
            clearTimeout(startupTimerRef.current);
            startupTimerRef.current = null;
          }
          setPlaying(true);
          onPlay?.(playerRef.current?.currentTime || 0);
        }}
        onPause={() => {
          setPlaying(false);
          onPause?.(playerRef.current?.currentTime || 0);
        }}
        onSeeking={() => {
          onSeek?.(playerRef.current?.currentTime || 0);
        }}
        onCanPlay={() => {
          console.info(JSON.stringify({ at: new Date().toISOString(), scope: "vidstack-player", event: "can_play", streamUrl }));
          playbackStartedRef.current = true;
          if (startupTimerRef.current) {
            clearTimeout(startupTimerRef.current);
            startupTimerRef.current = null;
          }
          if (!resumeAppliedRef.current && startTime > 0) {
            const maximum = Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - 1) : startTime;
            const targetTime = Math.min(startTime, maximum);
            playerRef.current?.remoteControl.seek(targetTime);
            if (playerRef.current) playerRef.current.currentTime = targetTime;
            if (videoRef.current) videoRef.current.currentTime = targetTime;
            setCurrentTime(targetTime);
            resumeAppliedRef.current = true;
          }
          onReady?.();
        }}
        onError={() => {
          console.warn(JSON.stringify({ at: new Date().toISOString(), scope: "vidstack-player", event: "error", streamUrl, sourceKind: source.kind }));
          onError?.();
        }}
        onProviderChange={onProviderChange}
        onProviderSetup={onProviderSetup}
        crossorigin="anonymous"
        playsInline
        autoPlay={autoPlay}
        preload="auto"
      >
        <MediaProvider>
          {activeSubtitles.map((sub, idx) => (
            <track
              key={idx}
              src={sub.url}
              label={sub.label}
              srcLang={sub.lang}
              kind="subtitles"
              default={sub.isDefault}
            />
          ))}
        </MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} />

        {/* Skip intro/outro button overlay */}
        <SkipButton
          currentTime={currentTime}
          skipTimes={skipTimes}
          autoSkip={autoSkip}
          onSkip={handleSkip}
        />

        {/* Play/Pause Overlay Animation */}
        {showPlayOverlay && overlayIcon && (
          <div className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm animate-play-overlay">
              {overlayIcon === "play" ? (
                <Play className="h-8 w-8 fill-current" />
              ) : (
                <Pause className="h-8 w-8 fill-current" />
              )}
            </div>
          </div>
        )}

      </MediaPlayer>
    </div>
  );
}
