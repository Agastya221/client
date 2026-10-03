/**
 * Instant title search in the browser, from public/search-index.json (the most popular anime on
 * AniList, built by scripts/build-search-index.mjs). Suggestions no longer wait on AniList, whose
 * per-address rate limit the whole site shares through Render: a busy minute there used to leave
 * the search box spinning, or empty for an exact title.
 *
 * Anything not in the list still comes from the normal AniList search; this only answers first.
 */
import type { AnilistMedia } from "@/lib/anilist/api";

export type Row = [number, string, string | 0, string[], string, string | 0, string | 0, string | 0, number, number, string[], number];

export interface IndexFile {
  v: 1;
  coverPrefix: string;
  rows: Row[];
}

interface Entry {
  media: AnilistMedia;
  /** Normalised titles: romaji, English, synonyms. */
  names: string[];
  /** How many of `names` are real titles (the rest are synonyms, which count for less). */
  titleCount: number;
  /** Every word of every title, for word-start matches. */
  words: string[];
  rank: number;
}

let entries: Promise<Entry[]> | null = null;

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toMedia(row: Row, coverPrefix: string): AnilistMedia {
  const [id, romaji, english, synonyms, cover, color, format, status, year, episodes, genres, score] = row;
  const coverUrl = (size: "large" | "medium") =>
    !cover ? "" : cover.startsWith("http") ? cover : `${coverPrefix}${size}/${cover}`;
  return {
    id,
    idMal: null,
    title: { romaji, english: english || null, native: "" },
    synonyms,
    coverImage: { extraLarge: coverUrl("large"), large: coverUrl("large"), medium: coverUrl("medium"), color: color || null },
    bannerImage: null,
    description: null,
    genres,
    averageScore: score || null,
    meanScore: null,
    popularity: 0,
    trending: 0,
    episodes: episodes || null,
    status: status || "",
    format: format || "",
    season: null,
    seasonYear: year || null,
    startDate: { year: year || null },
    studios: { nodes: [] },
    nextAiringEpisode: null,
    trailer: null,
    isAdult: false,
  };
}

export function indexEntries(file: IndexFile): Entry[] {
  return file.rows.map((row, rank) => {
    const media = toMedia(row, file.coverPrefix);
    const titles = [row[1], row[2] || ""].map(normalizeSearchText).filter(Boolean);
    const names = [...titles, ...row[3].map(normalizeSearchText).filter(Boolean)];
    return { media, names, titleCount: titles.length, words: names.flatMap((name) => name.split(" ")), rank };
  });
}

/** Loads the list once per page load (the browser caches the file itself). Never throws. */
export function loadSearchIndex(): Promise<Entry[]> {
  entries ??= fetch("/search-index.json")
    .then((res) => (res.ok ? (res.json() as Promise<IndexFile>) : null))
    .then((file) => (file ? indexEntries(file) : []))
    .catch(() => {
      entries = null; // try again next time
      return [];
    });
  return entries;
}

/**
 * Best matches for a query, most relevant first: an exact title, then titles that start with it,
 * then titles where every word of the query starts a word, then plain substrings. Popularity
 * breaks ties, so "naruto" puts Naruto before a niche spin-off.
 */
export function matchSearchIndex(index: Entry[], query: string, limit = 6): AnilistMedia[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const qWords = q.split(" ");
  const scored: { entry: Entry; score: number }[] = [];
  for (const entry of index) {
    let score = 0;
    entry.names.forEach((name, position) => {
      // A synonym is worth less than a real title: "Onigiri" lists "Demon Slayer" as a synonym,
      // and must not beat "Demon Slayer: Kimetsu no Yaiba" for that query.
      const weight = position < entry.titleCount ? 1 : 0.6;
      let value = 0;
      if (name === q) value = 1000;
      else if (name.startsWith(q)) value = 800 - Math.min(200, name.length - q.length);
      else if (qWords.every((w) => entry.words.some((word) => word.startsWith(w)))) value = 500;
      else if (q.length >= 3 && name.includes(q)) value = 300;
      score = Math.max(score, value * weight);
    });
    if (score > 0) scored.push({ entry, score: score - entry.rank / 100 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ entry }) => entry.media);
}

/** Convenience: load (if needed) and match. */
export async function searchIndex(query: string, limit = 6): Promise<AnilistMedia[]> {
  return matchSearchIndex(await loadSearchIndex(), query, limit);
}
