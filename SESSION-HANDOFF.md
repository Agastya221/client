# Session handoff (updated 2026-10-01, end of session 1)

Read this first. It replaces re-reading a very long chat. **No passwords or secrets are in this file**:
the user chose an admin password and a site secret in chat (they said they will change them at home);
they live only as Cloudflare secrets. Never write them to files or commits.

## The project
YoruMi anime site, Next.js 16 (non-standard build: read `node_modules/next/dist/docs/` before using Next APIs;
see AGENTS.md) on **Cloudflare Workers free plan** via OpenNext 1.20.1.
- Live: `https://tatakai-anime-website.tatakai-anime.workers.dev` (worker `tatakai-anime-website`)
- `yorumi.lol` is **not live**: its DNS is still at Hostinger (parked page). Needs nameservers moved to Cloudflare.
- Anivexa API (providers + AniList proxy) on Render: `https://tatakai-anivexa-api.onrender.com`.
  Repo `E:\tatakai\scratch\Anivexa-API`. **Push only to remote `renderrepo`** (user's repo), never `origin` (upstream is someone else's).
- DB: Neon Postgres via Prisma 7 + `@prisma/adapter-pg`. User constraints: don't change Neon compute, keep comments as they are.
- Branch `test/anivexa-provider-coverage`. Pushed up to `9986084`. **Committed locally but NOT pushed: `ed460dd` (stream links in Redis) and `b1f4972` (handoff)** — ask the user, they have always said yes.
  Render repo (`E:	atakai\scratch\Anivexa-API`, remote `renderrepo`) is fully pushed (latest `0f62a18` /linkstore).
- Working tree: `next.config.ts` has an UNCOMMITTED edit from ANOTHER session (not mine; see item 4 below). Never `git add -A` blindly.

## User preferences (learned the hard way)
- Wants things done, not asked about; but confirm before outward actions (deploy, push) unless they said "do it".
- Free plans only for now ("don't pay until I have a better userbase").
- Don't edit user-owned `.env.local`, never print secrets. Keep answers plain and short, say clearly when something is NOT verified.
- Send a `PushNotification` when a long task is done (they asked; delivery needs Remote Control, may not arrive).
- Site name is **YoruMi** (not Tatakai) in anything user-visible.

## Build and deploy (Windows host; build must run on Linux/WSL)
1. `wsl -e bash <path>/scripts/wsl/wsl-build.sh` (run from **PowerShell** with a `/mnt/c/...` path; Git Bash mangles the path).
   It copies the repo to `~/site` in WSL, builds with Node 20, then runs `scripts/patch-prisma-wasm.mjs`. (Edit the script's copy of
   the build steps if `package.json` `cf:build` changes.)
2. `wsl -e bash scripts/wsl/wsl-export.sh` copies `~/site/.open-next` back to `E:\tatakai\anime-website\.open-next`.
3. From Windows: `npx wrangler deploy` (Windows wrangler has the Cloudflare OAuth login; WSL wrangler does not). Secrets persist across deploys.
   Bundle is ~2,592 KiB gzipped; the free limit is 3,072 KiB. Always check "Total Upload".
- Wrangler prints a warning if the dashboard config differs from `wrangler.jsonc`. `wrangler.jsonc` now declares routes (yorumi.lol),
  `workers_dev: true`, `preview_urls: true`, service `environment: production`, and var `SITE_ORIGIN`. Declaring `routes` switches workers.dev OFF
  unless `workers_dev: true` is stated.
- Local test servers (may still be running): `next start` on :3000 and `scripts/dev-gate-proxy.ts` on :3001, started with throwaway
  env vars (`SITE_ACCESS=invite`, test secret, `SITE_SETTINGS_FILE=.data/site-settings.json`). Kill by port if needed.
- Tests: `npm test` (202 pass). Browser suites in `scripts/wsl/*-e2e.mjs` (need local servers + playwright-core; they carry state, reset `.data` between runs).

## What was built this session (all deployed unless noted)
1. **Invite-only gate** (`lib/access/*`, runs in `worker.ts` before Next because cached pages never reach Next). Off unless `SITE_ACCESS=invite`.
   Stateless codes `TK-<n>-<sig>` (HMAC of the secret), member cap, withdrawn list, **friends code** `TK-FRIENDS-…` (unlimited users, rotatable),
   60-day HttpOnly cookie. Settings stored in KV binding `APP_CACHE_KV` (key `site-settings:v1`), cached 60 s per isolate.
   Admin panel `/admin/access` (password secret `SITE_ADMIN_PASSWORD`), invite page `/beta-access`, welcome page `/welcome`.
   Live secrets set: `SITE_ACCESS_SECRET`, `SITE_ADMIN_PASSWORD`, `SITE_ACCESS`. User will rotate them: rotating the secret changes ALL codes.
2. **Watching counter** (`lib/watching.ts`, `components/anime/WatchingBadge.tsx`): fully automatic display number from open spots, viewer clock,
   weekday, per-title share, airing boost; coloured with the anime's accent. Admin has only an on/off switch. (User explicitly wanted this;
   it is a display figure, not a measurement.)
3. **Sign-in (AniList OAuth) fixes**, because AniList blocks Cloudflare IPs and Prisma cannot compile wasm at runtime on Workers:
   - Token exchange goes through Render: `anilistOAuthFetch` (`lib/anilist/endpoint.ts`, wired with Auth.js `customFetch` in `lib/auth.ts`) →
     `POST /anilist/token` on the Render API (commit 2842020 pushed to `renderrepo`). Uses the existing `ANILIST_PROXY_KEY`.
   - Sign-in DB adapter is plain SQL over `pg` (`lib/auth-adapter.ts`, `lib/pg-query.ts`), same `User`/`Account` tables.
   - **A real end-to-end sign-in has NOT been confirmed by the user yet.** Dummy-code replays reach AniList and fail correctly. Ask them to try and
     watch with `npx wrangler tail tatakai-anime-website --format json`.
4. **Prisma on Workers**: `scripts/patch-prisma-wasm.mjs` (run after the OpenNext build) makes the bundle import the `.wasm` with a relative path.
   Verified live: `prisma.bookmark.count()` works via admin-only `/api/admin/db-check`.
   **WARNING:** another session left an UNCOMMITTED edit in `next.config.ts` (`serverExternalPackages: ["@prisma/client", ".prisma/client"]`)
   aiming at the same problem differently. It is not part of the deployed build. Do not commit/deploy it blindly: test it against the current
   working setup, or drop it.
5. **Speed work** (commit `e18fd02`, deployed): search suggestions use `suggest=1` (6 results, no availability lookups; a cold search had taken 17.7 s),
   10 s client timeout; page lifetimes anime 24 h, new/ongoing/updates/home 3 h, genres 7 d; **page pre-warmer**: the 10-minute cron
   (`worker.ts` `scheduled`) calls `/api/cron/warm-pages` which renders a rotating batch of trending/seasonal/popular anime pages.
   Auth for it is a token derived from the secret (`x-warm-token`, `lib/warm-pages.ts`); the gate lets that token fetch pages only.
   Manual run verified (4 pages rendered, then visitors got `x-opennext-cache: HIT` in ~0.18 s).
   Confirmed: the real cron tick runs it (`warm-pages 200` in the Worker log).
6. **Stream link cache** (`lib/stream-store.ts`, wired in `resolveStreamSource` in `lib/anime/api.ts`): a playable resolved link is stored in the Render service's **Upstash Redis**
   (Worker -> `POST <render>/linkstore` with the existing `x-proxy-key`; `lib/stream-store-remote.ts` + `core/linkstore.js` in the Anivexa API;
   key `stream-link:v1:<anime>:ep<n>:<sub|dub>:<server>:<provider>`, 30-day cleanup TTL only; replaced Cloudflare KV because of its 1,000 writes/day cap) and served until replaced. NO timer.
   Replaced when the player errors (watch page tries a fresh link for that server once, `refreshClientStream`) or on "Refresh source"
   (`POST /api/resolve-source {refresh:true}`; discards that server's links + the "auto" ones only). A refresh also sends `?fresh=1` to Render
   (`lib/anime/fresh-context.ts`, ALS; Render commit bdc6bf1 pushed to renderrepo) so Render's own 3-hour watch cache is bypassed.
   Measured live (Redis): first open ~5-6 s, repeats ~0.37 s with the same link (KV was ~0.2 s: the Render hop adds ~0.17 s); refresh gives a NEW link (~4.4 s); other servers' links kept.
   Evidence for safety: one HLS link (anikoto, anilist~21 ep5) was still valid for 41 min (playlist, variant, segment; token's embedded time ignored,
   not IP-bound). Only one title/provider tested; unproven beyond that. Embed servers (megaplay etc.) are plain addresses with no token.
   Render Redis creds never leave Render. If Render/Redis is down, links are just not stored (2.5 s timeout, then resolves normally).
   Upstash free plan has its own MONTHLY command cap (believed ~500k; unconfirmed) — worth watching in the Upstash dashboard.
   NOT done yet: the watch PAGE itself is still rendered per visit (dynamic, reads searchParams: `app/anime/[id]/watch/page.tsx`) and server-list caching is separate.
7. Smaller: Embed button in the SUB/DUB row, bottom sheets slide up, `crypto.randomUUID` fallback for plain-http LAN, YoruMi rename in Discord/fallback image.

## Findings worth knowing
- Free plan: 10 ms CPU per request. A cold Worker start (whole Next server) costs 250–700 ms CPU and sometimes returns **Error 1102 / HTTP 503**.
  Cached pages are served by OpenNext's interceptor in ~4 ms without booting Next. Dynamic routes (`/search`, `/api/*`, `/auth/*`) always boot Next.
- Cache API only works on custom domains (not workers.dev) and is per-datacenter. KV free tier: 100k reads/day, **1,000 writes/day**
  (each ISR page refresh is a write, so longer lifetimes also protect that budget).
- Render keep-warm works (~230 ms per ping). Render is not the slowness; AniList via Render adds ~0.1–0.3 s per uncached call.
- Other Prisma-using routes (bookmarks, history, comments post, watch party) should work again after the wasm fix but were only spot-checked.
- Each DB connect from the Worker takes ~1.3 s (no pooling). Cloudflare Hyperdrive is free and would help (not done).
- Sign-in error page `/auth/signin` is rendered per request and is CPU-heavy (10–37 ms); a candidate to make cheaper.

## Open items, in rough priority (the user cares most about speed and not refetching things)
1. **Cache the watch page itself** (planned, agreed in principle): make `app/anime/[id]/watch/page.tsx` static/ISR with episode/server read in the
   browser (like the anime page, see `lib/use-hydrated.ts`), so it is served from cache (~0.2 s) instead of rebuilt each visit. Then **cache the server lists**
   per anime (one KV/Redis entry per anime, hours) and **remember recently-working servers** (~30 min) so the page opens on a healthy one. Never auto-switch
   servers silently (user rule: tell them to switch). Measure each step on the live site.
2. Ask the user to try AniList sign-in on the live site (still unconfirmed end to end); check the log if it fails
   (`npx wrangler tail tatakai-anime-website --format json`).
3. Push the two local site commits (ask first).
4. Decide what to do with the other session's `next.config.ts` edit (`serverExternalPackages` for Prisma): test against the current working setup or drop it.
5. Move `yorumi.lol` nameservers to Cloudflare (then set `SITE_ORIGIN`, enable the Cache API in front of KV/Redis, update the AniList app redirect URI and
   `ANILIST_REDIRECT_URI`/`NEXT_PUBLIC_SITE_URL` build env).
6. `/search` page and `resolve-source` are still uncached dynamic routes; other client fetches that can spin forever need timeouts and error messages.
7. Hyperdrive (free) to cut DB connect time (~1.3 s per connect). Workers Paid ($5/mo) would remove 1102/503 outright; user said not yet.
8. User will rotate the admin password and site secret at home (`wrangler secret put …`); then re-read the friends code from `/admin/access`.
9. The ad-watching gate ("watch an ad for 30 s") was discussed but NOT built.

## Starting the next session
Suggested first message: "Read SESSION-HANDOFF.md first, don't re-explore the codebase, tell me the open items in 5 lines, then wait for me to pick one."
Clean up first: local test servers on :3000/:3001 and any `wrangler tail` processes may still be running (kill by port / process).
