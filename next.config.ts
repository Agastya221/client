import type { NextConfig } from "next";
import path from "path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    /**
     * IMAGE OPTIMIZATION ON CLOUDFLARE WORKERS
     *
     * Cloudflare has no drop-in replacement for Next's Node/sharp image
     * optimizer. There are three options; we take the third.
     *
     *  1. Custom `loader: "custom"` + `loaderFile` pointing at
     *     /cdn-cgi/image/. Rejected: /cdn-cgi/image/ only works on a
     *     Cloudflare *zone* with Image Resizing enabled — it does NOT work on
     *     a *.workers.dev subdomain — so it would hard-break preview
     *     deployments, and it still bills as Images Transformations.
     *
     *  2. The @opennextjs/cloudflare built-in /_next/image handler backed by
     *     the Workers `IMAGES` binding. Technically the best result (real
     *     resize + AVIF/WebP), but it bills as Cloudflare Images
     *     Transformations: 5,000 unique transformations/month free, then
     *     $0.50 per 1,000. This site renders large grids of AniList cover art
     *     and every distinct (url, width, quality, format) tuple is its own
     *     billable transformation, so a few hundred visitors browsing the
     *     catalogue would exhaust the free tier within days.
     *
     *  3. `unoptimized: true` (chosen). next/image emits the upstream CDN URL
     *     directly, so the browser fetches straight from s4.anilist.co /
     *     img.anili.st / etc. Cost: $0. It also costs ZERO Worker
     *     invocations, which matters on the 100k requests/day free tier —
     *     options 1 and 2 both route every image through the Worker.
     *     Those upstream hosts already serve appropriately-sized,
     *     CDN-cached cover art, so the real-world quality loss is small; the
     *     trade-off is losing responsive srcset and automatic AVIF/WebP.
     *
     * To switch to option 2 later: delete `unoptimized: true` below and
     * uncomment the `images` binding in wrangler.jsonc. No other code change
     * is needed — `remotePatterns`, `qualities` and `minimumCacheTTL` below
     * are already honoured by the adapter's handler.
     */
    unoptimized: true,

    // Kept (currently inert under `unoptimized`) so re-enabling optimization
    // is a one-line change.
    minimumCacheTTL: 604800,
    qualities: [45, 55, 60, 65, 70, 75, 80, 85, 90],
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "img.anili.st" },
      { protocol: "https", hostname: "static.anikai.to" },
      { protocol: "https", hostname: "img.desidub.com" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "i.ibb.co.com" },
      { protocol: "https", hostname: "media.kitsu.app" },
      { protocol: "https", hostname: "static.tvmaze.com" },
      { protocol: "https", hostname: "static.wikia.nocookie.net" },
      { protocol: "https", hostname: "gogocdn.net" },
      { protocol: "https", hostname: "artworks.thetvdb.com" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    webpackMemoryOptimizations: true,
    viewTransition: true,
  },
  // Suppress hydration warnings from browser extensions that inject attributes
  // like bis_skin_checked="1" (Honey, CouponFollow, etc.) into the DOM.
  reactStrictMode: true,
  /**
   * Keep Prisma out of the Next.js server bundle so OpenNext bundles it itself for the
   * Worker, resolving the `workerd` export condition. That loads the query compiler from
   * a real .wasm module. Without this, Next resolves the Node build, which compiles the
   * wasm from a base64 string at runtime: Workers forbid that ("Wasm code generation
   * disallowed by embedder"), so every Prisma query failed on the live site.
   * https://opennext.js.org/cloudflare/howtos/db
   */
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  /**
   * `pg` (used by @prisma/adapter-pg) does `require("pg-cloudflare")` to reach
   * Cloudflare's socket API. That package's exports map serves a real
   * implementation only under the `workerd` condition and an empty stub under
   * `default`. Next's file tracer resolves with Node's conditions, so it keeps
   * only the empty stub and the Cloudflare bundle then fails with
   * "Could not resolve pg-cloudflare". Force the whole package into the trace.
   */
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pg-cloudflare/**/*"],
  },
};

export default nextConfig;

/**
 * Makes Cloudflare bindings (KV, Hyperdrive, vars/secrets from wrangler.jsonc
 * and .dev.vars) available to `getCloudflareContext()` during `next dev`.
 * No-op in production builds and in the deployed Worker, where the adapter's
 * own entrypoint sets the context up instead.
 *
 * Required by @opennextjs/cloudflare; see DEPLOY-CLOUDFLARE.md.
 */
if (process.env.NODE_ENV === "development") {
  // Guarded to dev only and `.catch`-ed on purpose: this spins up a miniflare
  // instance from wrangler.jsonc, and wrangler.jsonc still contains
  // placeholder namespace IDs. A failure here must warn, never abort a build.
  void initOpenNextCloudflareForDev().catch((error: unknown) => {
    console.warn("[open-next] Cloudflare dev context unavailable:", error);
  });
}
