import type { AnilistMedia } from "@/lib/anilist/api";
import {
  getAnimeKaiCatalogAvailabilityHints,
  type CatalogAvailabilityHint,
} from "@/lib/anime/api";

export async function getCatalogAvailabilityForMedia(
  media: AnilistMedia[],
): Promise<Record<number, CatalogAvailabilityHint>> {
  return getAnimeKaiCatalogAvailabilityHints(
    media.map((entry) => ({
      anilistId: entry.id,
      titles: [
        entry.title.english,
        entry.title.romaji,
        entry.title.native,
        ...(entry.synonyms || []),
      ],
    })),
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
