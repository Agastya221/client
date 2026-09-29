/**
 * Feature flags.
 *
 * Watch Party is off by default. Its live-sync stream (app/api/watch-party/stream)
 * polls Postgres every 800ms per connected client, which cannot run on Cloudflare
 * Workers. It is meant to be rebuilt on Durable Objects (see DEPLOY-CLOUDFLARE.md).
 * Until then, set NEXT_PUBLIC_WATCH_PARTY_ENABLED=true to turn it back on for a
 * Node host such as `next dev` or `next start`.
 *
 * The literal `process.env.NEXT_PUBLIC_*` access matters: Next inlines it into the
 * client bundle at build time, so the flag reads the same on server and client.
 */
export const WATCH_PARTY_ENABLED = process.env.NEXT_PUBLIC_WATCH_PARTY_ENABLED === "true";

/** Returns a 503 for Watch Party API routes while the feature is off, otherwise null. */
export function watchPartyUnavailable(): Response | null {
  if (WATCH_PARTY_ENABLED) return null;
  return Response.json(
    { error: "Watch Party is temporarily unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
