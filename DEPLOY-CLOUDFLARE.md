# Deploying to Cloudflare Workers

Status: **preparation only.** Nothing has been deployed, no Cloudflare account
has been touched, and `wrangler login` has not been run. This document plus
`wrangler.jsonc`, `open-next.config.ts` and the config changes listed below are
the whole of the work. Read the **Known blockers** section before you attempt a
real deploy — at least one of them is a hard stop.

Adapter: [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), which
runs a Next.js app on Workers under the **Node.js** runtime (not edge). This
app already declares `runtime = "nodejs"` in the only three places it declares a
runtime at all, so no route changes were needed.

---


## Deployed state (free plan)

Live at `https://tatakai-anime-website.tatakai-anime.workers.dev` on the Workers **free** plan.

| Thing | State |
|---|---|
| Bundle | ~2,719 KiB gzipped, under the 3,072 KiB limit. Needs Prisma `compilerBuild = "small"` (default is +0.8 MiB) and wrangler `minify`. |
| Build | Must run on **Linux** (WSL, CI). OpenNext creates symlinks, which fail on Windows without Developer Mode. Deploy the result with `wrangler deploy`; secrets persist between deploys. |
| AniList | AniList blocks Cloudflare's egress IPs (403 "manually blocked"). `ANILIST_PROXY_URL` routes all GraphQL through `POST /anilist` on the Render API, guarded by `ANILIST_PROXY_KEY` (set on Render **and** as a Worker secret). |
| Cache | `lib/cache/kv.ts` uses the native `APP_CACHE_KV` binding. No API token needed. |
| Keep-warm | `worker.ts` `scheduled()` pings the Render API every 10 minutes (see `triggers.crons`). ~720 of Render's 750 free hours/month: only safe while it is the account's single free service. |
| Watch Party | Off (`NEXT_PUBLIC_WATCH_PARTY_ENABLED`); to be rebuilt on Durable Objects. |

Gotchas found while deploying:

- **Fire-and-forget promises are cancelled when the response is sent.** Use `runAfterResponse()` (`lib/cache.ts`), which registers work with `waitUntil`. A bare `void promise` silently never finishes on Workers.
- **`process.env` is populated per request**, so never read it at module scope.
- **`public/` is published as static assets.** Do not leave compiled worker files there (`final_worker.js` and `temp_worker.js` had to be stripped from the deploy).
- **Not proxied:** the AniList OAuth token exchange (`anilist.co/api/v2/oauth/token`) happens inside Auth.js. If AniList also blocks it from Workers, sign-in will fail and needs a separate fix.
- **Free-plan limits still to watch:** 10 ms CPU per request, 50 subrequests per request, 1,000 KV writes/day.

## 1. Version pinning — read this first

| Package | Installed | Why this exact version |
| --- | --- | --- |
| `@opennextjs/cloudflare` | **1.20.1** (pinned, no caret) | See below |
| `wrangler` | `^4.143.0` | Satisfies the adapter's `wrangler: ^4.86.0` peer |

The adapter declares a **narrow `next` peer range that tracks Next.js security
patches**, and it moves with every adapter release:

```
@opennextjs/cloudflare@1.20.1  ->  next: ">=15.5.18 <16 || >=16.2.6"
@opennextjs/cloudflare@1.20.2  ->  next: ">=15.5.21 <16 || >=16.2.11"
@opennextjs/cloudflare@1.20.7  ->  next: ">=15.5.26 <16 || >=16.3.6"   (latest)
```

This app is on **Next 16.2.9**, so **1.20.1 is the newest adapter version that
is compatible.** The dependency is pinned exactly (`"1.20.1"`, not `"^1.20.1"`)
in both `package.json` and `package-lock.json` — a caret would silently resolve
to 1.20.7 on the next clean install and break the peer contract.

To move forward, bump Next first:

- `next@16.2.12` (latest 16.2 patch) unlocks adapter `1.20.2`
- `next@16.3.7` (latest) unlocks adapter `1.20.7`

Those peer ranges exist because Next.js shipped security fixes in those
patches. Staying on 16.2.9 is a deliberate, temporary choice; treat the upgrade
as a follow-up task with its own build + test pass.

---

## 2. What you must do yourself

Every step below needs your Cloudflare account. None of it has been done.

### 2.1 Account and CLI

```bash
npx wrangler login          # opens a browser, authorises this machine
npx wrangler whoami         # confirm the right account
```

Decide on a plan. **The free plan is probably not enough — see Blocker 3.**
Workers Paid is $5/month and raises the Worker size limit from 3 MiB to 10 MiB
compressed.

### 2.2 Create the two KV namespaces

```bash
npx wrangler kv namespace create NEXT_INC_CACHE_KV
npx wrangler kv namespace create APP_CACHE_KV
```

Each prints an `id`. Paste them into `wrangler.jsonc`, replacing
`<PLACEHOLDER_REPLACE_WITH_NEXT_INC_CACHE_KV_ID>` and
`<PLACEHOLDER_REPLACE_WITH_APP_CACHE_KV_ID>`.

- `NEXT_INC_CACHE_KV` backs Next's ISR/fetch cache. The binding name is fixed
  by the adapter; do not rename it.
- `APP_CACHE_KV` is for the app's own L2 API cache. You can reuse your existing
  `CF_KV_NAMESPACE_ID` here instead of creating a new one. It is **declared but
  not yet used** — see Blocker 4.

### 2.3 Set up Hyperdrive for Postgres

`lib/db.ts` connects to Neon over raw TCP via `pg`. A Worker isolate cannot
hold a connection pool across requests, so without Hyperdrive every cold
isolate opens a fresh Postgres connection. Hyperdrive pools in front of
Postgres and is **free on both Workers plans**.

```bash
npx wrangler hyperdrive create tatakai-db \
  --connection-string="<YOUR_NEON_DIRECT_URL>"
```

Use the **direct** (non-pooler, non-pgbouncer) Neon URL — the one in
`DIRECT_URL`, not `DATABASE_URL`. Then:

1. Uncomment the `hyperdrive` block in `wrangler.jsonc` and paste the id.
2. Set `HYPERDRIVE_DATABASE_URL` to the binding's connection string.

`lib/db.ts` already resolves its connection string from, in order:
`HYPERDRIVE_DATABASE_URL` → `POSTGRES_URL` → `DATABASE_URL`, with a
`POSTGRES_CONNECTION_STRING_VAR` escape hatch to name a different variable.
**No code change is required to switch to Hyperdrive.**

### 2.4 Secrets

Do **not** put these in `wrangler.jsonc` — that file is committed. Use
`wrangler secret`:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put DATABASE_URL
npx wrangler secret put DIRECT_URL
npx wrangler secret put ANILIST_CLIENT_SECRET
npx wrangler secret put CF_KV_API_TOKEN
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put FANART_TV_API_KEY
npx wrangler secret put HYPERDRIVE_DATABASE_URL   # after step 2.3
```

Non-secret values (`ANIME_API_BASE_URL`, `ANIVEXA_API_BASE_URL`,
`NEXT_PUBLIC_ANIVEXA_WORKER_URL`, `NEXT_PUBLIC_SITE_URL`, `ANILIST_CLIENT_ID`,
`CF_KV_*` non-token settings) can go in a `vars` block in `wrangler.jsonc`.

Two env-var traps, now documented in `.env.example`:

- **`AUTH_SECRET` was missing from `.env.example` entirely.** `lib/auth.ts`
  falls back to a hardcoded default string when it is unset, and
  `lib/anime/dash-proxy.ts` throws without it (DASH playback silently
  disappears). Generate with `npx auth secret`.
- **`ANIME_API_BASE_URL` had the wrong default documented.** `.env.example`
  said `:4000`; `lib/anime/api.ts` and `app/api/health/route.ts` actually fall
  back to `http://localhost:5000`. An unset value in production therefore
  points at localhost and fails silently rather than loudly. `.env.example` now
  says `:5000` with a warning. Always set it explicitly.
- `NEXT_PUBLIC_ANIVEXA_WORKER_URL` was also missing; `lib/anime/api.ts` throws
  `"NEXT_PUBLIC_ANIVEXA_WORKER_URL is not configured"` when neither it nor
  `ANIVEXA_API_BASE_URL` is set. Both now point at
  `https://tatakai-anivexa-api.onrender.com` (staying on Render).

### 2.5 Files you still need to create (not created here — outside this task's
file ownership)

```
.dev.vars                 # NEXTJS_ENV=development   (local wrangler dev vars)
public/_headers           # /_next/static/*
                          #   Cache-Control: public,max-age=31536000,immutable
```

And add to `.gitignore` — none of these are currently ignored:

```
.open-next
.wrangler
.dev.vars*
!.dev.vars.example
cloudflare-env.d.ts
```

`.env*` is already ignored but does **not** match `.dev.vars`.

**Also add `!.env.example`.** `.gitignore:34` is `.env*`, which matches
`.env.example` — so **`.env.example` is currently untracked and has never been
committed.** The additions described in section 2.4 (`AUTH_SECRET`,
`NEXT_PUBLIC_ANIVEXA_WORKER_URL`, the `:4000` -> `:5000` correction) exist on
disk but will not reach a fresh clone until the ignore rule is negated:

```
.env*
!.env.example
```

`.gitignore` was outside this pass's file ownership, so this was not done for
you.

### 2.6 Custom domain

`NEXT_PUBLIC_SITE_URL` and the AniList OAuth redirect URL
(`https://<YOUR-DOMAIN>/api/auth/callback/anilist`) must match the hostname you
actually serve from. If you use the `*.workers.dev` subdomain, update the
AniList developer console accordingly.

---

## 3. Build, preview, deploy

```bash
npm run cf-typegen    # generates cloudflare-env.d.ts from wrangler.jsonc
npm run preview       # prisma generate + opennext build + local wrangler dev
npm run deploy        # prisma generate + opennext build + deploy
```

Script definitions (added to `package.json`):

| Script | Command |
| --- | --- |
| `cf:build` | `npx prisma generate && opennextjs-cloudflare build` |
| `preview` | `npm run cf:build && opennextjs-cloudflare preview` |
| `deploy` | `npm run cf:build && opennextjs-cloudflare deploy` |
| `upload` | `npm run cf:build && opennextjs-cloudflare upload` |
| `cf-typegen` | `wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts` |

These follow the adapter's own `opennextjs-cloudflare migrate` conventions,
with `npx prisma generate` chained in front because this repo's `build` script
requires it.

**Run `npm run preview` before `npm run deploy`.** It runs the real production
worker under miniflare locally and is where bundle-size and global-scope
failures will surface first.

---

## 4. Configuration decisions made here

### Image optimization: `unoptimized: true`

Cloudflare has no drop-in replacement for Next's Node/sharp image optimizer.
Three options were considered; `next.config.ts` now uses the third.

| Option | Result | Cost |
| --- | --- | --- |
| Custom `loaderFile` → `/cdn-cgi/image/` | Real optimization | Billed as Images Transformations, **and `/cdn-cgi/image/` only works on a Cloudflare zone with Image Resizing enabled — it does not work on `*.workers.dev`**, so previews break |
| Adapter's built-in `/_next/image` handler + `IMAGES` binding | Best quality: real resize, AVIF/WebP, honours `remotePatterns`/`qualities` | **5,000 unique transformations/month free, then $0.50 per 1,000**, plus one Worker request per image |
| **`images.unoptimized: true` (chosen)** | `next/image` emits the upstream CDN URL directly | **$0, and zero Worker requests** |

Reasoning: this site renders large grids of AniList cover art, and a billable
"transformation" is every distinct `(url, width, quality, format)` tuple. With
nine allowed `qualities` and Next's default device-size ladder, a single cover
image can generate a dozen distinct transformations. A few hundred visitors
browsing the catalogue would exhaust 5,000/month within days, after which every
additional 1,000 images costs $0.50 — an unbounded, traffic-proportional bill on
a site whose whole point is browsing lots of thumbnails.

`unoptimized` also avoids a second, less obvious cost: options 1 and 2 both
route **every image request through the Worker**, against the free plan's
100,000 requests/day. With `unoptimized`, the browser fetches straight from
`s4.anilist.co` / `img.anili.st` / etc., which already serve CDN-cached,
appropriately-sized cover art.

The trade-off is real and should be stated plainly: **we lose responsive
`srcset` and automatic AVIF/WebP.** Visitors on small screens download
desktop-sized covers. If that turns out to hurt LCP more than the bill hurts,
switching is two lines: delete `unoptimized: true` from `next.config.ts` and
uncomment the `images` binding in `wrangler.jsonc`. `remotePatterns`,
`qualities` and `minimumCacheTTL` were deliberately left in place so that
switch needs no other edit.

### Incremental cache: KV, not R2

`open-next.config.ts` uses `kvIncrementalCache` rather than the adapter's
default `r2IncrementalCache`. KV is already in the picture for this project and
the free plan's KV allowance is generous; there is no other reason to provision
an R2 bucket.

Revalidation queue is `"direct"` (regenerate inline on the stale request) so
**no Durable Object is required** — that keeps the deploy free-plan-shaped.
`tagCache` is left at the default `"dummy"` because the app only uses
time-based revalidation (`export const revalidate = 300` in `app/page.tsx`,
`next: { revalidate }` on a handful of fetches) and never calls
`revalidateTag`/`revalidatePath`. If on-demand tag revalidation is added later,
a `tagCache` override must be wired up at the same time or those calls will
silently no-op.

### `nodejs_compat`

Required, and set in `wrangler.jsonc`. Three places depend on it:

- `lib/anime/dash-proxy.ts` — `node:crypto` (`createCipheriv`, `randomBytes`)
- `app/api/proxy/m3u8-streaming-proxy/route.ts` — `Buffer`
- `@prisma/adapter-pg` + `pg` — `node:net`, `node:tls`, `node:stream`

With `compatibility_date >= 2025-04-01` this flag also auto-populates
`process.env` from vars and secrets. **Caveat:** the adapter populates
`process.env` *per request*, not at isolate startup. Module-scope reads of
`process.env.X` can see `undefined`. `lib/db.ts` is already lazy (the Prisma
client is built on first property access, not at import), so it is safe — but
keep this in mind for any new module-scope config.

`global_fetch_strictly_public` is also set, so the app's same-origin
`/api/proxy/*` fetches route over the public internet rather than
short-circuiting inside the isolate.

### Rate limiter

`lib/rate-limit.ts` had an **unguarded module-scope `setInterval`**. Workers
forbids I/O and timers in global scope — that call throws during isolate
initialisation and takes the entire Worker down on every request. It is now
guarded with a `typeof setInterval !== "undefined"` check plus a `try/catch`,
matching the pattern already used in `lib/cache.ts:33`.

Behavioural note now in the file: this limiter is **per-isolate**. Cloudflare
runs many isolates per colo and recycles them aggressively, so the effective
limit is some large multiple of `maxRequests`, not `maxRequests`. Treat it as
cheap abuse dampening, not a security control. A real global limit needs a
shared store — a Durable Object, KV with a short TTL, or the Upstash Redis
that is already provisioned for the Anivexa API on Render.

---

# Known blockers

These are the things that stand between this preparation and a working
deployment. They are ordered by how likely they are to stop you.

## Blocker 1 — `app/api/watch-party/stream/route.ts` will not work on Workers

> **Status: resolved for the first deploy by option 3 (ship without it).** Watch Party
> is gated behind `NEXT_PUBLIC_WATCH_PARTY_ENABLED` (see `lib/features.ts`), which
> defaults to **off**. While off, the "WatchTogether" pill is hidden, `/watch-party`
> shows a "taking a break" page, and all five `/api/watch-party/*` routes return
> `503`. The routes and Prisma models are still in the repo — they are just inert.
> Rebuilding it on Durable Objects (option 1) is the planned follow-up **after** the
> site is deployed and verified live. Set the flag to `true` only on a Node host.

**This is a hard stop for the watch-party feature.** Nothing about it was
changed; it is documented only.

The route holds a `ReadableStream` open indefinitely and, inside it, runs two
recursive `setTimeout` loops: a 20-second keepalive ping and — the real problem
— a **Prisma query against `watchPartyEvent` every 800 ms, per connected
client, for the entire lifetime of the connection.**

Why this fails on Workers:

- **CPU time.** Workers bill and cap CPU time per invocation. A connection open
  for ten minutes performs ~750 database round-trips inside a single
  invocation. Even though most of that is I/O wait, the query/deserialise work
  accumulates against the limit.
- **Duration and eviction.** Workers isolates are not long-lived servers.
  A held-open SSE response is at the mercy of isolate eviction; clients will see
  the stream die at unpredictable intervals.
- **Database connections.** Each concurrent viewer is a separate isolate
  hammering Postgres 1.25 times/second. Ten viewers in one room is ~12.5
  queries/second of pure polling with no users doing anything. Hyperdrive pools
  this but does not make it sane.
- **Cost.** On the paid plan this is billed duration for work that is almost
  entirely idle waiting.

Options, in order of preference:

1. **Durable Objects.** This is the shape the feature actually wants. One DO
   instance per room code becomes the authoritative room state; clients connect
   over WebSocket (use DO Hibernation so idle rooms cost nothing). Events are
   *pushed* on write instead of polled, and the 800 ms Prisma loop disappears
   entirely. Requires SQLite-backed DOs; the write path in the other
   `watch-party` routes would also move into the DO.
2. **Host the watch-party service separately.** You already run a Render
   service for the Anivexa API with Upstash Redis attached. Move the SSE
   endpoint there, backed by Redis pub/sub instead of Prisma polling, and point
   the client at it. Lowest-effort path to a working deploy: the rest of the
   site goes to Workers now, this one route does not.
3. **Ship without watch-party.** Gate the feature off and deploy the rest.

Do not attempt to "fix" this by increasing the poll interval. The architecture,
not the interval, is what is wrong for this runtime.

## Blocker 2 — segment proxy memory, `app/api/proxy/m3u8-streaming-proxy/route.ts`

Workers isolates have a **128 MB memory limit**, and exceeding it terminates
the isolate mid-request. Not changed; documented only.

The good news is narrower than feared: the **normal** video-segment path already
streams (`return new Response(response.body, ...)`) and never buffers. The risk
is confined to two paths that call `await response.arrayBuffer()`:

- **The FlixCloud image-unwrap path** (around line 136). It does
  `Buffer.from(await response.arrayBuffer())` and then `Buffer.from(body.subarray(offset))`
  — so it holds roughly **two full copies of the segment in memory** while it
  XOR-decodes. HLS segments are usually 2–10 MB, which is survivable; a large
  or hostile segment under concurrency is not. Several simultaneous viewers on a
  FlixCloud source multiply this.
- **The subtitle path**, which buffers the whole file. Subtitle files are small;
  this is not a practical concern.

If this path stays, the fix is to XOR-decode as a `TransformStream` over
`response.body` rather than buffering, and to reject responses whose
`Content-Length` exceeds a cap. That is a real code change to a file another
agent owns, so it is out of scope here — but it should be done before the
FlixCloud source is used in production on Workers.

## Blocker 3 — Worker bundle size vs. the 3 MiB free-plan limit

Limits are **3 MiB compressed on the free plan, 10 MiB on Workers Paid.**
Measured on this repo:

| Item | Uncompressed | Gzipped |
| --- | --- | --- |
| `node_modules/.prisma/client/query_compiler_fast_bg.wasm` | 3.67 MB | **1.19 MB** |
| all `.next/server/**/*.js` (dev build, excl. sourcemaps) | ~5 MB | ~0.71 MB |

The `.next/server` directory being 19 MB is **not** the headline risk — most of
that is sourcemaps and per-route dev chunks that dedupe in a production bundle.

**The headline risk is Prisma.** Prisma 7 with the `PrismaPg` driver adapter
ships a WebAssembly query compiler, and at **1.19 MB gzipped it alone consumes
roughly 40% of the free-plan budget** before a single line of app code is
counted. Add the Next.js server runtime, 36 API routes, `next-auth`,
`@auth/prisma-adapter` and the app's own server code, and **exceeding 3 MiB is
likely.**

Honest assessment: **plan on Workers Paid ($5/month).** At 10 MiB there is
ample headroom and this stops being a design constraint.

You will not know the real number until you run `npm run preview` — the
`opennextjs-cloudflare build` output prints the bundle size, and this has not
been run (running it requires `next build`, which was out of scope while another
agent was mid-edit). **Do this measurement first, before anything else in
section 2.** If you must stay on the free plan and it does not fit, the levers
are, in order: move the Prisma-using routes off the Worker entirely; replace
Prisma with a lighter Postgres client on the hot path; or split the app across
multiple Workers with service bindings.

Unrelated but worth a look while you are here: `public/` contains
`final_worker.js` and `temp_worker.js`, which look like leftovers. Everything in
`public/` is published as a static asset.

## Blocker 4 — `lib/cache/kv.ts` still talks to KV over REST

Not changed; deliberately deferred. Today `lib/cache/kv.ts` reaches KV by
`fetch`ing `https://api.cloudflare.com/client/v4/accounts/.../storage/kv/...`
with a `CF_KV_API_TOKEN`. That works from anywhere, including from inside a
Worker, so **it is not a deploy blocker** — it is a correctness and cost
follow-up.

Once running on Workers it is strictly worse than the native binding:

- Every cache read is an **outbound subrequest to the public internet** —
  roughly 50–200 ms, versus single-digit milliseconds for a binding.
- Subrequests count against the Worker's per-invocation subrequest limit
  (50 on free, 1,000 on paid). A page doing several cached lookups burns
  through that budget on cache reads alone.
- It requires a long-lived API token stored as a secret, which a binding does
  not.
- The REST API is rate-limited per account in a way bindings are not.

The `APP_CACHE_KV` binding is already declared in `wrangler.jsonc` so the
migration is a code-only change: swap the four `fetch` call sites in
`lib/cache/kv.ts` (`kvGet`, `kvSet`, `kvDelete`, `kvDeletePrefix`) for
`getCloudflareContext().env.APP_CACHE_KV.{get,put,delete,list}`. Keep the REST
path as a fallback for non-Workers environments (local `next dev` without
miniflare, and `next build`), selected by whether the binding is present.

Note that `kvDeletePrefix` uses the REST bulk-delete endpoint; the binding API
has no bulk delete, so that one becomes a `list()` plus a loop of `delete()`
calls.

## Blocker 5 — the Next.js version gap

Covered in section 1: Next 16.2.9 caps the adapter at 1.20.1, and the adapter's
peer ranges are tracking Next security patches. Not a blocker for *today's*
deploy, but it means you are pinned to an older adapter and to a Next release
that newer adapters consider unsafe. Schedule the `next@16.3.7` +
`@opennextjs/cloudflare@1.20.7` upgrade as its own task with a full build and
test pass.

---

## Appendix: files changed in this preparation pass

| File | Change |
| --- | --- |
| `package.json` | `@opennextjs/cloudflare@1.20.1` (pinned) and `wrangler@^4.143.0` as devDependencies; added `cf:build`, `preview`, `deploy`, `upload`, `cf-typegen` scripts |
| `package-lock.json` | Lock updated; adapter pinned to exact `1.20.1` |
| `wrangler.jsonc` | **New.** Worker name, `main`, `compatibility_date`, `nodejs_compat` + `global_fetch_strictly_public`, assets binding, observability, two KV bindings, self-reference service; Hyperdrive and Images bindings commented out with instructions |
| `open-next.config.ts` | **New.** KV incremental cache, `"direct"` queue, cache interception off |
| `next.config.ts` | `images.unoptimized: true` with the full rationale; `initOpenNextCloudflareForDev()` guarded to `NODE_ENV === "development"` and `.catch`-ed |
| `lib/rate-limit.ts` | Guarded the module-scope `setInterval`; documented the per-isolate weakness |
| `lib/db.ts` | Connection string resolved from `HYPERDRIVE_DATABASE_URL` → `POSTGRES_URL` → `DATABASE_URL`, with a `POSTGRES_CONNECTION_STRING_VAR` override. No new dependencies |
| `.env.example` | Added `AUTH_SECRET` and `NEXT_PUBLIC_ANIVEXA_WORKER_URL`; set `ANIVEXA_API_BASE_URL` to the Render URL; corrected `ANIME_API_BASE_URL` from `:4000` to `:5000`; documented the Hyperdrive vars |
| `DEPLOY-CLOUDFLARE.md` | **New.** This file |

Not changed, by design: `lib/anime/dash-proxy.ts`,
`app/api/proxy/m3u8-streaming-proxy/route.ts`, `app/api/watch-party/stream/route.ts`,
`lib/cache/kv.ts`, and every file owned by the concurrent watch-page work.
