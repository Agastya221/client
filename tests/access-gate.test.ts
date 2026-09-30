import assert from "node:assert/strict";
import test from "node:test";
import { applyAccessGate, isOpenPath } from "../lib/access/gate.ts";
import {
  ACCESS_COOKIE,
  getAccessConfig,
  makeInviteCode,
  memberFromCode,
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
