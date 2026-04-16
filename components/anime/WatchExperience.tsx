"use client";

import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import { getFallbackWatchTargets } from "@/lib/anime/fallback";
import type { ProviderId, WatchSessionModel } from "@/lib/anime/types";
import { humanizeProviderId } from "@/lib/anime/utils";
import Hls from "hls.js";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  MonitorPlay,
  Play,
  RefreshCcw,
  Tv2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";

interface WatchExperienceProps {
  initialSession: WatchSessionModel;
}

interface SessionRequest {
  episodeNumber: number;
  provider?: ProviderId | null;
  dubbed?: boolean;
  server?: string | null;
}

function buildWatchSessionUrl(session: WatchSessionModel, request: SessionRequest): string {
  const params = new URLSearchParams();
  params.set("animeId", session.anime.id);
  params.set("episodeNumber", String(request.episodeNumber));
  if (request.provider) params.set("provider", request.provider);
  if (request.dubbed) params.set("dub", "1");
  if (request.server) params.set("server", request.server);
  return `/api/watch-session?${params.toString()}`;
}

export default function WatchExperience({ initialSession }: WatchExperienceProps) {
  const [session, setSession] = useState(initialSession);
  const [isPending, startTransition] = useTransition();
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(null);
  const [showEmbed, setShowEmbed] = useState(initialSession.source?.kind === "iframe");
  const [isRecovering, setIsRecovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const triedTargetsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSession(initialSession);
    setPlaybackMessage(null);
    setShowEmbed(initialSession.source?.kind === "iframe");
    setIsRecovering(false);
    triedTargetsRef.current.clear();
  }, [initialSession]);

  const destroyPlayer = useEffectEvent(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  });

  const fetchSession = useEffectEvent(async (request: SessionRequest): Promise<WatchSessionModel> => {
    const response = await fetch(buildWatchSessionUrl(session, request), {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as WatchSessionModel | { message?: string } | null;

    if (!response.ok) {
      throw new Error(payload && "message" in payload && payload.message ? payload.message : `Watch session failed with ${response.status}`);
    }

    return payload as WatchSessionModel;
  });

  const applySession = useEffectEvent(async (request: SessionRequest): Promise<WatchSessionModel> => {
    const nextSession = await fetchSession(request);
    setSession(nextSession);
    setPlaybackMessage(null);
    setShowEmbed(nextSession.source?.kind === "iframe");
    return nextSession;
  });

  const activateEmbedFallback = useEffectEvent((message?: string): boolean => {
    if (!session.source?.iframeUrl) return false;
    destroyPlayer();
    setShowEmbed(true);
    setIsRecovering(false);
    setPlaybackMessage(message || `Switched to the embedded ${humanizeProviderId(session.provider)} player.`);
    return true;
  });

  const queueSession = (request: SessionRequest) => {
    triedTargetsRef.current.clear();
    startTransition(() => {
      void applySession(request).catch((error) => {
        setPlaybackMessage(error instanceof Error ? error.message : "Unable to refresh watch session.");
      });
    });
  };

  const recoverPlayback = useEffectEvent(async () => {
    if (!showEmbed && activateEmbedFallback(`Direct stream failed on ${humanizeProviderId(session.provider)}. Switched to the embedded player.`)) {
      return;
    }

    const fallbackTargets = getFallbackWatchTargets(session);
    setIsRecovering(true);

    for (const target of fallbackTargets) {
      const key = `${session.episode.number}:${target.provider}:${target.server || "provider"}`;
      if (triedTargetsRef.current.has(key)) continue;
      triedTargetsRef.current.add(key);

      try {
        const nextSession = await applySession({
          episodeNumber: session.episode.number,
          provider: target.provider,
          dubbed: session.dubbed,
          server: target.server ?? null,
        });

        if (nextSession.source?.kind === "video") {
          setPlaybackMessage(`Recovered playback via ${humanizeProviderId(nextSession.provider)}.`);
          setIsRecovering(false);
          return;
        }

        if (nextSession.source?.iframeUrl) {
          activateEmbedFallback(`Direct sources failed. Switched to ${humanizeProviderId(nextSession.provider)} embed fallback.`);
          return;
        }
      } catch (error) {
        setPlaybackMessage(error instanceof Error ? error.message : "Tried a fallback source and it failed.");
      }
    }

    setIsRecovering(false);
    setPlaybackMessage("All automatic fallbacks were exhausted. Try another provider or episode.");
  });

  useEffect(() => {
    destroyPlayer();

    if (showEmbed || !session.source || session.source.kind !== "video") return;
    const video = videoRef.current;
    const sourceUrl = session.source.proxiedUrl || session.source.url;
    if (!video || !sourceUrl) return;

    if (session.source.isM3U8) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = sourceUrl;
        video.load();
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
        });
        hlsRef.current = hls;
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          setPlaybackMessage("The current stream failed. Trying the next fallback...");
          void recoverPlayback();
        });
      } else {
        setPlaybackMessage("This browser cannot play the proxied HLS stream.");
      }
    } else {
      video.src = sourceUrl;
      video.load();
    }

    return () => {
      destroyPlayer();
    };
  }, [destroyPlayer, recoverPlayback, session.source, showEmbed]);

  const onVideoError = () => {
    setPlaybackMessage("The current source failed. Trying the next fallback...");
    void recoverPlayback();
  };

  const heroImage =
    session.anime.banner ||
    session.anime.poster ||
    "https://placehold.co/1600x900/09090b/f5f5f5?text=KAIDO";
  const canUseEmbedFallback = Boolean(session.source?.iframeUrl);
  const currentEpisodeIndex = session.episodes.findIndex((episode) => episode.number === session.episode.number);
  const previousEpisode = currentEpisodeIndex > 0 ? session.episodes[currentEpisodeIndex - 1] : null;
  const nextEpisode =
    currentEpisodeIndex >= 0 && currentEpisodeIndex < session.episodes.length - 1
      ? session.episodes[currentEpisodeIndex + 1]
      : null;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/8 bg-surface-container-low shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
      <div className="relative">
        <div className="absolute inset-0">
          <img src={heroImage} alt={session.anime.title} className="h-full w-full object-cover opacity-20 blur-[2px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,96,96,0.24),transparent_38%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(5,5,6,0.94),rgba(10,10,12,0.82)_50%,rgba(5,5,6,0.96))]" />
        </div>

        <div className="relative grid gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1.5fr)_23rem]">
          <section className="space-y-6">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/65 shadow-[0_32px_80px_rgba(0,0,0,0.4)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <ProviderBadge provider={session.provider} active />
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">
                    Episode {session.episode.number}
                  </span>
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
                    {session.dubbed ? "Dub" : "Sub"}
                  </span>
                  {session.activeServerId ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">
                      {session.activeServerId}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canUseEmbedFallback && session.source?.kind === "video" ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (showEmbed) {
                          setShowEmbed(false);
                          setPlaybackMessage("Returned to the direct stream.");
                          return;
                        }

                        activateEmbedFallback("Switched to the embedded player.");
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <MonitorPlay className="h-3.5 w-3.5" />
                      {showEmbed ? "Back to direct" : "Use embed"}
                    </button>
                  ) : null}
                  {session.source?.iframeUrl ? (
                    <a
                      href={session.source.iframeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open source
                    </a>
                  ) : null}
                </div>
              </div>

              {showEmbed && session.source?.iframeUrl ? (
                <div className="aspect-video bg-black">
                  <iframe
                    src={session.source.iframeUrl}
                    className="h-full w-full"
                    allowFullScreen
                    title={`${session.anime.title} embedded player`}
                  />
                </div>
              ) : session.source?.kind === "video" ? (
                <div className="relative aspect-video bg-black">
                  <video
                    ref={videoRef}
                    controls
                    playsInline
                    crossOrigin="anonymous"
                    className="h-full w-full bg-black object-contain"
                    onError={onVideoError}
                  />
                </div>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center gap-4 bg-[linear-gradient(160deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-8 text-center">
                  <div className="rounded-full border border-white/10 bg-white/6 p-4 text-primary">
                    <Tv2 className="h-8 w-8" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black tracking-tight text-white">No stream ready</h2>
                    <p className="max-w-xl text-sm leading-relaxed text-white/70">
                      The active provider did not return a direct source yet. Refresh the session, switch provider, or try the embed player if one is available.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        queueSession({
                          episodeNumber: session.episode.number,
                          provider: session.provider,
                          dubbed: session.dubbed,
                          server: null,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Refresh source
                    </button>
                    {canUseEmbedFallback ? (
                      <button
                        type="button"
                        onClick={() => activateEmbedFallback("Switched to the embedded player.")}
                        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <MonitorPlay className="h-4 w-4" />
                        Open embed fallback
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary/90">
                        Now streaming
                      </p>
                      <h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">
                        {session.anime.title}
                      </h1>
                      <p className="mt-1 text-sm text-white/70">{session.episode.title}</p>
                    </div>
                    <p className="max-w-2xl text-sm leading-relaxed text-white/60">
                      {session.anime.description ||
                        "Fast server switching, provider fallback, and embedded recovery are all available from this watch panel."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        queueSession({
                          episodeNumber: session.episode.number,
                          provider: session.provider,
                          dubbed: !session.dubbed,
                          server: null,
                        })
                      }
                      className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      {session.dubbed ? "Switch to sub" : "Try dubbed"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        queueSession({
                          episodeNumber: session.episode.number,
                          provider: session.provider,
                          dubbed: session.dubbed,
                          server: null,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Refresh lane
                    </button>
                    <Link
                      href={session.anime.href}
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Back to details
                    </Link>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Provider lanes</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {session.availableProviders.map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          onClick={() =>
                            queueSession({
                              episodeNumber: session.episode.number,
                              provider,
                              dubbed: session.dubbed,
                              server: null,
                            })
                          }
                          className={`rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                            provider === session.provider
                              ? "border-primary/40 bg-primary/15 text-primary"
                              : "border-white/10 bg-white/[0.04] text-white/70 hover:border-primary/35 hover:text-white"
                          }`}
                        >
                          {humanizeProviderId(provider)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">
                      Server
                    </span>
                    <select
                      value={session.activeServerId || ""}
                      onChange={(event) =>
                        queueSession({
                          episodeNumber: session.episode.number,
                          provider: session.provider,
                          dubbed: session.dubbed,
                          server: event.target.value || null,
                        })
                      }
                      className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-primary/40"
                    >
                      <option value="">Automatic</option>
                      {session.serverOptions.map((option) => (
                        <option key={`${option.provider}-${option.id}`} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {(playbackMessage || isPending || isRecovering) ? (
                  <div className="mt-5 space-y-3">
                    {playbackMessage ? (
                      <div className="flex items-start gap-3 rounded-2xl border border-[#ffb347]/25 bg-[#ffb347]/10 p-4 text-sm text-[#ffe2b3]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{playbackMessage}</p>
                      </div>
                    ) : null}
                    {isPending || isRecovering ? (
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        <span>{isRecovering ? "Trying fallbacks..." : "Refreshing watch session..."}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/45">
                  Episode jump
                </p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    disabled={!previousEpisode}
                    onClick={() =>
                      previousEpisode
                        ? queueSession({
                            episodeNumber: previousEpisode.number,
                            provider: session.provider,
                            dubbed: session.dubbed,
                            server: null,
                          })
                        : undefined
                    }
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm font-semibold text-white transition-colors hover:border-primary/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-2">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </span>
                    <span className="text-white/50">{previousEpisode ? `Ep ${previousEpisode.number}` : "N/A"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!nextEpisode}
                    onClick={() =>
                      nextEpisode
                        ? queueSession({
                            episodeNumber: nextEpisode.number,
                            provider: session.provider,
                            dubbed: session.dubbed,
                            server: null,
                          })
                        : undefined
                    }
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm font-semibold text-white transition-colors hover:border-primary/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-2">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </span>
                    <span className="text-white/50">{nextEpisode ? `Ep ${nextEpisode.number}` : "N/A"}</span>
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Stream status</p>
                  <div className="mt-3 space-y-2">
                    {session.watchAttempts.length > 0 ? (
                      session.watchAttempts.map((attempt) => (
                        <p
                          key={`${attempt.provider}-${attempt.server || "auto"}-${attempt.reason}`}
                          className="text-sm text-white/65"
                        >
                          <span className="font-semibold text-white">{humanizeProviderId(attempt.provider)}:</span>{" "}
                          {attempt.reason}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-white/65">The active provider is ready and has not needed a watch fallback yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <AttemptTrail
              attempts={session.attempts}
              activeProvider={session.provider}
              label="Catalog fallback trail"
            />
          </section>

          <aside className="space-y-5">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/45 backdrop-blur-xl">
              <div className="aspect-[3/4] overflow-hidden">
                <img
                  src={session.anime.poster || heroImage}
                  alt={session.anime.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary/90">Kaido lane</p>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-white">{session.anime.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    {session.anime.description || "Switch servers, lanes, and fallback embeds without leaving the player."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Providers</p>
                    <p className="mt-2 text-lg font-bold text-white">{session.availableProviders.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Episodes</p>
                    <p className="mt-2 text-lg font-bold text-white">{session.episodes.length}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/45 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/45">Episode list</p>
                  <h2 className="mt-2 text-xl font-black text-white">Keep binging</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
                  {session.episodes.length} total
                </span>
              </div>

              <div className="mt-4 max-h-[42rem] space-y-2 overflow-y-auto pr-1">
                {session.episodes.map((episode) => {
                  const active = episode.number === session.episode.number;

                  return (
                    <button
                      key={episode.number}
                      type="button"
                      onClick={() =>
                        queueSession({
                          episodeNumber: episode.number,
                          provider: session.provider,
                          dubbed: session.dubbed,
                          server: null,
                        })
                      }
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        active
                          ? "border-primary/45 bg-primary/12"
                          : "border-white/10 bg-white/[0.03] hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">
                            Episode {episode.number}
                          </p>
                          <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-white">
                            {episode.title}
                          </h3>
                        </div>
                        {active ? (
                          <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
                            Live
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {episode.availableProviders.map((provider) => (
                          <ProviderBadge
                            key={`${episode.number}-${provider}`}
                            provider={provider}
                            active={provider === session.provider && active}
                            subtle
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
