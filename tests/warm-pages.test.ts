import assert from "node:assert/strict";
import test from "node:test";
import { applyAccessGate } from "../lib/access/gate.ts";
import { makeWarmToken, pickWarmBatch, verifyWarmToken, WARM_HEADER } from "../lib/warm-pages.ts";

const SECRET = "warm-test-secret";
const ON = { SITE_ACCESS: "invite", SITE_ACCESS_SECRET: SECRET };
const SLOT = 10 * 60_000;

test("the rolling batch gives every title a turn and never repeats inside a pass", () => {
  const ids = Array.from({ length: 30 }, (_, i) => 1000 + i);
  const seen = new Set<number>();
  for (let slot = 0; slot < 30 / 4 + 1; slot++) {
    for (const id of pickWarmBatch(ids, slot * SLOT, 4)) seen.add(id);
  }
  assert.equal(seen.size, ids.length, "all 30 titles covered within about 8 ticks");
  assert.equal(pickWarmBatch(ids, 5 * SLOT, 4).length, 4);
  assert.deepEqual(pickWarmBatch(ids, 5 * SLOT + 1234, 4), pickWarmBatch(ids, 5 * SLOT, 4), "same slot, same batch");
  assert.notDeepEqual(pickWarmBatch(ids, 6 * SLOT, 4), pickWarmBatch(ids, 5 * SLOT, 4), "next slot moves on");
});

test("the batch handles small and empty pools", () => {
  assert.deepEqual(pickWarmBatch([], 0, 4), []);
  assert.deepEqual(pickWarmBatch([7, 8], 123 * SLOT, 4).sort(), [7, 8], "a pool smaller than the batch is returned whole");
  assert.deepEqual(pickWarmBatch([1, 2, 3], 0, 0), []);
});

test("the warm token is derived from the secret and verified in constant form", async () => {
  const token = await makeWarmToken(SECRET);
  assert.match(token, /^[0-9a-f]{40}$/);
  assert.equal(await verifyWarmToken(SECRET, token), true);
  assert.equal(await verifyWarmToken("other-secret", token), false);
  assert.equal(await verifyWarmToken(SECRET, token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")), false);
  assert.equal(await verifyWarmToken(SECRET, ""), false);
  assert.equal(await verifyWarmToken(SECRET, null), false);
  assert.equal(await verifyWarmToken("", token), false);
});

test("the gate lets the pre-warmer fetch pages, but only pages and only with a valid token", async () => {
  const token = await makeWarmToken(SECRET);
  const req = (path: string, headers: Record<string, string> = {}, method = "GET") =>
    new Request(`https://site.test${path}`, { method, headers });

  assert.equal(await applyAccessGate(req("/anime/anilist~21", { [WARM_HEADER]: token }), ON), null, "page with token");
  assert.equal((await applyAccessGate(req("/anime/anilist~21"), ON))?.status, 302, "page without token is still gated");
  assert.equal((await applyAccessGate(req("/anime/anilist~21", { [WARM_HEADER]: "0".repeat(40) }), ON))?.status, 302, "wrong token");
  assert.equal((await applyAccessGate(req("/api/resolve-source", { [WARM_HEADER]: token }, "POST"), ON))?.status, 401, "the token opens no API");
  assert.equal((await applyAccessGate(req("/api/watch-history", { [WARM_HEADER]: token }), ON))?.status, 401, "not even a GET to an API");
  assert.equal((await applyAccessGate(req("/anime/anilist~21", { [WARM_HEADER]: token }, "POST"), ON))?.status, 401, "GET only");
});
