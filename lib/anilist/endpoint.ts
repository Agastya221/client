/**
 * Single entry point for AniList GraphQL requests.
 *
 * AniList blocks Cloudflare Workers' shared egress IPs ("You have been manually
 * blocked", HTTP 403), so the deployed Worker routes AniList traffic through the
 * Anivexa API on Render instead. Configuration is per-deployment:
 *
 *   ANILIST_PROXY_URL  e.g. https://<render-service>.onrender.com/anilist
 *   ANILIST_PROXY_KEY  shared secret the proxy requires in the x-proxy-key header
 *
 * When ANILIST_PROXY_URL is unset (local dev, Node hosts) requests go straight to
 * AniList, so nothing changes outside the Worker.
 *
 * Both variables are read at call time, never at module scope: on Cloudflare
 * Workers `process.env` is populated per request, so a module-level read can see
 * `undefined`.
 */
export const ANILIST_DIRECT_URL = "https://graphql.anilist.co";

export function anilistProxyUrl(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.ANILIST_PROXY_URL?.trim();
  return url ? url : null;
}

/** POSTs to AniList (or the configured proxy). Pass the same init you would give fetch(). */
export function anilistFetch(init: RequestInit): Promise<Response> {
  const proxy = anilistProxyUrl();
  if (!proxy) return fetch(ANILIST_DIRECT_URL, init);

  const headers = new Headers(init.headers);
  const key = process.env.ANILIST_PROXY_KEY?.trim();
  if (key) headers.set("x-proxy-key", key);
  return fetch(proxy, { ...init, headers });
}
