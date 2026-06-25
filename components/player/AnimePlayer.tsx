"use client";

import React, { useCallback, useRef, useState } from "react";
import type { StreamSource, SubtitleTrack } from "@/lib/anime/types";

import VidstackPlayer from "./VidstackPlayer";
import IframePlayer from "./IframePlayer";

// Fallback server order when the primary server returns an error.
// MegaPlay uses AniList IDs (ani/) — already fixed in URL construction.
// This cycles through alternates when a 410/error still slips through.
const FALLBACK_SERVERS: Record<string, string[]> = {
  "megaplay.buzz": ["animeplay.cfd", "tryembed.us.cc", "mostream.us"],
  "animeplay.cfd": ["megaplay.buzz", "tryembed.us.cc", "mostream.us"],
  "tryembed.us.cc": ["megaplay.buzz", "animeplay.cfd", "mostream.us"],
  "mostream.us": ["megaplay.buzz", "animeplay.cfd", "tryembed.us.cc"],
};

/**
 * Build a fallback iframe URL for the next server, reusing the same
 * AniList ID and episode number from the original URL.
 */
function buildFallbackUrl(originalUrl: string, nextHost: string): string | null {
  try {
    const url = new URL(originalUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    // URL structure: /stream/ani/{anilistId}/{episode}/{lang}
    const idType = parts[1] ?? "ani"; // "ani" or "mal"
    const id = parts[2];
    const episode = parts[3];
    const lang = parts[4] ?? "sub";

    if (!id || !episode) return null;

    if (nextHost.includes("megaplay")) {
      return `https://megaplay.buzz/stream/${idType}/${id}/${episode}/${lang}`;
    }
    if (nextHost.includes("animeplay")) {
      return `https://animeplay.cfd/stream/${idType}/${id}/${episode}/${lang}`;
    }
    if (nextHost.includes("tryembed")) {
      return `https://tryembed.us.cc/embed/anime/${id}/${episode}/${lang}`;
    }
    if (nextHost.includes("mostream")) {
      return `https://mostream.us/anime.php?mal=${id}&e=${episode}&lang=${lang}`;
    }
    return null;
  } catch {
    return null;
  }
}

interface AnimePlayerProps {
  source: StreamSource | null;
  subtitles: SubtitleTrack[];
  malId?: number | null;
  episodeNumber: number;
  dubbed?: boolean;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  /** When true the active stream has burnt-in subs — VTT overlay is auto-disabled. */
  isHardSubStream?: boolean;
  onEpisodeEnd?: () => void;
  onTimeUpdate?: (time: number) => void;
  onReady?: () => void;
}

/**
 * Root player component — selects the right player mode:
 *
 * 1. HLS Mode: direct .m3u8 URL → custom HLS player with quality, subs, skip
 * 2. Iframe Mode: MegaPlay/AnimePlay embed → auto-cycles servers on error (410)
 * 3. Empty state: no source
 */
export default function AnimePlayer({
  source,
  subtitles,
  malId,
  episodeNumber,
  dubbed = false,
  intro,
  outro,
  isHardSubStream = false,
  onEpisodeEnd,
  onTimeUpdate,
  onReady,
}: AnimePlayerProps) {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [failedHosts, setFailedHosts] = useState<Set<string>>(new Set());
  const [allFailed, setAllFailed] = useState(false);

  // Reset fallback state when the source changes (user manually switched
  // server, language, or navigated). This ensures a manual change
  // is not overridden by a previous auto-fallback state.
  const sourceIframeUrl = source?.iframeUrl ?? null;
  const sourceKey = source ? `${source.kind}|${source.url || ""}|${source.iframeUrl || ""}` : null;
  const prevSourceKeyRef = useRef(sourceKey);
  if (prevSourceKeyRef.current !== sourceKey) {
    prevSourceKeyRef.current = sourceKey;
    if (fallbackUrl !== null || failedHosts.size > 0 || allFailed) {
      setFallbackUrl(null);
      setFailedHosts(new Set());
      setAllFailed(false);
    }
  }

  // Trigger onReady when allFailed becomes true, so the loading overlay is dismissed
  // and the user can see the "All servers failed to load" screen.
  React.useEffect(() => {
    if (allFailed) {
      onReady?.();
    }
  }, [allFailed, onReady]);

  // The iframe URL to actually render: fallback takes priority over source URL
  const iframeUrl = fallbackUrl ?? sourceIframeUrl;

  // DISABLE_CUSTOM_EMBEDS blocks generic custom embed servers (megaplay, animeplay, etc.)
  // but should NOT block provider-direct embeds (flixcloud.cc/e/...) from Anivexa worker.
  // Provider embeds are set as iframeUrl on the source object directly.
  const DISABLE_CUSTOM_EMBEDS = true;

  // Called by VidstackPlayer/IframePlayer when playback fails
  const handlePlayerError = useCallback(() => {
    // If HLS failed but we have a provider-direct iframe URL (e.g. flixcloud embed),
    // fall through to iframe player instead of immediately marking as failed.
    if (sourceIframeUrl && !fallbackUrl) {
      // Let the iframe try — the render logic below will pick it up
      setFallbackUrl(sourceIframeUrl);
      return;
    }

    if (DISABLE_CUSTOM_EMBEDS) {
      console.warn("All playback sources exhausted (custom embeds disabled).");
      setAllFailed(true);
      return;
    }

    if (!iframeUrl) {
      // HLS failed, fallback to MegaPlay (Server 1)
      const lang = dubbed ? "dub" : "sub";
      // Use malId (representing either malId or anilistId) to construct fallback
      const fallback = `https://megaplay.buzz/stream/ani/${malId || 0}/${episodeNumber}/${lang}`;
      setFallbackUrl(fallback);
      return;
    }

    try {
      const currentHost = new URL(iframeUrl).hostname;
      const nextHosts = (FALLBACK_SERVERS[currentHost] ?? []).filter(
        (h) => !failedHosts.has(h),
      );

      setFailedHosts((prev) => new Set(prev).add(currentHost));

      if (nextHosts.length === 0) {
        setAllFailed(true);
        return;
      }

      const nextUrl = buildFallbackUrl(iframeUrl, nextHosts[0]);
      if (nextUrl) {
        setFallbackUrl(nextUrl);
      } else {
        setAllFailed(true);
      }
    } catch {
      setAllFailed(true);
    }
  }, [iframeUrl, sourceIframeUrl, fallbackUrl, failedHosts, malId, episodeNumber, dubbed]);

  // ── No source at all ──────────────────────────────────────────────────────
  if (!source) {
    return (
      <div
        className="anime-player"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.5)",
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
          <div>No playable source available</div>
          <div style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>
            Try switching the server or provider
          </div>
        </div>
      </div>
    );
  }

  // ── All embed servers tried and failed ───────────────────────────────────
  if (allFailed) {
    return (
      <div
        className="anime-player"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.5)",
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
          <div>All servers failed to load</div>
          <div style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>
            This episode may not be available yet. Try another provider.
          </div>
        </div>
      </div>
    );
  }


  // ── HLS Mode — Plays direct .m3u8 streams in custom HlsPlayer ──────────
  const hlsUrl = source.proxiedUrl || source.url;
  // Only use HLS player when source.kind is explicitly "hls" or when no iframe is available.
  // If kind is "iframe", go directly to IframePlayer (don't try doomed HLS proxy).
  const isHls = source.kind !== "iframe" && (source.isM3U8 || source.kind === "hls" || Boolean(hlsUrl?.includes(".m3u8"))) && !fallbackUrl;

  if (isHls && hlsUrl) {
    return (
      <VidstackPlayer
        source={source}
        subtitles={subtitles}
        malId={malId}
        episodeNumber={episodeNumber}
        intro={intro}
        outro={outro}
        isHardSubStream={isHardSubStream}
        onEpisodeEnd={onEpisodeEnd}
        onTimeUpdate={onTimeUpdate}
        onReady={onReady}
        onError={handlePlayerError}
      />
    );
  }

  // ── Iframe Mode — auto-cycles servers on error ───────────────────────────
  if (iframeUrl) {
    // For provider-direct embeds (source.kind === "iframe", e.g. flixcloud.cc/e/...),
    // disable the error detection timer because these embeds don't send postMessage
    // play-signal events. The 20s timer would always fire and mark the player as failed
    // even when video is playing fine. Users can manually switch servers if needed.
    const isProviderEmbed = source?.kind === "iframe";
    return (
      <IframePlayer
        key="custom-iframe-player"
        iframeUrl={iframeUrl}
        onReady={onReady}
        onTimeUpdate={onTimeUpdate}
        onEpisodeEnd={onEpisodeEnd}
        onPlayerError={isProviderEmbed ? undefined : handlePlayerError}
      />
    );
  }

  // ── Direct video URL fallback ──────────────────────────────────────────
  if (hlsUrl && !fallbackUrl) {
    return (
      <VidstackPlayer
        source={source}
        subtitles={subtitles}
        malId={malId}
        episodeNumber={episodeNumber}
        intro={intro}
        outro={outro}
        onEpisodeEnd={onEpisodeEnd}
        onTimeUpdate={onTimeUpdate}
        onReady={onReady}
        onError={handlePlayerError}
      />
    );
  }

  return null;
}
