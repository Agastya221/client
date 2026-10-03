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
import { readStoredStream, streamStoreKey, writeStoredValue } from "@/lib/stream-store";
import { verifyWarmToken, WARM_HEADER } from "@/lib/warm-pages";

export const dynamic = "force-dynamic";

/** Titles checked per run; whole list (~50) covered every ~5 runs (50 minutes). */
const CHECK_PER_RUN = 10;
/** New lookups per run: each keeps the free Render server busy 3-6 s, so only a few. */
const RESOLVE_PER_RUN = 3;
const PROVIDER = "anikoto";

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

  // The airing list, reused for an hour.
  let titles: AiringTitle[] = (await readStoredStream<AiringTitle[]>(PREFETCH_LIST_KEY))?.result ?? [];
  if (titles.length === 0) {
    const result = await searchAnilist({ sort: ["POPULARITY_DESC"], status: "RELEASING", perPage: 50 }).catch(() => null);
    titles = (result?.media ?? []).filter((media) => !media.isAdult).map((media) => ({
      id: media.id, status: media.status, episodes: media.episodes, nextAiringEpisode: media.nextAiringEpisode,
    }));
    if (titles.length > 0) await writeStoredValue(PREFETCH_LIST_KEY, titles, PREFETCH_LIST_SECONDS);
  }

  const candidates = titles
    .map((title) => ({ animeId: `anilist~${title.id}`, episode: latestAiredEpisode(title) }))
    .filter((candidate): candidate is { animeId: string; episode: number } => candidate.episode !== null);
  const window = pickPrefetchWindow(candidates, Date.now(), CHECK_PER_RUN);

  const report: { animeId: string; episode: number; result: string; ms?: number }[] = [];
  let resolved = 0;
  for (const { animeId, episode } of window) {
    const key = streamStoreKey({ animeId, episodeNumber: episode, dubbed: false, server: null, provider: PROVIDER });
    const [stored, missed] = await Promise.all([
      readStoredStream(key),
      readStoredStream(prefetchMissKey(animeId, episode)),
    ]);
    if (stored) { report.push({ animeId, episode, result: "already stored" }); continue; }
    if (missed) { report.push({ animeId, episode, result: "no stream earlier, waiting" }); continue; }
    if (resolved >= RESOLVE_PER_RUN) { report.push({ animeId, episode, result: "next run" }); continue; }

    resolved += 1;
    const started = Date.now();
    try {
      // Stores the link itself (auto key and the server's own key; see resolveStreamSource).
      const result = await resolveStreamSource({ animeId, episodeNumber: episode, provider: PROVIDER, dubbed: false, server: null });
      if (hasPlayableStreamSource(result.source)) {
        report.push({ animeId, episode, result: `stored ${result.activeServerId ?? ""}`, ms: Date.now() - started });
      } else {
        await writeStoredValue(prefetchMissKey(animeId, episode), true, PREFETCH_MISS_SECONDS);
        report.push({ animeId, episode, result: "no stream yet", ms: Date.now() - started });
      }
    } catch (error) {
      report.push({ animeId, episode, result: `error ${error instanceof Error ? error.message.slice(0, 60) : ""}`, ms: Date.now() - started });
    }
  }

  return NextResponse.json({ airing: titles.length, checked: report }, { headers: { "Cache-Control": "no-store" } });
}
