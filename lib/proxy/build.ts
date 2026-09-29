import { signProxyParams } from "@/lib/proxy/signature";

/**
 * Builds a signed, relative link to the media proxy. Server-only: signing needs the
 * secret (see lib/proxy/signature.ts). The browser only ever follows links the server
 * hands it, both here and in the playlists the proxy rewrites.
 */
export function buildProxyUrl(
  _apiBaseUrl: string,
  targetUrl: string,
  referer?: string | null,
  kind: "asset" | "playlist" | "video" = "asset",
  playlistKey?: string | null,
): string {
  // Relative path so browsers hit this site's own proxy route (no CORS, no dependency
  // on an external backend). The base is a placeholder that is stripped below.
  const url = new URL("/api/proxy/m3u8-streaming-proxy", "http://localhost:3000");
  url.searchParams.set("url", targetUrl);
  if (referer) url.searchParams.set("referer", referer);
  if (kind === "video") url.searchParams.set("type", "video");
  if (kind === "playlist") url.searchParams.set("type", "playlist");
  if (playlistKey && kind === "playlist") url.searchParams.set("playlist_key", playlistKey);
  signProxyParams(url.searchParams);
  return url.pathname + url.search;
}
