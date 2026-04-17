import { PROVIDERS, type ProviderId } from "./types";

export function encodeAnimeId(provider: ProviderId, providerId: string): string {
  return `${provider}~${encodeURIComponent(providerId)}`;
}

export function decodeAnimeId(value: string): { provider: ProviderId; providerId: string } {
  const [maybeProvider, ...rest] = value.split("~");
  if (rest.length > 0 && PROVIDERS.includes(maybeProvider as any)) {
    return {
      provider: maybeProvider as ProviderId,
      providerId: decodeURIComponent(rest.join("~")),
    };
  }
  

  return { provider: "animekai", providerId: decodeURIComponent(value) };
}

export function buildProviderOrder(preferred?: ProviderId | null, seeded?: ProviderId | null): ProviderId[] {
  const ordered = [preferred, seeded, ...PROVIDERS].filter(Boolean) as ProviderId[];
  return Array.from(new Set(ordered));
}

export function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function humanizeProviderId(value: string): string {
  if (value === "hianime") return "Kaido";
  
  return value
    .replace(/\?.*$/, "")
    .replace(/\$.*$/, "")
    .replace(/-\d+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseYear(value: string | null | undefined): string | null {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match?.[0] || null;
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

export function bestTitleMatch<T extends { title?: string | null; name?: string | null }>(
  target: string,
  candidates: T[],
): T | null {
  const normalizedTarget = normalizeText(target);
  let winner: T | null = null;
  let winnerScore = -1;

  for (const candidate of candidates) {
    const raw = candidate.title || candidate.name || "";
    const normalized = normalizeText(raw);
    if (!normalized) continue;

    let score = 0;
    if (normalized === normalizedTarget) score += 100;
    if (normalized.includes(normalizedTarget) || normalizedTarget.includes(normalized)) score += 40;

    const targetTokens = new Set(normalizedTarget.split(" ").filter(Boolean));
    const candidateTokens = normalized.split(" ").filter(Boolean);
    for (const token of candidateTokens) {
      if (targetTokens.has(token)) score += 5;
    }

    if (score > winnerScore) {
      winner = candidate;
      winnerScore = score;
    }
  }

  return winner;
}

export function buildProxyUrl(
  apiBaseUrl: string,
  targetUrl: string,
  referer?: string | null,
  kind: "playlist" | "video" = "playlist",
): string {
  const url = new URL("/api/proxy/m3u8-streaming-proxy", apiBaseUrl);
  url.searchParams.set("url", targetUrl);
  if (referer) url.searchParams.set("referer", referer);
  if (kind === "video") url.searchParams.set("type", "video");
  return url.toString();
}

export function pickFirstNonEmpty(...values: Array<string | null | undefined>): string {
  return values.find((value) => Boolean(String(value || "").trim()))?.trim() || "";
}

export function ensureArray<T>(value: T[] | null | undefined): T[];
export function ensureArray<T = Record<string, any>>(value: unknown): T[];
export function ensureArray<T = Record<string, any>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
