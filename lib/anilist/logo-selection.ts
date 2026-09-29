/**
 * Pure title-logo selection helpers.
 *
 * Deliberately free of `server-only` and of any network/cache imports so the
 * ranking logic stays unit-testable. The fetching that uses it lives in
 * `hero-assets.ts`, which is server-only.
 */

export interface FanartImage {
  url?: string;
  lang?: string;
  likes?: string;
}

export interface FanartPayload {
  hdtvlogo?: FanartImage[];
  clearlogo?: FanartImage[];
}

export interface SelectedFanartLogo {
  url: string;
  language: string;
}

export interface FanartLogoSelection {
  /** Highest-ranked logo explicitly tagged as English, if one exists at all. */
  english: SelectedFanartLogo | null;
  /** Highest-ranked logo of any language, using the preferred-language order. */
  best: SelectedFanartLogo | null;
}

export const PREFERRED_LOGO_LANGUAGES = ["en", "ja", "ko", "00", ""] as const;

export const NO_FANART_LOGOS: FanartLogoSelection = { english: null, best: null };

export function safeHttpsUrl(candidate: string | undefined): string | null {
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function selectFanartLogos(payload: FanartPayload): FanartLogoSelection {
  const candidates = [...(payload.hdtvlogo || []), ...(payload.clearlogo || [])]
    .map((image) => ({
      ...image,
      url: safeHttpsUrl(image.url),
      language: (image.lang || "").toLowerCase(),
      likes: Number.parseInt(image.likes || "0", 10) || 0,
    }))
    .filter((image): image is typeof image & { url: string } => Boolean(image.url));

  candidates.sort((left, right) => {
    const leftLanguage = PREFERRED_LOGO_LANGUAGES.indexOf(
      left.language as (typeof PREFERRED_LOGO_LANGUAGES)[number],
    );
    const rightLanguage = PREFERRED_LOGO_LANGUAGES.indexOf(
      right.language as (typeof PREFERRED_LOGO_LANGUAGES)[number],
    );
    const leftRank = leftLanguage === -1 ? PREFERRED_LOGO_LANGUAGES.length : leftLanguage;
    const rightRank = rightLanguage === -1 ? PREFERRED_LOGO_LANGUAGES.length : rightLanguage;
    return leftRank - rightRank || right.likes - left.likes;
  });

  const toSelected = (
    candidate: (typeof candidates)[number] | undefined,
  ): SelectedFanartLogo | null =>
    candidate ? { url: candidate.url, language: candidate.language } : null;

  return {
    english: toSelected(candidates.find((candidate) => candidate.language === "en")),
    best: toSelected(candidates[0]),
  };
}
