import assert from "node:assert/strict";
import test from "node:test";
import { applyAccessGate, isOpenPath } from "../lib/access/gate.ts";
import { safeNextPath } from "../lib/access/next-path.ts";
import {
  ACCESS_COOKIE,
  getAccessConfig,
  makeInviteCode,
  memberFromCode,
  normalizeCode,
  redeemInviteCode,
  signSession,
  verifySession,
} from "../lib/access/invite.ts";

const SECRET = "test-secret-not-a-real-one";
const ON = { SITE_ACCESS: "invite", SITE_ACCESS_SECRET: SECRET };
const req = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  new Request(`https://site.test${path}`, { ...init, headers: init.cookie ? { cookie: init.cookie } : undefined });

test("with SITE_ACCESS unset the site is completely open, exactly as before", async () => {
  assert.equal(await applyAccessGate(req("/anime/one-piece"), {}), null);
  assert.equal(await applyAccessGate(req("/api/resolve-source", { method: "POST" }), undefined), null);
  assert.equal(getAccessConfig({ SITE_ACCESS_SECRET: SECRET }).enabled, false);
});

test("turning it on without any secret keeps the site open instead of locking everyone out", () => {
  assert.equal(getAccessConfig({ SITE_ACCESS: "invite" }).enabled, false);
  assert.equal(getAccessConfig({ SITE_ACCESS: "invite", AUTH_SECRET: "x" }).enabled, true);
});

test("codes are TK-<member>-<signature> and only genuine ones redeem", async () => {
  const config = getAccessConfig(ON);
  const code = await makeInviteCode(SECRET, 7);
  assert.match(code, /^TK-007-[A-Z2-9]{8}$/);
  assert.equal(await redeemInviteCode(config, code), 7);
  assert.equal(await redeemInviteCode(config, code.toLowerCase()), 7, "case does not matter");
  assert.equal(await redeemInviteCode(config, ` ${code.slice(0, 6)} ${code.slice(6)} `), 7, "stray spaces are ignored");
  assert.equal(await redeemInviteCode(config, code.slice(0, -1) + (code.endsWith("A") ? "B" : "A")), null);
  assert.equal(await redeemInviteCode(config, "TK-007-AAAAAAAA"), null);
  assert.equal(await redeemInviteCode(config, "nonsense"), null);
  assert.equal(memberFromCode("TK-007-AAAAAAAA"), 7);
  assert.equal(await redeemInviteCode(getAccessConfig({ ...ON, SITE_ACCESS_SECRET: "other" }), code), null, "another site's codes do not work");
});

test("the cap is what makes it 'the first 50'; raising it later admits more", async () => {
  const code51 = await makeInviteCode(SECRET, 51);
  assert.equal(await redeemInviteCode(getAccessConfig(ON), code51), null, "default cap is 50");
  assert.equal(await redeemInviteCode(getAccessConfig({ ...ON, SITE_MAX_MEMBERS: "100" }), code51), 51);
  assert.equal(await redeemInviteCode(getAccessConfig(ON), await makeInviteCode(SECRET, 50)), 50);
});

test("a leaked code can be revoked, which also ends that member's existing session", async () => {
  const cookie = await signSession(SECRET, 7);
  assert.equal(await verifySession(getAccessConfig(ON), cookie), 7);
  const revoked = getAccessConfig({ ...ON, SITE_REVOKED_MEMBERS: "3, 7" });
  assert.equal(await verifySession(revoked, cookie), null);
  assert.equal(await redeemInviteCode(revoked, await makeInviteCode(SECRET, 7)), null);
  assert.equal(await redeemInviteCode(revoked, await makeInviteCode(SECRET, 8)), 8);
});

test("session cookies expire and cannot be forged or edited", async () => {
  const config = getAccessConfig(ON);
  const cookie = await signSession(SECRET, 7, Date.now() - 61 * 86400_000);
  assert.equal(await verifySession(config, cookie), null, "older than 60 days");
  const good = await signSession(SECRET, 7);
  const [, expires, signature] = good.split(".");
  assert.equal(await verifySession(config, `8.${expires}.${signature}`), null, "member number edited");
  assert.equal(await verifySession(config, `7.${Number(expires) + 999999}.${signature}`), null, "expiry edited");
  assert.equal(await verifySession(config, "garbage"), null);
  assert.equal(await verifySession(config, undefined), null);
});

test("without an invite, pages redirect to the invite page and APIs answer 401", async () => {
  const page = await applyAccessGate(req("/anime/anilist~21/watch?ep=3"), ON);
  assert.equal(page?.status, 302);
  assert.equal(page?.headers.get("location"), "/beta-access?next=%2Fanime%2Fanilist~21%2Fwatch%3Fep%3D3");
  assert.equal((await applyAccessGate(req("/"), ON))?.headers.get("location"), "/beta-access");

  const api = await applyAccessGate(req("/api/resolve-source", { method: "POST" }), ON);
  assert.equal(api?.status, 401);
  assert.equal((await api?.json())?.code, "invite_required");
  assert.equal((await applyAccessGate(req("/api/watch-history"), ON))?.status, 401, "a GET to an API is 401, not a redirect");
});

test("with the cookie everything goes through", async () => {
  const cookie = `${ACCESS_COOKIE}=${await signSession(SECRET, 12)}`;
  assert.equal(await applyAccessGate(req("/anime/one-piece", { cookie }), ON), null);
  assert.equal(await applyAccessGate(req("/api/resolve-source", { method: "POST", cookie }), ON), null);
  const cap = { ...ON, SITE_MAX_MEMBERS: "10" };
  assert.equal((await applyAccessGate(req("/", { cookie }), cap))?.status, 302, "lowering the cap locks that member out");
});

test("the invite page, its API, static files and signed player links stay reachable", async () => {
  for (const path of [
    "/beta-access", "/api/beta-access", "/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/robots.txt",
    "/logo.png", "/fonts/x.woff2", "/api/proxy/m3u8-streaming-proxy", "/api/health", "/api/cron/warm",
  ]) {
    assert.equal(isOpenPath(path), true, path);
    assert.equal(await applyAccessGate(req(path), ON), null, path);
  }
  for (const path of ["/", "/anime/one-piece", "/api/resolve-source", "/beta-accessory", "/search"]) {
    assert.equal(isOpenPath(path), false, path);
  }
  assert.equal(await applyAccessGate(req("/api/resolve-source", { method: "OPTIONS" }), ON), null, "CORS preflights pass");
});

test("the admin panel stays reachable when locked out, but other admin routes do not", () => {
  assert.equal(isOpenPath("/admin/access"), true);
  assert.equal(isOpenPath("/api/admin/access"), true);
  assert.equal(isOpenPath("/api/admin/metrics"), false);
});

test("admin login: right password only, cookie expires and cannot be forged", async () => {
  const { adminConfigured, isAdmin, makeAdminCookie, passwordMatches, ADMIN_COOKIE } = await import("../lib/access/admin-auth.ts");
  const env = { SITE_ADMIN_PASSWORD: "correct horse battery" };
  assert.equal(adminConfigured({}), false, "no password set means the panel is off");
  assert.equal(adminConfigured({ SITE_ADMIN_PASSWORD: "short" }), false, "too-short passwords are refused");
  assert.equal(await passwordMatches(env, "correct horse battery", SECRET), true);
  assert.equal(await passwordMatches(env, "correct horse batterY", SECRET), false);
  assert.equal(await passwordMatches({}, "anything", SECRET), false);

  const cookie = await makeAdminCookie(env, SECRET);
  const asAdmin = (value: string) => new Request("https://site.test/", { headers: { cookie: `${ADMIN_COOKIE}=${value}` } });
  assert.equal(await isAdmin(env, asAdmin(cookie), SECRET), true);
  assert.equal(await isAdmin(env, asAdmin(cookie), "other-secret"), false);
  assert.equal(await isAdmin(env, asAdmin(`${Number(cookie.split(".")[0]) + 5000}.${cookie.split(".")[1]}`), SECRET), false);
  assert.equal(await isAdmin(env, asAdmin(await makeAdminCookie(env, SECRET, Date.now() - 13 * 3600_000)), SECRET), false, "older than 12h");
  assert.equal(await isAdmin(env, new Request("https://site.test/"), SECRET), false);
  // changing the password signs every admin out; removing it turns the panel off
  assert.equal(await isAdmin({ SITE_ADMIN_PASSWORD: "a brand new password" }, asAdmin(cookie), SECRET), false);
  assert.equal(await isAdmin({}, asAdmin(cookie), SECRET), false);
});

test("saved settings override the environment: cap and revoked members change without a redeploy", async () => {
  const { writeSiteSettings, resolveAccessConfig, readSiteSettings } = await import("../lib/access/settings.ts");
  const store = new Map<string, string>();
  const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) };
  const env = { ...ON, APP_CACHE_KV: kv };

  assert.equal((await resolveAccessConfig(env)).maxMembers, 50, "nothing saved: environment default");
  await writeSiteSettings(env, { maxMembers: 80, revoked: [4, 9] });
  const config = await resolveAccessConfig(env);
  assert.equal(config.maxMembers, 80);
  assert.deepEqual([...config.revoked], [4, 9]);
  assert.equal(await redeemInviteCode(config, await makeInviteCode(SECRET, 60)), 60, "raised cap admits member 60");
  assert.equal(await redeemInviteCode(config, await makeInviteCode(SECRET, 4)), null);

  await writeSiteSettings(env, { maxMembers: 80, revoked: [4, 9], watching: { enabled: false } });
  assert.deepEqual((await readSiteSettings(env, { fresh: true })).watching, { enabled: false });

  store.set("site-settings:v1", "{not json");
  assert.equal((await resolveAccessConfig(env)).maxMembers, 80, "a corrupt value keeps the last good settings");
});

test("friends code: one code, unlimited people, unaffected by the member cap; can be switched off or replaced", async () => {
  const { makeSharedCode, SHARED_BASE } = await import("../lib/access/invite.ts");
  const { writeSiteSettings, resolveAccessConfig } = await import("../lib/access/settings.ts");
  const store = new Map<string, string>();
  const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) };
  const env = { ...ON, SITE_MAX_MEMBERS: "5", APP_CACHE_KV: kv };

  const code = await makeSharedCode(SECRET, 1);
  assert.match(code, /^TK-FRIENDS-[A-Z2-9]{8}$/);
  const config = await resolveAccessConfig(env);
  // many different people, same code, well past the cap of 5
  for (let i = 0; i < 20; i++) assert.equal(await redeemInviteCode(config, code), SHARED_BASE + 1);
  assert.equal(await redeemInviteCode(config, code.toLowerCase()), SHARED_BASE + 1);
  assert.equal(await redeemInviteCode(config, "TK-FRIENDS-AAAAAAAA"), null, "made-up code");
  assert.equal(await redeemInviteCode(getAccessConfig({ ...env, SITE_ACCESS_SECRET: "other" }), code), null, "other secret");

  const session = await signSession(SECRET, SHARED_BASE + 1);
  assert.equal(await verifySession(config, session), SHARED_BASE + 1, "the session is good even though the cap is 5");
  const cookie = `${ACCESS_COOKIE}=${session}`;
  assert.equal(await applyAccessGate(req("/anime/one-piece", { cookie }), env), null);

  await writeSiteSettings(env, { shared: { version: 2 } });
  const rotated = await resolveAccessConfig(env);
  assert.equal(await redeemInviteCode(rotated, code), null, "the old code stops working");
  assert.equal(await verifySession(rotated, session), null, "and so does everyone signed in with it");
  assert.equal(await redeemInviteCode(rotated, await makeSharedCode(SECRET, 2)), SHARED_BASE + 2);

  await writeSiteSettings(env, { shared: { enabled: false, version: 2 } });
  const off = await resolveAccessConfig(env);
  assert.equal(await redeemInviteCode(off, await makeSharedCode(SECRET, 2)), null, "switched off");
  assert.equal(await verifySession(off, await signSession(SECRET, SHARED_BASE + 2)), null);
  // individual invites are untouched by all of this
  assert.equal(await redeemInviteCode(off, await makeInviteCode(SECRET, 3)), 3);
});

test("the invite page only ever sends people back into this site", () => {
  assert.equal(safeNextPath("/anime/anilist~21/watch?ep=3"), "/anime/anilist~21/watch?ep=3");
  assert.equal(safeNextPath("/search?q=one%20piece#top"), "/search?q=one%20piece#top");
  for (const evil of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", null, undefined]) {
    assert.equal(safeNextPath(evil as string), "/", String(evil));
  }
  // what the browser page does, with its real origin
  assert.equal(safeNextPath("/\\evil.com", "http://192.168.1.17:3001"), "/");
  assert.equal(safeNextPath("/history", "http://192.168.1.17:3001"), "/history");
});

test("a member who opens the invite page again is sent on into the site; others see the form", async () => {
  const cookie = `${ACCESS_COOKIE}=${await signSession(SECRET, 4)}`;
  const onward = await applyAccessGate(req("/beta-access?next=%2Fhistory", { cookie }), ON);
  assert.equal(onward?.status, 302);
  assert.equal(onward?.headers.get("location"), "/history");
  assert.equal((await applyAccessGate(req("/beta-access?next=%2F%5Cevil.com", { cookie }), ON))?.headers.get("location"), "/");
  assert.equal(await applyAccessGate(req("/beta-access"), ON), null, "no cookie: the form shows");
  assert.equal(await applyAccessGate(req("/api/beta-access", { method: "POST", cookie }), ON), null, "the code API is never redirected");
});

test("codes typed with spaces, underscores or phone-autocorrected dashes still work", async () => {
  const config = getAccessConfig(ON);
  const code = await makeInviteCode(SECRET, 7);
  const sig = code.slice(-8);
  for (const typed of [`tk 007 ${sig}`, `TK_007_${sig}`, `TK–007—${sig}`, `  TK - 007 - ${sig} `, `TK--007--${sig}`]) {
    assert.equal(await redeemInviteCode(config, typed), 7, JSON.stringify(typed));
  }
  const friends = await (await import("../lib/access/invite.ts")).makeSharedCode(SECRET, 1);
  assert.equal(normalizeCode(friends.toLowerCase().replace(/-/g, " ")), friends);
  assert.equal(await redeemInviteCode(config, "TK 007"), null);
});

test("individual members can never be mistaken for the friends code", async () => {
  assert.equal(getAccessConfig({ ...ON, SITE_MAX_MEMBERS: "5000000" }).maxMembers, 10000, "the cap is limited");
  assert.equal(memberFromCode("TK-900001-AAAAAAAA"), null, "numbers in the friends range are not members");
  const config = getAccessConfig({ ...ON, SITE_MAX_MEMBERS: "5000000" });
  assert.equal(await redeemInviteCode(config, await makeInviteCode(SECRET, 900001)), null);
  // a session for exactly SHARED_BASE is neither a member nor a friends session
  const { SHARED_BASE } = await import("../lib/access/invite.ts");
  assert.equal(await verifySession(config, await signSession(SECRET, SHARED_BASE)), null);
});

test("if KV cannot be read, a replaced friends code does not come back", async () => {
  const { makeSharedCode } = await import("../lib/access/invite.ts");
  const settings = await import("../lib/access/settings.ts");
  const broken = { get: async () => { throw new Error("KV down"); }, put: async () => {} };
  // a fresh module copy has no cached value, like a newly started worker isolate
  const fresh = await import(`../lib/access/settings.ts?isolate=${Date.now()}`) as typeof settings;
  const config = await fresh.resolveAccessConfig({ ...ON, APP_CACHE_KV: broken });
  assert.equal(await redeemInviteCode(config, await makeSharedCode(SECRET, 1)), null, "friends code off while settings are unknown");
  assert.equal(await redeemInviteCode(config, await makeInviteCode(SECRET, 3)), 3, "individual invites keep working");
});
