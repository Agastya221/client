/**
 * The page pre-warmer's two pure helpers (the route and the worker use them).
 *
 * Why it exists: an anime page nobody has opened yet is rendered on the first visit (0.5-3 s,
 * several AniList lookups through Render) and, after the site has been idle, that visit also
 * starts the whole Next.js server. The cron job that already runs every 10 minutes opens a
 * rotating batch of popular pages so visitors find them already cached.
 */
import { hmacKey } from "@/lib/access/invite";

/**
 * The next `size` ids from a rolling window over `ids`: each 10-minute slot moves the window
 * along, so over a day every title in the pool gets its turn, with no stored cursor (KV allows
 * only 1,000 writes a day on the free plan, and the page cache needs most of them).
 */
export function pickWarmBatch<T>(ids: readonly T[], nowMs: number, size: number, slotMs = 10 * 60_000): T[] {
  if (ids.length === 0 || size <= 0) return [];
  const take = Math.min(size, ids.length);
  const start = (Math.floor(nowMs / slotMs) * take) % ids.length;
  return Array.from({ length: take }, (_, i) => ids[(start + i) % ids.length]);
}

const encoder = new TextEncoder();

/** The secret the worker's cron hands to the warm route and to the gate; derived, never stored. */
export async function makeWarmToken(secret: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode("warm:v1")));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export async function verifyWarmToken(secret: string, token: string | null | undefined): Promise<boolean> {
  if (!secret || !token) return false;
  const expected = await makeWarmToken(secret);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export const WARM_HEADER = "x-warm-token";
