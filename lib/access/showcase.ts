import { getAnilistTrending } from "@/lib/anilist/api";

export interface ShowcaseTitle {
  id: number;
  title: string;
  cover: string;
  color: string | null;
  href: string;
}

/**
 * Trending titles for the invite and welcome pages. Never throws: those pages must render
 * even when AniList is unreachable, they just lose their artwork.
 */
export async function getShowcaseTitles(count = 28): Promise<ShowcaseTitle[]> {
  try {
    const media = await getAnilistTrending(count);
    return media
      .filter((m) => !m.isAdult && (m.coverImage?.large || m.coverImage?.extraLarge))
      .map((m) => ({
        id: m.id,
        title: m.title.english || m.title.romaji,
        cover: m.coverImage.large || m.coverImage.extraLarge,
        color: m.coverImage.color,
        href: `/anime/anilist~${m.id}`,
      }));
  } catch {
    return [];
  }
}
