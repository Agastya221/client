"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import "./player.css";

interface IframePlayerProps {
  iframeUrl: string;
  onReady?: () => void;
  onTimeUpdate?: (time: number) => void;
  onEpisodeEnd?: () => void;
  /** Called if the player shows an error (410 / not found) and needs to try next server */
  onPlayerError?: () => void;
}

// How long to wait for a "playing" signal from the embed before declaring it failed.
// MegaPlay sends a postMessage when video actually starts playing.
// flixcloud.cc embeds take longer to initialize and may not send postMessages at all.
const PLAY_SIGNAL_TIMEOUT_MS = 20_000;

// postMessage event types that confirm the player is actually playing (not an error page)
const PLAY_SIGNALS = new Set([
  "playing", "play", "ready", "canplay", "timeupdate", "PLAYING", "READY",
]);

export default function IframePlayer({ iframeUrl, onReady, onTimeUpdate, onEpisodeEnd, onPlayerError }: IframePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const playSignalReceivedRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server name badge removed — server identity is shown in the server selector UI only.

  const handleLoad = useCallback(() => {
    setLoaded(true);
    onReady?.();
  }, [onReady]);

  // Clean up timer when URL changes (server switch) or unmount, and start error timer immediately
  useEffect(() => {
    setLoaded(false);
    playSignalReceivedRef.current = false;

    if (onPlayerError) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);

      errorTimerRef.current = setTimeout(() => {
        if (!playSignalReceivedRef.current) {
          // No play signal received — iframe is showing an error
          onPlayerError();
        }
      }, PLAY_SIGNAL_TIMEOUT_MS);
    }

    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [iframeUrl, onPlayerError]);

  // Listen for postMessage events from the embed
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data) return;

      const data = event.data;

      // Mark as playing if we get any play-related postMessage
      const eventType = typeof data === "string" ? data : (data.type || data.event || data.name || "");
      if (PLAY_SIGNALS.has(String(eventType))) {
        playSignalReceivedRef.current = true;
        if (errorTimerRef.current) {
          clearTimeout(errorTimerRef.current);
          errorTimerRef.current = null;
        }
      }

      if (typeof data !== "object") return;

      // Handle progress events
      const progress = data.progress ?? data.percent ?? data.percentComplete;
      if (typeof progress === "number") {
        playSignalReceivedRef.current = true; // progress = it's actually playing
        onTimeUpdate?.(progress * 100);
      }

      // Handle time events
      if (typeof data.currentTime === "number") {
        playSignalReceivedRef.current = true;
        onTimeUpdate?.(data.currentTime);
      }

      // Handle completion
      if (data.type === "ended" || data.event === "ended" || data.complete === true) {
        onEpisodeEnd?.();
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onTimeUpdate, onEpisodeEnd]);

  return (
    <div className="anime-player" style={{ position: "relative", background: "#000" }}>
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        onLoad={handleLoad}
        title="Anime Video Player"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.3s ease",
          background: "#000",
        }}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
