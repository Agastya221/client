import type { ServerHealthResult, ServerOption } from "./types";

interface SubtitleCandidate {
  file?: string;
  url?: string;
  label?: string;
  language?: string;
  lang?: string;
  referer?: string;
  referrer?: string;
}

export interface StreamHealthInput {
  url: string;
  transport: NonNullable<ServerOption["transport"]>;
  subType?: ServerOption["subType"];
  referer?: string;
  authorization?: string;
  playlistKey?: string;
  subtitles?: SubtitleCandidate[];
}

function result(status: ServerHealthResult["status"], reason: string): ServerHealthResult {
  return { status, reason, checkedAt: Date.now() };
}

function requestHeaders(referer: string | undefined, authorization: string | undefined, range = false): Headers {
  const headers = new Headers({ Accept: "*/*", "User-Agent": "Mozilla/5.0 Tatakai-Stream-Check" });
  if (referer) {
    headers.set("Referer", referer);
    try { headers.set("Origin", new URL(referer).origin); } catch {}
  }
  if (authorization) headers.set("Authorization", authorization);
  if (range) headers.set("Range", "bytes=0-4095");
  return headers;
}

async function getResponse(
  url: string,
  referer: string | undefined,
  authorization: string | undefined,
  range: boolean,
  fetcher: typeof fetch,
): Promise<Response> {
  return fetcher(url, {
    headers: requestHeaders(referer, authorization, range),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
}

async function firstBytes(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunk = await reader.read();
  void reader.cancel().catch(() => undefined);
  return chunk.value || new Uint8Array();
}

function firstPlaylistUri(playlist: string): string | null {
  return playlist.split(/\r?\n/).map((line) => line.trim())
    .find((line) => Boolean(line) && !line.startsWith("#")) || null;
}

async function checkSubtitles(input: StreamHealthInput, fetcher: typeof fetch): Promise<ServerHealthResult> {
  if (input.subType !== "soft") return result("working", "Media segment loaded");
  const tracks = input.subtitles || [];
  const track = tracks.find((entry) => /^(en|eng|english)(?:[-_ ]|$)/i.test(
    entry.language || entry.lang || entry.label || "",
  )) || tracks[0];
  const trackUrl = track?.file || track?.url;
  if (!trackUrl) return result("unverified", "Media loaded; subtitle track was not supplied");
  const response = await getResponse(
    new URL(trackUrl, input.url).href,
    track?.referer || track?.referrer || input.referer,
    input.authorization,
    false,
    fetcher,
  );
  if (!response.ok) return result("failed", `Subtitles returned ${response.status}`);
  const prefix = new TextDecoder().decode(await firstBytes(response)).trimStart();
  if (!prefix.startsWith("WEBVTT") && !/^\d+\s*\r?\n/.test(prefix)) {
    return result("unverified", "Subtitle format could not be confirmed");
  }
  return result("working", "Media and subtitles loaded");
}

export async function probeStreamHealth(
  input: StreamHealthInput,
  fetcher: typeof fetch = fetch,
): Promise<ServerHealthResult> {
  if (input.transport === "embed") return result("unverified", "Embed playback needs a browser check");
  try {
    if (input.transport === "mp4") {
      const response = await getResponse(input.url, input.referer, input.authorization, true, fetcher);
      if (!response.ok) return result("failed", `Video returned ${response.status}`);
      const type = response.headers.get("content-type") || "";
      const bytes = await firstBytes(response);
      if (!bytes.length || /html|json|text\/plain/i.test(type)) {
        return result("failed", "Video host did not return media bytes");
      }
      return checkSubtitles(input, fetcher);
    }

    let assetUrl = new URL(input.url);
    for (let depth = 0; depth < 3; depth++) {
      const response = await getResponse(assetUrl.href, input.referer, input.authorization, false, fetcher);
      if (!response.ok) return result("failed", `Manifest returned ${response.status}`);
      const body = await response.text();
      if (input.transport === "dash") {
        return /<MPD(?:\s|>)/i.test(body)
          ? result("unverified", "DASH manifest loaded; playback check pending")
          : result("failed", "Invalid DASH manifest");
      }
      if (!body.trimStart().startsWith("#EXTM3U")) {
        return input.playlistKey
          ? result("unverified", "Encrypted playlist needs a player check")
          : result("failed", "Invalid HLS playlist");
      }
      const next = firstPlaylistUri(body);
      if (!next) return result("unverified", "HLS playlist has no media segment yet");
      const nextUrl = new URL(next, assetUrl);
      if (/^#EXT-X-STREAM-INF:/m.test(body)) {
        assetUrl = nextUrl;
        continue;
      }
      const keyUrl = body.match(/^#EXT-X-KEY:.*?URI="([^"]+)"/m)?.[1];
      if (keyUrl) {
        const keyResponse = await getResponse(new URL(keyUrl, assetUrl).href, input.referer, input.authorization, false, fetcher);
        if (!keyResponse.ok) return result("failed", `HLS key returned ${keyResponse.status}`);
        void keyResponse.body?.cancel().catch(() => undefined);
      }
      const segment = await getResponse(nextUrl.href, input.referer, input.authorization, true, fetcher);
      if (!segment.ok) return result("failed", `Media segment returned ${segment.status}`);
      const bytes = await firstBytes(segment);
      if (!bytes.length) return result("failed", "Media segment was empty");
      const type = segment.headers.get("content-type") || "";
      if (/image\//i.test(type) && bytes[0] !== 0x47) {
        return result("unverified", "Wrapped media segment needs a player check");
      }
      return checkSubtitles(input, fetcher);
    }
    return result("unverified", "Nested HLS playlist needs a player check");
  } catch (error) {
    const timedOut = error instanceof Error && /timeout|abort/i.test(error.name + error.message);
    return result("unverified", timedOut ? "Check timed out" : "Source could not be checked");
  }
}
