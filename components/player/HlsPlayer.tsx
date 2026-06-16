"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import PlayerControls from "./PlayerControls";
import SubtitleRenderer from "./SubtitleRenderer";
import SkipButton from "./SkipButton";
import { fetchSkipTimes, type SkipTimes } from "@/lib/player/aniskip";
import type { SubtitleTrack, StreamSource } from "@/lib/anime/types";
import type { SubtitleStyle } from "@/lib/player/player-prefs";
import * as prefs from "@/lib/player/player-prefs";
import "./player.css";

interface HlsPlayerProps {
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

interface QualityLevel {
  height: number;
  bitrate: number;
}

// Simple time formatter for the transition overlay
function formatTime(sec: number): string {
  if (isNaN(sec)) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function HlsPlayer({
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
}: HlsPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef(0);
  const lastTapSideRef = useRef<"left" | "right" | null>(null);
  const networkRetryCountRef = useRef(0);

  // Transition & visual feature refs
  const lastTimeRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seekRippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(() => prefs.getVolume());
  const [muted, setMutedState] = useState(() => prefs.getMuted());
  const [playbackSpeed, setPlaybackSpeedState] = useState(() => prefs.getPlaybackSpeed());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [glowDataUrl, setGlowDataUrl] = useState<string | null>(null);

  // Quality
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQualityLevel, setCurrentQualityLevel] = useState(-1); // -1 = auto

  // Subtitles
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<string | null>(() => {
    if (!prefs.getSubtitlesEnabled()) return null;
    return prefs.getSubtitleLang();
  });
  const [subtitleStyle, setSubtitleStyleState] = useState<SubtitleStyle>(() => prefs.getSubtitleStyle());

  // Skip times
  const [skipTimes, setSkipTimes] = useState<SkipTimes | null>(null);
  const [autoSkip, setAutoSkip] = useState(() => prefs.getAutoSkip());

  // Auto-disable VTT overlay for hard sub streams (subtitles are burnt into video)
  useEffect(() => {
    if (isHardSubStream) {
      setActiveSubtitleTrack(null);
    }
  }, [isHardSubStream, source]);

  // Seek ripples feedback
  const [seekRipple, setSeekRipple] = useState<{ side: "left" | "right"; visible: boolean; key: number } | null>(null);

  // Auto-advance
  const [showAutoAdvance, setShowAutoAdvance] = useState(false);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(5);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── HLS Setup ──────────────────────────────────────────────────
  const streamUrl = source.proxiedUrl || source.url;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    // Trigger switching overlay if we are reloading stream at a timestamp
    if (lastTimeRef.current > 0) {
      setIsSwitchingSource(true);
    }

    let hls: Hls | null = null;

    const handleNativeError = () => {
      console.error("Native HLS video playback error");
      onError?.();
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // auto
        capLevelToPlayerSize: true,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        networkRetryCountRef.current = 0; // Reset retry counter on successful manifest parsed
        const levels = data.levels.map((l) => ({
          height: l.height,
          bitrate: l.bitrate,
        }));
        setQualityLevels(levels);

        // Apply saved quality pref
        const savedPref = prefs.getQualityPref();
        if (savedPref !== "auto" && hls) {
          const idx = levels.findIndex((l) => l.height === savedPref);
          if (idx >= 0) {
            hls.currentLevel = idx;
            setCurrentQualityLevel(idx);
          }
        }

        // Restore timestamp and play state if switching language
        if (lastTimeRef.current > 0) {
          video.currentTime = lastTimeRef.current;
          lastTimeRef.current = 0; // reset
        }
        if (wasPlayingRef.current) {
          video.play().catch(() => {});
          wasPlayingRef.current = false; // reset
        }

        onReady?.();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        void data;
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (networkRetryCountRef.current < 3) {
                networkRetryCountRef.current++;
                console.warn(`Hls.js fatal network error (attempt ${networkRetryCountRef.current}), trying to recover...`);
                hls?.startLoad();
              } else {
                console.warn("Hls.js fatal network error: max retries reached. Triggering fallback.");
                setTimeout(() => {
                  hls?.destroy();
                  onError?.();
                }, 0);
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("Hls.js fatal media error, trying to recover...");
              hls?.recoverMediaError();
              break;
            default:
              console.warn("Hls.js fatal error:", data);
              setTimeout(() => {
                hls?.destroy();
                onError?.();
              }, 0);
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari/iOS)
      video.src = streamUrl;
      
      const onNativeLoaded = () => {
        if (lastTimeRef.current > 0) {
          video.currentTime = lastTimeRef.current;
          lastTimeRef.current = 0;
        }
        if (wasPlayingRef.current) {
          video.play().catch(() => {});
          wasPlayingRef.current = false;
        }
        onReady?.();
      };

      video.addEventListener("loadedmetadata", onNativeLoaded, { once: true });
      video.addEventListener("error", handleNativeError);
    }

    // Apply stored preferences
    video.volume = prefs.getVolume();
    video.muted = prefs.getMuted();
    video.playbackRate = prefs.getPlaybackSpeed();

    // Auto-select default subtitle
    if (isHardSubStream) {
      setActiveSubtitleTrack(null);
    } else if (subtitles.length > 0 && prefs.getSubtitlesEnabled()) {
      const savedLang = prefs.getSubtitleLang();
      if (savedLang && subtitles.some((t) => t.lang === savedLang)) {
        setActiveSubtitleTrack(savedLang);
      } else {
        const defaultTrack = subtitles.find((t) => t.isDefault) || subtitles.find((t) => t.lang === "en" || t.lang === "eng");
        if (defaultTrack) setActiveSubtitleTrack(defaultTrack.lang);
      }
    } else {
      setActiveSubtitleTrack(null);
    }

    return () => {
      video.removeEventListener("error", handleNativeError);
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
      // Capture context before URL switch
      if (video) {
        lastTimeRef.current = video.currentTime;
        wasPlayingRef.current = !video.paused;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl, isHardSubStream]);

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

  // ── Video event handlers ───────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdateHandler = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };
    const onDurationChange = () => setDuration(video.duration);
    const onProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      }
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => {
      setIsBuffering(false);
      setIsSwitchingSource(false);
    };
    const onEnded = () => {
      setPlaying(false);
      if (prefs.getAutoAdvance() && onEpisodeEnd) {
        setShowAutoAdvance(true);
        setAutoAdvanceCountdown(5);
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdateHandler);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("progress", onProgress);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onCanPlay);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdateHandler);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onCanPlay);
      video.removeEventListener("ended", onEnded);
    };
  }, [onTimeUpdate, onEpisodeEnd]);

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

  // ── Auto-advance countdown ─────────────────────────────────────
  useEffect(() => {
    if (!showAutoAdvance) return;

    autoAdvanceTimerRef.current = setInterval(() => {
      setAutoAdvanceCountdown((prev) => {
        if (prev <= 1) {
          setShowAutoAdvance(false);
          onEpisodeEnd?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current);
    };
  }, [showAutoAdvance, onEpisodeEnd]);

  // ── Controls auto-hide ─────────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (playing) {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      setControlsVisible(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    } else {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [playing]);

  // ── Fullscreen tracking ────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Seek ripples trigger ────────────────────────────────────────
  const triggerSeekRipple = useCallback((side: "left" | "right") => {
    if (seekRippleTimerRef.current) clearTimeout(seekRippleTimerRef.current);
    setSeekRipple({ side, visible: true, key: Date.now() });
    seekRippleTimerRef.current = setTimeout(() => {
      setSeekRipple(null);
    }, 600);
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const video = videoRef.current;
      if (!video) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          showControls();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          handleMuteToggle();
          break;
        case "arrowleft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          triggerSeekRipple("left");
          showControls();
          break;
        case "arrowright":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          triggerSeekRipple("right");
          showControls();
          break;
        case "j":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          triggerSeekRipple("left");
          showControls();
          break;
        case "l":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
          triggerSeekRipple("right");
          showControls();
          break;
        case "arrowup":
          e.preventDefault();
          handleVolumeChange(Math.min(1, video.volume + 0.1));
          showControls();
          break;
        case "arrowdown":
          e.preventDefault();
          handleVolumeChange(Math.max(0, video.volume - 0.1));
          showControls();
          break;
        case "i":
          e.preventDefault();
          handlePipToggle();
          break;
        case "?":
        case "/":
          if (e.key === "?" || e.shiftKey) {
            e.preventDefault();
            setShortcutsOpen((prev) => !prev);
          }
          break;
        case "c":
          e.preventDefault();
          if (activeSubtitleTrack) {
            setActiveSubtitleTrack(null);
            prefs.setSubtitlesEnabled(false);
          } else {
            const firstTrack = subtitles[0];
            if (firstTrack) {
              setActiveSubtitleTrack(firstTrack.lang);
              prefs.setSubtitlesEnabled(true);
              prefs.setSubtitleLang(firstTrack.lang);
            }
          }
          break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const pct = parseInt(e.key, 10) / 10;
            video.currentTime = video.duration * pct;
            showControls();
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playing, activeSubtitleTrack, subtitles, showControls, triggerSeekRipple]);

  // ── Action handlers ────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  }, []);

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, v));
    video.volume = clamped;
    video.muted = false;
    setVolumeState(clamped);
    setMutedState(false);
    prefs.setVolume(clamped);
    prefs.setMuted(false);
  }, []);

  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMutedState(video.muted);
    prefs.setMuted(video.muted);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeedState(speed);
    prefs.setPlaybackSpeed(speed);
  }, []);

  const handleQualityChange = useCallback((level: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = level;
    setCurrentQualityLevel(level);
    if (level === -1) {
      prefs.setQualityPref("auto");
    } else {
      const lvl = hls.levels[level];
      if (lvl) prefs.setQualityPref(lvl.height);
    }
  }, []);

  const handleSubtitleTrackChange = useCallback((lang: string | null) => {
    setActiveSubtitleTrack(lang);
    prefs.setSubtitlesEnabled(lang !== null);
    if (lang) prefs.setSubtitleLang(lang);
  }, []);

  const handleSubtitleStyleChange = useCallback((style: Partial<SubtitleStyle>) => {
    setSubtitleStyleState((prev) => {
      const next = { ...prev, ...style };
      prefs.setSubtitleStyle(next);
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  const handlePipToggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture();
    } else {
      video.requestPictureInPicture();
    }
  }, []);

  const handleSkip = useCallback((toTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = toTime;
  }, []);

  // ── Mobile double-tap to seek ──────────────────────────────────
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".player-bottom-bar, .seek-bar-container, .player-menu, .skip-button, .auto-advance-overlay, .shortcuts-modal")) return;

    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const xPct = (e.clientX - rect.left) / rect.width;
    const side = xPct < 0.4 ? "left" : xPct > 0.6 ? "right" : null;

    if (now - lastTapTimeRef.current < 300 && side && side === lastTapSideRef.current) {
      const video = videoRef.current;
      if (video) {
        const seekAmount = side === "left" ? -10 : 10;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seekAmount));
        triggerSeekRipple(side);
        if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      }
      lastTapTimeRef.current = 0; // reset
    } else {
      lastTapTimeRef.current = now;
      lastTapSideRef.current = side;

      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      doubleTapTimerRef.current = setTimeout(() => {
        if (Date.now() - now >= 280) return;
        const video = videoRef.current;
        if (video) {
          video.paused ? video.play() : video.pause();
        }
        showControls();
      }, 300);
    }
  }, [showControls, triggerSeekRipple]);

  // Auto quality label
  const autoQualityLabel = useMemo(() => {
    const hls = hlsRef.current;
    if (!hls || qualityLevels.length === 0) return "Auto";
    const currentLevel = hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : null;
    const height = currentLevel?.height;
    return height ? `Auto (${height}p)` : "Auto";
  }, [qualityLevels, currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const circumference = 2 * Math.PI * 28;

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

      <div
        ref={containerRef}
        className={`anime-player${isFullscreen ? " fullscreen" : ""}`}
        onMouseMove={showControls}
        onMouseLeave={() => playing && setControlsVisible(false)}
        tabIndex={0}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          className="h-full w-full bg-black"
          autoPlay
          playsInline
          crossOrigin="anonymous"
          onClick={handleContainerClick}
        />

        {/* Loading spinner */}
        {isBuffering && !isSwitchingSource && (
          <div className="player-loading">
            <div className="spinner" />
          </div>
        )}

        {/* Switching language overlay */}
        {isSwitchingSource && (
          <div className="switching-source-overlay">
            <div className="switching-card">
              <div className="spinner" style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#e040fb", borderRadius: "50%", animation: "playerSpin 0.8s linear infinite" }} />
              <h4>Switching Audio Track...</h4>
              <p>Resuming playback at {formatTime(currentTime || lastTimeRef.current)}</p>
            </div>
          </div>
        )}

        {/* Expanding seek ripple overlays */}
        {seekRipple && (
          <div key={seekRipple.key} className={`seek-ripple-overlay ${seekRipple.side} animate`}>
            <div className={`seek-ripple-chevrons ${seekRipple.side}`}>
              {seekRipple.side === "left" ? (
                <>
                  <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                  <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                  <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                  <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                  <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </>
              )}
            </div>
            <div className="seek-ripple-text">
              {seekRipple.side === "left" ? "−10 seconds" : "+10 seconds"}
            </div>
          </div>
        )}

        {/* Skip intro/outro button */}
        <SkipButton
          currentTime={currentTime}
          skipTimes={skipTimes}
          autoSkip={autoSkip}
          onSkip={handleSkip}
        />

        {/* Controls overlay */}
        <div
          className={`player-controls-overlay${controlsVisible ? "" : " hidden"}`}
          onClick={handleContainerClick}
        >
          <PlayerControls
            playing={playing}
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            volume={volume}
            muted={muted}
            playbackSpeed={playbackSpeed}
            isFullscreen={isFullscreen}
            qualityLevels={qualityLevels}
            currentQualityLevel={currentQualityLevel}
            autoQualityLabel={autoQualityLabel}
            subtitleTracks={subtitles}
            activeSubtitleTrack={activeSubtitleTrack}
            subtitleStyle={subtitleStyle}
            skipTimes={skipTimes}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            onMuteToggle={handleMuteToggle}
            onSpeedChange={handleSpeedChange}
            onQualityChange={handleQualityChange}
            onSubtitleTrackChange={handleSubtitleTrackChange}
            onSubtitleStyleChange={handleSubtitleStyleChange}
            onFullscreenToggle={toggleFullscreen}
            onPipToggle={handlePipToggle}
            onToggleShortcuts={() => setShortcutsOpen((prev) => !prev)}
          />
        </div>

        {/* Subtitle renderer */}
        <SubtitleRenderer
          tracks={subtitles}
          activeTrack={activeSubtitleTrack}
          currentTime={currentTime}
          style={subtitleStyle}
          controlsVisible={controlsVisible}
        />

        {/* Keyboard Shortcuts Modal */}
        <div className={`shortcuts-modal-overlay${shortcutsOpen ? " open" : ""}`} onClick={() => setShortcutsOpen(false)}>
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="shortcuts-title">✨ Keyboard Shortcuts</h3>
            <div className="shortcuts-grid">
              <div className="shortcuts-item">
                <span>Play / Pause</span>
                <div className="kbd-keys"><kbd className="kbd-key">Space</kbd><span className="text-white/40">or</span><kbd className="kbd-key">K</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Seek 5s Back / Forward</span>
                <div className="kbd-keys"><kbd className="kbd-key">←</kbd><kbd className="kbd-key">→</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Seek 10s Back / Forward</span>
                <div className="kbd-keys"><kbd className="kbd-key">J</kbd><kbd className="kbd-key">L</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Volume Up / Down</span>
                <div className="kbd-keys"><kbd className="kbd-key">↑</kbd><kbd className="kbd-key">↓</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Toggle Mute</span>
                <div className="kbd-keys"><kbd className="kbd-key">M</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Toggle Fullscreen</span>
                <div className="kbd-keys"><kbd className="kbd-key">F</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Picture-in-Picture</span>
                <div className="kbd-keys"><kbd className="kbd-key">I</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Toggle Subtitles</span>
                <div className="kbd-keys"><kbd className="kbd-key">C</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Jump to % of video</span>
                <div className="kbd-keys"><kbd className="kbd-key">0</kbd><span>-</span><kbd className="kbd-key">9</kbd></div>
              </div>
              <div className="shortcuts-item">
                <span>Toggle Shortcut Sheet</span>
                <div className="kbd-keys"><kbd className="kbd-key">?</kbd></div>
              </div>
            </div>
            <button className="shortcuts-close-btn" onClick={() => setShortcutsOpen(false)}>Got it</button>
          </div>
        </div>

        {/* Auto-advance overlay */}
        {showAutoAdvance && (
          <div className="auto-advance-overlay">
            <div className="auto-advance-card">
              <div className="auto-advance-timer">
                <svg width="62" height="62" viewBox="0 0 62 62">
                  <circle
                    cx="31"
                    cy="31"
                    r="28"
                    style={{
                      strokeDashoffset: circumference * (1 - autoAdvanceCountdown / 5),
                      transition: "stroke-dashoffset 1s linear",
                    }}
                  />
                </svg>
                <span>{autoAdvanceCountdown}</span>
              </div>
              <h3>Next Episode</h3>
              <p>Playing in {autoAdvanceCountdown} seconds...</p>
              <div className="auto-advance-actions">
                <button
                  className="play-next"
                  onClick={() => {
                    setShowAutoAdvance(false);
                    onEpisodeEnd?.();
                  }}
                >
                  Play Now
                </button>
                <button
                  className="cancel-next"
                  onClick={() => {
                    setShowAutoAdvance(false);
                    if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
