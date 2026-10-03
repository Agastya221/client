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
    const autoKey = streamStoreKey({ animeId, episodeNumber: episode, dubbed: false, server: null, provider: PROVIDER });
    const [stored, missed, solarisMissed] = await Promise.all([
      readStoredStream<{ activeServerId?: string | null }>(autoKey),
      readStoredStream(prefetchMissKey(animeId, episode)),
      readStoredStream(prefetchMissKey(animeId, episode, "solaris")),
    ]);
    const storedServer = stored?.result.activeServerId ?? "";
    if (stored && isSolaris(storedServer)) { report.push({ animeId, episode, result: "already stored (Solaris)" }); continue; }
    if (stored && solarisMissed) { report.push({ animeId, episode, result: "stored (Waves; Solaris had none)" }); continue; }
    if (!stored && missed) { report.push({ animeId, episode, result: "no stream earlier, waiting" }); continue; }
    if (resolved >= RESOLVE_PER_RUN) { report.push({ animeId, episode, result: "next run" }); continue; }

    resolved += 1;
    const started = Date.now();
    try {
      // Solaris soft subs first, asked for directly: a viewer's first lookup gives Solaris only
      // ~6 s before taking Waves (hard subs), and Solaris's first answer often takes longer. No one
      // is waiting here, so ask Solaris with its full time and make it the episode's default link.
      const solaris = await resolveStreamSource({ animeId, episodeNumber: episode, provider: PROVIDER, dubbed: false, server: SOLARIS_SOFT });
      if (hasPlayableStreamSource(solaris.source) && isSolaris(solaris.activeServerId ?? "")) {
        await writeStoredStream(autoKey, solaris);
        report.push({ animeId, episode, result: `stored Solaris ${solaris.activeServerId}${stored ? " (replaced Waves)" : ""}`, ms: Date.now() - started });
        continue;
      }
      await writeStoredValue(prefetchMissKey(animeId, episode, "solaris"), true, PREFETCH_MISS_SECONDS);
      if (stored) { report.push({ animeId, episode, result: "Solaris has none; Waves kept", ms: Date.now() - started }); continue; }

      // No Solaris: the normal lookup (Waves), stored by resolveStreamSource itself.
      const result = await resolveStreamSource({ animeId, episodeNumber: episode, provider: PROVIDER, dubbed: false, server: null });
      if (hasPlayableStreamSource(result.source)) {
        report.push({ animeId, episode, result: `stored ${result.activeServerId ?? ""} (no Solaris)`, ms: Date.now() - started });
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
