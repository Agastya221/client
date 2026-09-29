"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rankServerOptions } from "@/lib/anime/server-selection";
import type { ProviderId, ServerHealthResult, ServerOption } from "@/lib/anime/types";

type StoredHealth = ServerHealthResult & { source: "probe" | "playback" };

interface HealthScan {
  scope: string;
  controller: AbortController;
  queue: ServerOption[];
  seen: Set<string>;
  active: number;
  enabled: boolean;
  paused: boolean;
  request: (option: ServerOption) => Promise<void>;
}

function probeable(option: ServerOption): boolean {
  return option.id.startsWith("anivexa2-") && option.transport !== "embed";
}

function drain(scan: HealthScan): void {
  if (!scan.enabled || scan.paused || scan.controller.signal.aborted) return;
  while (scan.active < 2 && scan.queue.length > 0) {
    const option = scan.queue.shift()!;
    scan.active++;
    void scan.request(option).finally(() => {
      scan.active--;
      drain(scan);
    });
  }
}

export function useServerHealth(input: {
  animeId: string;
  anilistId: number | null | undefined;
  episodeNumber: number;
  uiProvider: ProviderId;
  serverOptions: ServerOption[];
  playbackBusy: boolean;
}) {
  const scope = `${input.animeId}|${input.episodeNumber}`;
  const scanRef = useRef<HealthScan | null>(null);
  const [state, setState] = useState<{ scope: string; results: Record<string, StoredHealth> }>({
    scope,
    results: {},
  });

  useEffect(() => {
    const controller = new AbortController();
    const scan: HealthScan = {
      scope,
      controller,
      queue: [],
      seen: new Set(),
      active: 0,
      enabled: false,
      paused: false,
      request: async (option) => {
        const requestController = new AbortController();
        const abort = () => requestController.abort();
        controller.signal.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 30_000);
        let result: ServerHealthResult = {
          status: "unverified", reason: "Check unavailable", checkedAt: Date.now(),
        };
        try {
          const params = new URLSearchParams({
            anilistId: String(input.anilistId),
            episodeNumber: String(input.episodeNumber),
            uiProvider: input.uiProvider,
            server: option.id,
            dub: option.category === "dub" ? "1" : "0",
          });
          const response = await fetch(`/api/anivexa/server-health?${params}`, {
            cache: "no-store",
            signal: requestController.signal,
          });
          if (response.ok) {
            const payload = await response.json() as ServerHealthResult;
            if (["working", "failed", "unverified"].includes(payload.status)) result = payload;
          }
        } catch {
          if (controller.signal.aborted) return;
          result = { status: "unverified", reason: "Check timed out", checkedAt: Date.now() };
        } finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener("abort", abort);
        }
        if (controller.signal.aborted) return;
        setState((current) => {
          if (current.scope !== scope || current.results[option.id]?.source === "playback") return current;
          return { scope, results: { ...current.results, [option.id]: { ...result, source: "probe" } } };
        });
      },
    };
    scanRef.current = scan;
    const reset = setTimeout(() => setState((current) => current.scope === scope
      ? current
      : { scope, results: {} }), 0);
    const start = setTimeout(() => {
      scan.enabled = true;
      drain(scan);
    }, 3_000);
    return () => {
      clearTimeout(reset);
      clearTimeout(start);
      controller.abort();
      if (scanRef.current === scan) scanRef.current = null;
    };
  }, [scope, input.anilistId, input.episodeNumber, input.uiProvider]);

  useEffect(() => {
    const scan = scanRef.current;
    if (!scan || scan.scope !== scope) return;
    scan.paused = input.playbackBusy;
    if (!scan.paused) drain(scan);
  }, [input.playbackBusy, scope]);

  useEffect(() => {
    const scan = scanRef.current;
    if (!scan || scan.scope !== scope || !input.anilistId) return;
    for (const option of input.serverOptions) {
      if (!probeable(option) || scan.seen.has(option.id)) continue;
      scan.seen.add(option.id);
      scan.queue.push(option);
    }
    scan.queue = rankServerOptions(scan.queue, {});
    drain(scan);
  }, [input.anilistId, input.serverOptions, scope]);

  const markWorking = useCallback((serverId: string) => {
    if (!serverId) return;
    setState((current) => {
      if (current.scope !== scope || current.results[serverId]?.source === "playback" &&
          current.results[serverId]?.status === "working") return current;
      return { scope, results: {
        ...current.results,
        [serverId]: { status: "working", reason: "Playback started", checkedAt: Date.now(), source: "playback" },
      } };
    });
  }, [scope]);

  const markFailed = useCallback((serverId: string, reason = "Playback failed") => {
    if (!serverId) return;
    setState((current) => current.scope !== scope ? current : { scope, results: {
      ...current.results,
      [serverId]: { status: "failed", reason, checkedAt: Date.now(), source: "playback" },
    } });
  }, [scope]);

  const healthById: Record<string, ServerHealthResult> = state.scope === scope ? state.results : {};
  const healthFor = (option: ServerOption): ServerHealthResult | null => {
    if (!probeable(option)) return null;
    return healthById[option.id] || { status: "checking" as const, reason: "Checking server", checkedAt: 0 };
  };

  return { healthById, healthFor, markWorking, markFailed };
}
