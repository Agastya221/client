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
  onEpisodeEnd?: () => void;
  onTimeUpdate?: (time: number) => void;
  onReady?: () => void;
}

interface QualityLevel {
  height: number;
  bitrate: number;
}

export default function HlsPlayer({
  source,
  subtitles,
  malId,
  episodeNumber,
  intro,
  outro,
  onEpisodeEnd,
  onTimeUpdate,
  onReady,
}: HlsPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef(0);
  const lastTapSideRef = useRef<"left" | "right" | null>(null);

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

  // Double-tap feedback
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<{ side: "left" | "right"; key: number } | null>(null);

  // Auto-advance
  const [showAutoAdvance, setShowAutoAdvance] = useState(false);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(5);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── HLS Setup ──────────────────────────────────────────────────
  const streamUrl = source.proxiedUrl || source.url;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let hls: Hls | null = null;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari/iOS)
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => onReady?.(), { once: true });
    } else if (Hls.isSupported()) {
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

        onReady?.();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (currentQualityLevel === -1) {
          // We're on auto — don't update the setting, but track current auto level
        }
        void data; // unused but needed for handler signature
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              hls?.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    }

    // Apply stored preferences
    video.volume = prefs.getVolume();
    video.muted = prefs.getMuted();
    video.playbackRate = prefs.getPlaybackSpeed();

    // Auto-select default subtitle
    if (subtitles.length > 0 && prefs.getSubtitlesEnabled()) {
      const savedLang = prefs.getSubtitleLang();
      if (savedLang && subtitles.some((t) => t.lang === savedLang)) {
        setActiveSubtitleTrack(savedLang);
      } else {
        const defaultTrack = subtitles.find((t) => t.isDefault) || subtitles.find((t) => t.lang === "en" || t.lang === "eng");
        if (defaultTrack) setActiveSubtitleTrack(defaultTrack.lang);
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl]);

  // ── AniSkip Integration ────────────────────────────────────────
  useEffect(() => {
    // Merge server-provided intro/outro with AniSkip data
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
    const onCanPlay = () => setIsBuffering(false);
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

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture shortcuts when typing in inputs
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
          showControls();
          break;
        case "arrowright":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          showControls();
          break;
        case "j":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          showControls();
          break;
        case "l":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
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
        case "c":
          e.preventDefault();
          // Toggle subtitles on/off
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
          // Number keys 0-9: jump to 0-90% of video
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
  }, [playing, activeSubtitleTrack, subtitles, showControls]);

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
    // Don't handle if clicking on controls
    if ((e.target as HTMLElement).closest(".player-bottom-bar, .seek-bar-container, .player-menu, .skip-button, .auto-advance-overlay")) return;

    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const xPct = (e.clientX - rect.left) / rect.width;
    const side = xPct < 0.4 ? "left" : xPct > 0.6 ? "right" : null;

    if (now - lastTapTimeRef.current < 300 && side && side === lastTapSideRef.current) {
      // Double tap!
      const video = videoRef.current;
      if (video) {
        const seekAmount = side === "left" ? -10 : 10;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seekAmount));
        setDoubleTapFeedback({ side, key: now });
        // Clear feedback after animation
        if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
        doubleTapTimerRef.current = setTimeout(() => setDoubleTapFeedback(null), 500);
      }
      lastTapTimeRef.current = 0; // reset
    } else {
      // Single tap: toggle controls (or play/pause on desktop)
      lastTapTimeRef.current = now;
      lastTapSideRef.current = side;

      // On desktop single click = play/pause after short delay
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      doubleTapTimerRef.current = setTimeout(() => {
        // Only toggle play/pause if it wasn't a double-tap
        if (Date.now() - now >= 280) return;
        const video = videoRef.current;
        if (video) {
          video.paused ? video.play() : video.pause();
        }
        showControls();
      }, 300);
    }
  }, [showControls]);

  // Auto quality label
  const autoQualityLabel = useMemo(() => {
    const hls = hlsRef.current;
    if (!hls || qualityLevels.length === 0) return "Auto";
    const currentLevel = hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : null;
    const height = currentLevel?.height;
    return height ? `Auto (${height}p)` : "Auto";
  }, [qualityLevels, currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const circumference = 2 * Math.PI * 28; // for auto-advance timer circle

  return (
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
        onClick={handleContainerClick}
      />

      {/* Loading spinner */}
      {isBuffering && (
        <div className="player-loading">
          <div className="spinner" />
        </div>
      )}

      {/* Double-tap feedback */}
      {doubleTapFeedback && (
        <div
          key={doubleTapFeedback.key}
          className={`double-tap-feedback ${doubleTapFeedback.side}`}
        >
          {doubleTapFeedback.side === "left" ? "−10s" : "+10s"}
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
  );
}
