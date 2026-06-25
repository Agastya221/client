"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MediaPlayer, MediaProvider, isVideoProvider, type MediaProviderAdapter } from "@vidstack/react";
import { defaultLayoutIcons, DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import SkipButton from "./SkipButton";
import { fetchSkipTimes, type SkipTimes } from "@/lib/player/aniskip";
import type { SubtitleTrack, StreamSource } from "@/lib/anime/types";
import * as prefs from "@/lib/player/player-prefs";
import "./player.css";

interface VidstackPlayerProps {
  source: StreamSource;
  subtitles: SubtitleTrack[];
  malId?: number | null;
  episodeNumber: number;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  /** When true the stream has burnt-in subtitles — VTT overlay is auto-disabled. */
  isHardSubStream?: boolean;
  onEpisodeEnd?: () => void;
  onTimeUpdate?: (time: number) => void;
  onReady?: () => void;
  onError?: () => void;
}

export default function VidstackPlayer({
  source,
  subtitles,
  malId,
  episodeNumber,
  intro,
  outro,
  isHardSubStream = false,
  onEpisodeEnd,
  onTimeUpdate,
  onReady,
  onError,
}: VidstackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [glowDataUrl, setGlowDataUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Skip times
  const [skipTimes, setSkipTimes] = useState<SkipTimes | null>(null);
  const [autoSkip] = useState(() => prefs.getAutoSkip());

  // Setup HLS native provider setup
  const onProviderSetup = (provider: MediaProviderAdapter) => {
    if (isVideoProvider(provider)) {
      videoRef.current = provider.video;
    }
  };

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

  const playStartedRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger onReady on mount to immediately dismiss the loading overlay
  // and show the Vidstack player structure.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  // Set up an 8-second timeout to fall back to custom embeds if stream playback doesn't start
  useEffect(() => {
    playStartedRef.current = false;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    if (onError) {
      fallbackTimerRef.current = setTimeout(() => {
        if (!playStartedRef.current) {
          console.warn("HLS playback did not start within 8 seconds, falling back to embeds...");
          onError();
        }
      }, 8000);
    }

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [source.url, onError]);

  // ── AniSkip Integration ────────────────────────────────────────
  useEffect(() => {
    const serverSkips: SkipTimes = {
      op: intro ?? null,
      ed: outro ?? null,
      recap: null,
    };

    if (malId && malId > 0) {
      fetchSkipTimes(malId, episodeNumber, duration || undefined).then((aniskipData) => {
        setSkipTimes({
          op: aniskipData.op || serverSkips.op,
          ed: aniskipData.ed || serverSkips.ed,
          recap: aniskipData.recap,
        });
      });
    } else {
      setSkipTimes(serverSkips);
    }
  }, [malId, episodeNumber, duration, intro, outro]);

  const handleSkip = useCallback((toTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = toTime;
    }
  }, []);

  const streamUrl = source.proxiedUrl || source.url;
  const activeSubtitles = isHardSubStream ? [] : subtitles;

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
        className="w-full h-full aspect-video rounded-lg overflow-hidden border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.8)] bg-black"
        src={streamUrl ? { src: streamUrl, type: "application/x-mpegurl" } : undefined}
        onTimeUpdate={(event) => {
          const time = event.currentTime;
          setCurrentTime(time);
          onTimeUpdate?.(time);
        }}
        onDurationChange={(duration) => setDuration(duration)}
        onEnded={() => onEpisodeEnd?.()}
        onPlay={() => {
          setPlaying(true);
          playStartedRef.current = true;
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
        }}
        onPause={() => setPlaying(false)}
        onCanPlay={() => {
          playStartedRef.current = true;
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          onReady?.();
        }}
        onError={() => onError?.()}
        onProviderSetup={onProviderSetup}
        crossorigin="anonymous"
        playsInline
        autoPlay
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

        {/* Premium Top Bar Overlay */}
        <div
          className="player-top-bar"
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            right: "20px",
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
            pointerEvents: "none",
          }}
        >
          <div className="premium-badge-glowing">
            <span className="premium-sparkle">✨</span>
            <span className="premium-text">PREMIUM</span>
          </div>
        </div>
      </MediaPlayer>
    </div>
  );
}
