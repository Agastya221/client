/**
 * Remembers resolved stream links so an episode is only resolved once.
 *
 * Resolving a stream (provider lookups through Render, ~1-5 s, and a cold Worker start on top)
 * used to run for every playback because results were kept in memory for 30-90 seconds. A link
 * is now stored (in Redis, see below) when it is first resolved and served from there, with no timer, until it
 * is replaced:
 *
 *  - when the player reports an error, the watch page asks for a fresh link and retries once;
 *  - when someone presses "Refresh source".
 * Either replaces the stored link for everyone (see resolveStreamSource's `refresh`).
 *
 * Why this is safe to rely on: measured on a live HLS link, the playlist, the quality playlist
 * and a video segment were all still valid after 41 minutes, though the link's embedded time
 * stamp is only 90 s ahead (segments carry no token, and it is not tied to an IP address).
 * Embed servers (megaplay, tryembed, mostream, ...) hand out ordinary page addresses with no
 * token at all. Nothing guarantees a link lives forever, which is what the refresh path is for.
 *
 * Links live in Redis (no daily write cap, unlike Cloudflare KV's 1,000 writes a day), written
 * once when resolved and again only when replaced.
 */
import { remoteStreamStorage } from "@/lib/stream-store-remote";
import { upstashConfig, upstashStreamStorage } from "@/lib/stream-store-upstash";

/**
 * Not an expiry rule: Redis needs some lifetime, and this only cleans up links nobody has
 * watched for a month so storage never fills.
 */
export const STORE_CLEANUP_SECONDS = 30 * 24 * 60 * 60;

export interface StoredStream<R> {
  v: 1;
  result: R;
  storedAt: number;
}

export interface StreamStorage {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

/**
 * Upstash Redis called directly (lib/stream-store-upstash.ts) when the Worker has its REST secrets,
 * otherwise the same Redis through the Render service (lib/stream-store-remote.ts). Chosen per
 * call because Worker secrets are only readable while a request is running.
 */
export const defaultStreamStorage: StreamStorage = {
  get: (key) => pick().get(key),
  set: (key, value, ttlSeconds) => pick().set(key, value, ttlSeconds),
  delete: (key) => pick().delete(key),
  deletePrefix: (prefix) => pick().deletePrefix(prefix),
};

/** Which store is in use right now: "upstash" (direct) or "render" (through the Render service). */
export function activeStreamStorageName(): "upstash" | "render" {
  return upstashConfig() ? "upstash" : "render";
}

function pick(): StreamStorage {
  return upstashConfig() ? upstashStreamStorage : remoteStreamStorage;
}

export interface StreamStoreRequest {
  animeId: string;
  episodeNumber?: number;
  dubbed?: boolean;
  server?: string | null;
  provider?: string | null;
}

const lang = (dubbed?: boolean) => (dubbed ? "dub" : "sub");

/** Everything stored for one episode and language, whichever server or provider asked. */
export function streamStorePrefix(request: Pick<StreamStoreRequest, "animeId" | "episodeNumber" | "dubbed">): string {
  return `stream-link:v1:${request.animeId}:ep${request.episodeNumber || 1}:${lang(request.dubbed)}:`;
}

/** What a refresh for this server discards: its own links and the "auto" ones, nothing else. */
export function streamRefreshPrefixes(request: StreamStoreRequest): string[] {
  const base = streamStorePrefix(request);
  return [...new Set([`${base}auto:`, ...(request.server ? [`${base}${request.server}:`] : [])])];
}

export function streamStoreKey(request: StreamStoreRequest): string {
  return `${streamStorePrefix(request)}${request.server || "auto"}:${request.provider || "auto"}`;
}

/** True when the request names a server; "auto" and none mean "whatever works". */
export function isExplicitServer(server?: string | null): server is string {
  return Boolean(server && server !== "auto");
}

/**
 * Every key a resolved link is stored under, so the next viewer finds it whichever way they ask:
 *  - the request's own key;
 *  - the key of the server the link actually came from (what clicking another episode or a
 *    server button asks for, since the page then knows the server);
 *  - "auto" (what opening the episode fresh asks for), unless "auto" already holds a link.
 * Without the last two, a link stored by one path was a miss for the other, and every new
 * browser session resolved the episode again.
 */
export function streamStoreWriteKeys(
  request: StreamStoreRequest,
  resolved: { activeServerId?: string | null; provider?: string | null },
  autoTaken: boolean,
): string[] {
  const keys = [streamStoreKey(request)];
  if (resolved.activeServerId) {
    for (const provider of [resolved.provider, request.provider]) {
      keys.push(streamStoreKey({ ...request, server: resolved.activeServerId, provider: provider || null }));
    }
  }
  if (!autoTaken) keys.push(streamStoreKey({ ...request, server: null }));
  return [...new Set(keys)];
}

export async function readStoredStream<R>(key: string, storage: StreamStorage = defaultStreamStorage): Promise<StoredStream<R> | null> {
  try {
    const entry = await storage.get<StoredStream<R>>(key);
    return entry && entry.v === 1 && entry.result ? entry : null;
  } catch {
    return null;
  }
}

export async function writeStoredStream<R>(
  key: string,
  result: R,
  storage: StreamStorage = defaultStreamStorage,
  now = Date.now(),
): Promise<void> {
  try {
    await storage.set(key, { v: 1, result, storedAt: now } satisfies StoredStream<R>, STORE_CLEANUP_SECONDS);
  } catch {
    // Best-effort: the stream still plays, it just is not remembered.
  }
}

/** How long an episode's server list is kept: lists change rarely, and a dead server is caught by the health checks. */
export const SERVER_LIST_SECONDS = 6 * 60 * 60;
/** An empty list ("this provider has no servers for the episode") is kept only this long. */
export const EMPTY_SERVER_LIST_SECONDS = 20 * 60;

/** One episode's servers for one provider and language. Outside the stream-link prefixes, so a link refresh leaves it alone. */
export function serverListStoreKey(request: {
  anilistId: number;
  episodeNumber: number;
  dubbed: boolean;
  workerProvider: string;
}): string {
  return `stream-link:servers:v1:${request.anilistId}:ep${request.episodeNumber}:${lang(request.dubbed)}:${request.workerProvider}`;
}

export async function writeStoredServerList<R>(
  key: string,
  options: R,
  ttlSeconds = SERVER_LIST_SECONDS,
  storage: StreamStorage = defaultStreamStorage,
  now = Date.now(),
): Promise<void> {
  try {
    await storage.set(key, { v: 1, result: options, storedAt: now } satisfies StoredStream<R>, ttlSeconds);
  } catch {
    // Best-effort: the list is just asked for again next time.
  }
}

export async function deleteStoredStreams(prefix: string, storage: StreamStorage = defaultStreamStorage): Promise<void> {
  try {
    await storage.deletePrefix(prefix);
  } catch {
    // Best-effort.
  }
}
