"use client";

import AttemptTrail from "@/components/anime/AttemptTrail";
import ProviderBadge from "@/components/anime/ProviderBadge";
import { getFallbackWatchTargets } from "@/lib/anime/fallback";
import type { ProviderId, WatchSessionModel } from "@/lib/anime/types";
import { humanizeProviderId } from "@/lib/anime/utils";
import Hls from "hls.js";
import { AlertTriangle, ExternalLink, LoaderCircle, Play, RefreshCcw, Tv2 } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";

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
  const [showEmbed, setShowEmbed] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const triedTargetsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSession(initialSession);
    setPlaybackMessage(null);
    setShowEmbed(false);
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

    if (!response.ok) {
      throw new Error(`Watch session failed with ${response.status}`);
    }

    return (await response.json()) as WatchSessionModel;
  });

  const applySession = useEffectEvent(async (request: SessionRequest): Promise<WatchSessionModel> => {
    const nextSession = await fetchSession(request);
    setSession(nextSession);
    setPlaybackMessage(null);
    setShowEmbed(false);
    return nextSession;
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
    const fallbackTargets = getFallbackWatchTargets(session);

    for (const target of fallbackTargets) {
      const key = `${session.episode.number}:${target.provider}:${target.server || "provider"}`;
      if (triedTargetsRef.current.has(key)) continue;
      triedTargetsRef.current.add(key);

      try {
        setIsRecovering(true);
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

        if (nextSession.source?.kind === "iframe") {
          setPlaybackMessage("Direct streams failed. An embed fallback is ready if you want it.");
          setIsRecovering(false);
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

    if (!session.source || session.source.kind !== "video") return;
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
  }, [destroyPlayer, recoverPlayback, session.source]);

  const onVideoError = () => {
    setPlaybackMessage("The current source failed. Trying the next fallback...");
    void recoverPlayback();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_24rem]">
      <section className="space-y-6">
        <div className="overflow-hidden rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-low shadow-[0_20px_40px_rgba(0,240,255,0.08)]">
          {session.source?.kind === "video" ? (
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                controls
                playsInline
                className="h-full w-full bg-black object-contain"
                onError={onVideoError}
              />
            </div>
          ) : session.source?.kind === "iframe" && showEmbed ? (
            <div className="aspect-video bg-black">
              <iframe
                src={session.source.iframeUrl || undefined}
                className="h-full w-full"
                allowFullScreen
                title={`${session.anime.title} embed fallback`}
              />
            </div>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-4 bg-gradient-to-br from-surface-container to-surface-container-lowest px-8 text-center">
              <div className="rounded-full border border-outline-variant/20 bg-surface-container-high p-4 text-primary">
                <Tv2 className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-on-surface">
                  {session.source?.kind === "iframe" ? "Embed fallback available" : "No stream ready"}
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-on-surface-variant">
                  {session.source?.kind === "iframe"
                    ? "Direct sources were not returned for this episode. You can open the embed fallback manually."
                    : "The active provider did not return a playable source yet. Try another server or switch providers."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {session.source?.kind === "iframe" ? (
                  <button
                    type="button"
                    onClick={() => setShowEmbed(true)}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
                  >
                    Open embed fallback
                  </button>
                ) : null}
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
                  className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh source
                </button>
                {session.source?.iframeUrl ? (
                  <a
                    href={session.source.iframeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in new tab
                  </a>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <ProviderBadge provider={session.provider} active />
                {session.dubbed ? (
                  <span className="rounded-full bg-[#ffb347]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffd79c]">
                    Dub
                  </span>
                ) : (
                  <span className="rounded-full bg-[#69f48d]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8dffab]">
                    Sub
                  </span>
                )}
                {session.activeServerId ? (
                  <span className="rounded-full border border-outline-variant/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    {session.activeServerId}
                  </span>
                ) : null}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                  Episode {session.episode.number}
                </p>
                <h1 className="text-2xl font-black tracking-tight text-on-surface md:text-3xl">
                  {session.anime.title}
                </h1>
                <p className="text-sm text-on-surface-variant">{session.episode.title}</p>
              </div>
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
                className="rounded-full border border-outline-variant/30 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
              >
                {session.dubbed ? "Switch to sub" : "Try dubbed"}
              </button>
              <Link
                href={session.anime.href}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
              >
                <Play className="h-4 w-4 fill-current" />
                Back to details
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                Provider
              </span>
              <div className="flex flex-wrap gap-2">
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
                        : "border-outline-variant/20 bg-surface-container text-on-surface-variant hover:border-primary/30 hover:text-on-surface"
                    }`}
                  >
                    {humanizeProviderId(provider)}
                  </button>
                ))}
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
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
                className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40"
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

          {playbackMessage ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#ffb347]/20 bg-[#ffb347]/10 p-4 text-sm text-[#ffd79c]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{playbackMessage}</p>
            </div>
          ) : null}

          {isPending || isRecovering ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-on-surface-variant">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span>{isRecovering ? "Trying fallback sources..." : "Refreshing watch session..."}</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
            Stream status
          </p>
          <div className="mt-3 space-y-2">
            {session.watchAttempts.length > 0 ? (
              session.watchAttempts.map((attempt) => (
                <p
                  key={`${attempt.provider}-${attempt.server || "auto"}-${attempt.reason}`}
                  className="text-sm text-on-surface-variant"
                >
                  <span className="font-semibold text-on-surface">{humanizeProviderId(attempt.provider)}:</span>{" "}
                  {attempt.reason}
                </p>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant">
                The current provider is ready and has not needed a watch fallback yet.
              </p>
            )}
          </div>
        </div>

        <AttemptTrail
          attempts={session.attempts}
          activeProvider={session.provider}
          label="Catalog fallback trail"
        />
      </section>

      <aside className="space-y-6">
        <div className="rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-low p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
                Episode map
              </p>
              <h2 className="mt-2 text-xl font-black text-on-surface">Pick another episode</h2>
            </div>
            <span className="rounded-full bg-surface-container px-3 py-1 text-xs text-on-surface-variant">
              {session.episodes.length} total
            </span>
          </div>

          <div className="mt-4 max-h-[36rem] space-y-2 overflow-y-auto pr-1">
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
                      ? "border-primary/40 bg-primary/10"
                      : "border-outline-variant/20 bg-surface-container hover:border-primary/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                        Episode {episode.number}
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-on-surface">
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
  );
}
