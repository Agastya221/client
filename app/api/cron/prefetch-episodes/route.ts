import { NextResponse } from "next/server";
import { getAccessConfig } from "@/lib/access/invite";
import { routeEnv } from "@/lib/access/route-env";
import { searchAnilist } from "@/lib/anilist/api";
import { hasPlayableStreamSource, resolveStreamSource } from "@/lib/anime/api";
import {
  latestAiredEpisode,
  pickPrefetchWindow,
  PREFETCH_LIST_KEY,
  PREFETCH_LIST_SECONDS,
  PREFETCH_MISS_SECONDS,
  prefetchMissKey,
  type AiringTitle,
} from "@/lib/episode-prefetch";
import { readStoredStream, streamStoreKey, writeStoredStream, writeStoredValue } from "@/lib/stream-store";
import { verifyWarmToken, WARM_HEADER } from "@/lib/warm-pages";

export const dynamic = "force-dynamic";

/** Titles checked per run (3 storage reads each); the ~50 airing titles are covered every ~90 minutes. */
const CHECK_PER_RUN = 6;
/** Lookups per run (Solaris, then Waves if needed): keeps the run under the free plan's ~50 outside requests and Render unhurried. */
const RESOLVE_PER_RUN = 2;
const PROVIDER = "anikoto";
/** Solaris soft subs, whichever variant is fastest (resolved server-side). */
const SOLARIS_SOFT = "anivexa-anikoto-ssub";
const isSolaris = (serverId: string) => serverId.startsWith("anivexa2-anikoto-");
/** One lookup may not take longer than this; a run stops starting new lookups after RUN_BUDGET_MS. */
const LOOKUP_TIMEOUT_MS = 35_000;
const RUN_BUDGET_MS = 100_000;

/**
 * A run once waited on a lookup that never answered until Cloudflare killed it at 15 minutes
 * (2026-10-03, CPU 8 ms), logging nothing. Every lookup is now capped.
 */
function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * GET /api/cron/prefetch-episodes — looks up the latest episode of popular airing shows before
 * anyone asks, so the first viewer gets a stored link (~0.4 s) instead of a 3-6 s provider scrape
 * (and no queue on Render when many arrive together). Called by the worker's cron (worker.ts) on
 * its own schedule, authenticated with the same derived token as the page pre-warmer.
 *
 * Sub only, the same request a viewer opening the episode makes, so the stored "auto" link is
 * exactly what they read. Everything is stored in Redis; nothing here writes to KV.
 */
export async function GET(request: Request) {
  const env = routeEnv();
  const secret = getAccessConfig({ ...env, SITE_ACCESS: "on" }).secret;
  if (!(await verifyWarmToken(secret, request.headers.get(WARM_HEADER)))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  console.log("prefetch start");
  // The airing list, reused for an hour.
  let titles: AiringTitle[] = (await readStoredStream<AiringTitle[]>(PREFETCH_LIST_KEY))?.result ?? [];
  if (titles.length === 0) {
    const result = await searchAnilist({ sort: ["POPULARITY_DESC"], status: "RELEASING", perPage: 50 }).catch(() => null);
    titles = (result?.media ?? []).filter((media) => !media.isAdult).map((media) => ({
      id: media.id, status: media.status, episodes: media.episodes, nextAiringEpisode: media.nextAiringEpisode,
    }));
    if (titles.length > 0) await writeStoredValue(PREFETCH_LIST_KEY, titles, PREFETCH_LIST_SECONDS);
  }

  console.log(`prefetch airing list: ${titles.length} titles`);
  const candidates = titles
    .map((title) => ({ animeId: `anilist~${title.id}`, episode: latestAiredEpisode(title) }))
    .filter((candidate): candidate is { animeId: string; episode: number } => candidate.episode !== null);
  const window = pickPrefetchWindow(candidates, Date.now(), CHECK_PER_RUN);

  const report: { animeId: string; episode: number; result: string; ms?: number }[] = [];
  let resolved = 0;
  const runStarted = Date.now();
  const note = (entry: { animeId: string; episode: number; result: string; ms?: number }) => {
    report.push(entry);
    // Logged as it happens, so a run that is cut off still shows how far it got.
    console.log(`prefetch ${entry.animeId} ep${entry.episode}: ${entry.result}${entry.ms ? ` (${entry.ms} ms)` : ""}`);
  };
  for (const { animeId, episode } of window) {
    const autoKey = streamStoreKey({ animeId, episodeNumber: episode, dubbed: false, server: null, provider: PROVIDER });
    const [stored, missed, solarisMissed] = await Promise.all([
      readStoredStream<{ activeServerId?: string | null }>(autoKey),
      readStoredStream(prefetchMissKey(animeId, episode)),
      readStoredStream(prefetchMissKey(animeId, episode, "solaris")),
    ]);
    const storedServer = stored?.result.activeServerId ?? "";
    if (stored && isSolaris(storedServer)) { note({ animeId, episode, result: "already stored (Solaris)" }); continue; }
    if (stored && solarisMissed) { note({ animeId, episode, result: "stored (Waves; Solaris had none)" }); continue; }
    if (!stored && missed) { note({ animeId, episode, result: "no stream earlier, waiting" }); continue; }
    if (resolved >= RESOLVE_PER_RUN || Date.now() - runStarted > RUN_BUDGET_MS) { note({ animeId, episode, result: "next run" }); continue; }

    resolved += 1;
    const started = Date.now();
    try {
      // Solaris soft subs first, asked for directly: a viewer's first lookup gives Solaris only
      // ~6 s before taking Waves (hard subs), and Solaris's first answer often takes longer. No one
      // is waiting here, so ask Solaris with its full time and make it the episode's default link.
      const solaris = await withTimeout(
        resolveStreamSource({ animeId, episodeNumber: episode, provider: PROVIDER, dubbed: false, server: SOLARIS_SOFT }),
        LOOKUP_TIMEOUT_MS, "Solaris lookup",
      );
      if (hasPlayableStreamSource(solaris.source) && isSolaris(solaris.activeServerId ?? "")) {
        await writeStoredStream(autoKey, solaris);
        note({ animeId, episode, result: `stored Solaris ${solaris.activeServerId}${stored ? " (replaced Waves)" : ""}`, ms: Date.now() - started });
        continue;
      }
      await writeStoredValue(prefetchMissKey(animeId, episode, "solaris"), true, PREFETCH_MISS_SECONDS);
      if (stored) { note({ animeId, episode, result: "Solaris has none; Waves kept", ms: Date.now() - started }); continue; }

      // No Solaris: the normal lookup (Waves), stored by resolveStreamSource itself.
      const result = await withTimeout(
        resolveStreamSource({ animeId, episodeNumber: episode, provider: PROVIDER, dubbed: false, server: null }),
        LOOKUP_TIMEOUT_MS, "Fallback lookup",
      );
      if (hasPlayableStreamSource(result.source)) {
        note({ animeId, episode, result: `stored ${result.activeServerId ?? ""} (no Solaris)`, ms: Date.now() - started });
      } else {
        await writeStoredValue(prefetchMissKey(animeId, episode), true, PREFETCH_MISS_SECONDS);
        note({ animeId, episode, result: "no stream yet", ms: Date.now() - started });
      }
    } catch (error) {
      note({ animeId, episode, result: `error ${error instanceof Error ? error.message.slice(0, 60) : ""}`, ms: Date.now() - started });
    }
  }

  return NextResponse.json({ airing: titles.length, checked: report }, { headers: { "Cache-Control": "no-store" } });
}
