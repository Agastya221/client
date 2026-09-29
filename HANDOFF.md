# Anime Website Handoff: Anivexa Playback

Last updated: 2026-09-29. Read `AGENTS.md` before editing code; this repo uses Next.js 16 and its local docs in `node_modules/next/dist/docs/`.

## Goal and user decisions

- Keep the anime-specific theme and existing watch layout. The current work is about fast, reliable playback and a small server picker.
- Show Waves for hard subs and Solaris for soft subs. Show both Waves and Solaris for dub. Do not show Nexus or the generic `Subs` row in the normal picker. **The Embed section stays visible** (collapsible "Embed" toggle with Sub/Dub Embeds rows, as on master) — the user explicitly wants it; it was wrongly hidden in c0c15ba and restored in ed1801a. Embeds are also still the automatic last fallback.
- While an episode's server list is loading, the picker shows clickable gateway buttons (Solaris soft, Waves hard, Solaris + Waves dub — `GATEWAY_SERVERS` in `lib/anime/server-selection.ts`), never grey placeholders. Row order: Soft Subs, Hard Subs, Dub.
- Show 2-4 distinct streams per row when that many usable streams exist. The user explicitly chose **one real hard-sub server** over padding Hard Subs with a fake or embed backup when only one exists.
- Rename technical variants (HD-1, HD-2, beta, etc.) to simple labels: `Waves`, `Solaris 1`, `Solaris 2`, etc. Keep their distinct server IDs underneath.
- Keep first playback fast. Do not run a full 14-provider scan or prefetch large video segments just to populate the picker.

## Workspace state

- Repo: `E:\tatakai\anime-website`
- Branch: `test/anivexa-provider-coverage`, at `19b7371` (same as `origin/test/anivexa-provider-coverage` when this file was written). `master` was at `218c023`. Do not merge the experiment into master without a new user request.
- The focused Waves/Solaris and health changes below are **uncommitted**. Check `git status -sb` before continuing.
- `app/page.tsx` is also dirty from unrelated home-page work. Preserve it; do not reset or include it in playback edits.
- Commit `068a3a5` already contains the broader Anivexa provider integration, Vidstack DASH support, and a signed DASH proxy. This handoff covers subsequent uncommitted narrowing and health work.
- Local watch page returned HTTP 200 at `http://localhost:3000/anime/anilist~19/watch?ep=1` when checked. A dev server may already be running.

## Playback implementation

- `lib/anime/types.ts`: normal discovery list is now only `aniwaves` and `anikoto`. The API still knows all Anivexa providers for explicit routes.
- `lib/anime/api.ts`: default sub and dub playback is **Solaris first** (soft subs; dub), chosen by priority not speed: Waves is used only if Solaris lacks the episode, errors, or takes over ~3 s (`ANIVEXA_PREFERRED_PROVIDER_WAIT_MS`). Cache key `anivexa-first:v5`. `checkAnivexaServerHealth` resolves one exact server for the episode and caches the health result in process for 60 seconds.
- `components/anime/WatchExperience.tsx`: discovers both audio modes for those two providers (four background requests), renders only focused hard/soft/dub choices, uses simple provider-number labels, hides the generic Subs row, and shows embeds in a collapsible Embed section below the focused rows. It prewarms only the selected HLS master and first variant playlist while the poster is visible. No video segments are prefetched.
- `lib/anime/server-selection.ts`: `focusedServerCandidates`/`selectFocusedServers` keep up to four real Waves/Solaris options per section, omit failed variants and Nexus, and preserve both providers in dub. This is the place to adjust ranking or variant count.
- `lib/anime/stream-health.ts`, `app/api/anivexa/server-health/route.ts`, and `components/anime/watch/useServerHealth.ts`: background checks inspect an HLS manifest/first media segment and soft-sub file, or a small MP4 range. DASH manifest-only and embeds stay unverified until playback. Checks run two at a time after a short delay and pause while a player is loading. Actual playback success/error overrides a probe result.
- Automatic source failure favors checked Waves/Solaris internal streams; hidden custom embeds remain last fallback. A failed auto-selected source can switch before Play. A manually selected failed source stays selected until Play so it can be tested.
- DASH support from `068a3a5` uses bundled `dashjs` in `components/player/VidstackPlayer.tsx` and an encrypted same-origin proxy in `app/api/proxy/dash/route.ts`. `AUTH_SECRET` or `NEXTAUTH_SECRET` is needed for signed DASH proxy tokens. Never paste the secret into logs or this document.

## Verified results

- Full suite: `npm test` passed **99/99**; `npm run typecheck` passed after the focused picker edits. `git diff --check` passed.
- Chromium mobile (390 x 844) showed no horizontal overflow. Monster episode 1 displayed one Waves hard-sub choice, up to four numbered Solaris soft-sub choices, and Waves plus Solaris dub choices. Nexus and generic Subs were absent. (That test predates restoring the Embed section.)
- Warm Monster page: watch HTML arrived in about 0.6 seconds; Waves option arrived around 4.5 seconds, Solaris around 5.2 seconds. A cold Next dev build once took about 10 seconds for the first options; do not assume that is production latency.
- Switching an already discovered Waves/Solaris server resolved in roughly 300 ms. With playlist prewarm, Chromium reached video time >1 second in about 4.2 seconds for Waves and 3.6 seconds for Solaris; there were no proxy errors in that test.
- Monster dub: Solaris played beyond 14 seconds; Waves dub returned a real HLS media segment. The Dub control became available after episode-specific discovery.
- Health checks on Monster: Waves and Solaris media were reachable; Kage returned 403; Nova could not be confirmed by the direct probe. A failing Kage stream switched to checked Solaris during playback. An auto-selected failing Kage switched before Play, while a manual Kage selection remained available for testing.
- Mushoku Tensei S3 episode 1 (`anilist~178789`) previously had a Solaris segment 404; a later health check succeeded. Treat provider availability as episode-specific and transient, not a permanent provider verdict.
- The public DASH sample played through the signed local proxy in Chromium. AnimeOnsen itself returned `match not confident` for sampled anime, so its real protected stream remains unverified.

## Remaining limits and next steps

1. Verify this focused flow on more sub-only, dub-only, long-running, and recent anime before proposing a merge or deployment. Do not claim that a server is playable from a JSON response alone.
2. First-visit buttons still wait for provider discovery. `master` appeared instant partly because it showed static gateway buttons before confirming streams. The current design favors real options. If optimizing further, measure a production build and the upstream API separately before adding more prefetching.
3. Health `Ready` means the first media bytes and, for soft subs, an external subtitle file were reachable. Full playback can still fail later; player events remain the final signal. Health results expire after 60 seconds.
4. If only one true Waves hard-sub stream exists for an episode, show just that one. Do not add a non-hard MyCloud variant or an embed to satisfy a numeric count.

## Resume commands

```powershell
cd E:\tatakai\anime-website
git status -sb
npm test
npm run typecheck
```

For a dev server using the deployed Render API, set only the public base URL in that shell, then start the site:

```powershell
$env:ANIVEXA_API_BASE_URL='https://tatakai-anivexa-api.onrender.com'
npm run dev
```

`ANIVEXA_API_BASE_URL` overrides `NEXT_PUBLIC_ANIVEXA_WORKER_URL`. The local `.env.local` is user-owned; do not print or commit its contents.
