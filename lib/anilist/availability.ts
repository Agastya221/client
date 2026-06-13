import type { AnilistMedia } from "@/lib/anilist/api";
import type { CatalogAvailabilityHint } from "@/lib/anime/api";

/**
 * Returns instant watch hrefs for all anime using their AniList ID.
 * Since MegaPlay/AnimePlay work with AniList IDs directly, every anime
 * is available — no DB lookup or scraper call needed.
 */
export async function getCatalogAvailabilityForMedia(
  media: AnilistMedia[],
): Promise<Record<number, CatalogAvailabilityHint>> {
  return Object.fromEntries(
    media.map((entry) => {
      const latestEpisode =
        entry.status === "RELEASING" && entry.nextAiringEpisode
          ? Math.max(1, entry.nextAiringEpisode.episode - 1)
          : 1;

      return [
        entry.id,
        {
          anilistId: entry.id,
          status: "FOUND" as const,
          isAvailable: true,
          routeId: `anilist~${entry.id}`,
          watchHref: `/anime/anilist~${entry.id}/watch?ep=${latestEpisode}`,
          message: "Watch ready",
        } satisfies CatalogAvailabilityHint,
      ];
    }),
  );
}

export function getWatchHrefsFromAvailability(
  hints: Record<number, CatalogAvailabilityHint>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(hints)
      .filter(([, hint]) => Boolean(hint.watchHref))
      .map(([anilistId, hint]) => [anilistId, hint.watchHref as string]),
  );
}
