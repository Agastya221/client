import type { ProviderId, WatchSessionModel } from "@/lib/anime/types";

export interface ClientStreamRequest {
  animeId: string;
  episodeNumber: number;
  provider?: ProviderId | null;
  dubbed?: boolean;
  server?: string | null;
}

export interface ClientStreamPayload {
  source: WatchSessionModel["source"];
  subtitles: WatchSessionModel["subtitles"];
  serverOptions: WatchSessionModel["serverOptions"];
  activeServerId: WatchSessionModel["activeServerId"];
  provider: WatchSessionModel["provider"];
  intro?: WatchSessionModel["intro"];
  outro?: WatchSessionModel["outro"];
  watchAttempts: WatchSessionModel["watchAttempts"];
}

const RESULT_TTL_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = "tatakai:stream:";
const resolvedStreams = new Map<string, { payload: ClientStreamPayload; expiresAt: number }>();
const inFlightStreams = new Map<string, Promise<ClientStreamPayload>>();
const inFlightWarmups = new Map<string, Promise<void>>();

function playlistUris(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"));
}

function resolvePlaylistUri(uri: string, baseUrl: string): string | null {
  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    return null;
  }
}

async function warmHlsSource(payload: ClientStreamPayload, includeFirstSegment: boolean): Promise<void> {
  const source = payload.source;
  const sourceUrl = source?.proxiedUrl || source?.url;
  if (!source || !sourceUrl || (!source.isM3U8 && source.kind !== "hls")) return;

  const warmKey = `${sourceUrl}:${includeFirstSegment ? "segment" : "manifest"}`;
  const existing = inFlightWarmups.get(warmKey);
  if (existing) return existing;

  const promise = (async () => {
    const masterResponse = await fetch(sourceUrl, { cache: "force-cache", credentials: "same-origin" });
    if (!masterResponse.ok) return;
    const masterText = await masterResponse.text();
    const masterUrl = masterResponse.url || new URL(sourceUrl, window.location.origin).toString();

    let mediaText = masterText;
    let mediaUrl = masterUrl;
    if (masterText.includes("#EXT-X-STREAM-INF")) {
      const variantUri = playlistUris(masterText)[0];
      const variantUrl = variantUri ? resolvePlaylistUri(variantUri, masterUrl) : null;
      if (!variantUrl) return;
      const variantResponse = await fetch(variantUrl, { cache: "force-cache", credentials: "same-origin" });
      if (!variantResponse.ok) return;
      mediaText = await variantResponse.text();
      mediaUrl = variantResponse.url || variantUrl;
    }

    if (!includeFirstSegment) return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;

    const segmentUri = playlistUris(mediaText)[0];
    const segmentUrl = segmentUri ? resolvePlaylistUri(segmentUri, mediaUrl) : null;
    if (!segmentUrl) return;
    const segmentResponse = await fetch(segmentUrl, { cache: "force-cache", credentials: "same-origin" });
    if (segmentResponse.ok) await segmentResponse.arrayBuffer();
  })()
    .catch(() => undefined)
    .finally(() => {
      inFlightWarmups.delete(warmKey);
    });

  inFlightWarmups.set(warmKey, promise);
  return promise;
}

export function clientStreamRequestKey(request: ClientStreamRequest): string {
  return [
    request.animeId,
    `ep${request.episodeNumber || 1}`,
    request.dubbed ? "dub" : "sub",
    request.server || "auto",
    request.provider || "auto",
  ].join(":");
}

function readStoredPayload(key: string): ClientStreamPayload | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { payload?: ClientStreamPayload; expiresAt?: number };
    if (!stored.payload?.source || !stored.expiresAt || stored.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return null;
    }
    return stored.payload;
  } catch {
    return null;
  }
}

function storePayload(key: string, payload: ClientStreamPayload): void {
  if (!payload.source) return;

  const expiresAt = Date.now() + RESULT_TTL_MS;
  resolvedStreams.set(key, { payload, expiresAt });

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ payload, expiresAt }),
    );
  } catch {
    // Memory caching still covers the current client navigation.
  }
}

function getCachedPayload(key: string): ClientStreamPayload | null {
  const memoryEntry = resolvedStreams.get(key);
  if (memoryEntry) {
    if (memoryEntry.expiresAt > Date.now()) return memoryEntry.payload;
    resolvedStreams.delete(key);
  }

  const stored = readStoredPayload(key);
  if (stored) {
    resolvedStreams.set(key, { payload: stored, expiresAt: Date.now() + RESULT_TTL_MS });
  }
  return stored;
}

export function resolveClientStream(request: ClientStreamRequest): Promise<ClientStreamPayload> {
  const key = clientStreamRequestKey(request);
  const cached = getCachedPayload(key);
  if (cached) return Promise.resolve(cached);

  const inFlight = inFlightStreams.get(key);
  if (inFlight) return inFlight;

  const promise = fetch("/api/resolve-source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(request),
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null) as ClientStreamPayload | { error?: string } | null;
      if (!response.ok) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : `Resolve source failed with ${response.status}`,
        );
      }
      if (!payload || !("source" in payload)) {
        throw new Error("Resolve source returned an invalid payload.");
      }

      storePayload(key, payload);
      return payload;
    })
    .finally(() => {
      inFlightStreams.delete(key);
    });

  inFlightStreams.set(key, promise);
  return promise;
}

export function prefetchClientStream(
  request: ClientStreamRequest,
  options: { warmFirstSegment?: boolean } = {},
): void {
  void resolveClientStream(request)
    .then((payload) => warmHlsSource(payload, Boolean(options.warmFirstSegment)))
    .catch(() => undefined);
}
