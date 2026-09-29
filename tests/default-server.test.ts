import assert from "node:assert/strict";
import test from "node:test";
import { resolveStreamSource } from "../lib/anime/api.ts";
import { GATEWAY_SERVERS, gatewayMatchesServer } from "../lib/anime/server-selection.ts";

process.env.AUTH_SECRET = "test-secret";

// Default playback: Solaris first (soft subs, dub), Waves only as the fallback, decided
// by priority rather than by whichever provider happens to answer first.

type ProviderPlan = { delayMs: number; sub?: "soft" | "hard"; dub?: boolean } | null;

function stubProviders(plan: Record<"anikoto" | "aniwaves", ProviderPlan>) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const match = url.match(/\/watch\/(anikoto|aniwaves)\/\d+\/(sub|dub)\//);
    if (!match) return new Response("{}", { status: 404 });
    const [, provider, audio] = match as unknown as [string, "anikoto" | "aniwaves", "sub" | "dub"];
    const entry = plan[provider];
    if (!entry) return new Response("{}", { status: 500 });
    await new Promise((resolve) => setTimeout(resolve, entry.delayMs));
    const stream = { url: `https://cdn.example/${provider}-${audio}.m3u8`, type: "hls", server: "HD-1" };
    let body: Record<string, unknown> = {};
    if (audio === "dub" && entry.dub) body = { dub: { streams: [stream] } };
    if (audio === "sub" && entry.sub) body = { [entry.sub === "soft" ? "ssub" : "hsub"]: { streams: [stream] } };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

let nextId = 770000;
const resolve = (overrides: { dubbed?: boolean; server?: string } = {}) =>
  resolveStreamSource({ animeId: `anilist~${nextId++}`, episodeNumber: 1, ...overrides });

test("a cold Solaris (~5 s, as measured on Render) still wins over a fast Waves", async () => {
  stubProviders({ anikoto: { delayMs: 5000, sub: "soft" }, aniwaves: { delayMs: 20, sub: "hard" } });
  const result = await resolve();
  assert.match(result.activeServerId || "", /^anivexa2-anikoto-hls-.*soft$/);
});

test("Solaris soft sub is the default even when Waves answers first", async () => {
  stubProviders({ anikoto: { delayMs: 400, sub: "soft" }, aniwaves: { delayMs: 20, sub: "hard" } });
  const result = await resolve();
  assert.ok(result.source, "something plays");
  assert.match(result.activeServerId || "", /^anivexa2-anikoto-hls-.*soft$/);
});

test("Solaris is the default dub even when Waves answers first", async () => {
  stubProviders({ anikoto: { delayMs: 400, dub: true }, aniwaves: { delayMs: 20, dub: true } });
  const result = await resolve({ dubbed: true });
  assert.match(result.activeServerId || "", /^anivexa2-anikoto-hls-.*dub$/);
});

test("falls back to Waves when Solaris does not have the episode", async () => {
  stubProviders({ anikoto: { delayMs: 20 }, aniwaves: { delayMs: 60, sub: "hard" } });
  const result = await resolve();
  assert.ok(result.source);
  assert.match(result.activeServerId || "", /^anivexa2-aniwaves-/);
});

test("falls back to Waves when Solaris errors", async () => {
  stubProviders({ anikoto: null, aniwaves: { delayMs: 60, sub: "hard" } });
  const result = await resolve();
  assert.match(result.activeServerId || "", /^anivexa2-aniwaves-/);
});

test("a slow Solaris cannot stall playback: Waves is used after the ~6 s cap", async () => {
  stubProviders({ anikoto: { delayMs: 7500, sub: "soft" }, aniwaves: { delayMs: 20, sub: "hard" } });
  const startedAt = Date.now();
  const result = await resolve();
  const elapsed = Date.now() - startedAt;
  assert.match(result.activeServerId || "", /^anivexa2-aniwaves-/);
  assert.ok(elapsed >= 5900 && elapsed < 7400, `waited ${elapsed} ms (expected ~6000)`);
});

test("gateway buttons resolve to that provider's stream without knowing its exact id", async () => {
  stubProviders({ anikoto: { delayMs: 10, sub: "soft", dub: true }, aniwaves: { delayMs: 10, sub: "hard", dub: true } });
  const waves = await resolve({ server: "anivexa-aniwaves-hsub" });
  assert.ok(waves.source);
  assert.match(waves.activeServerId || "", /^anivexa2-aniwaves-.*hard$/);
  const solaris = await resolve({ server: "anivexa-anikoto-ssub" });
  assert.match(solaris.activeServerId || "", /^anivexa2-anikoto-.*soft$/);
  const solarisDub = await resolve({ server: "anivexa-anikoto-dub", dubbed: true });
  assert.match(solarisDub.activeServerId || "", /^anivexa2-anikoto-.*dub$/);
});

test("gateway ids used by the picker are the ones the server understands", () => {
  const ids = [...GATEWAY_SERVERS.soft, ...GATEWAY_SERVERS.hard, ...GATEWAY_SERVERS.dub].map((g) => g.id);
  assert.deepEqual(ids, ["anivexa-anikoto-ssub", "anivexa-aniwaves-hsub", "anivexa-anikoto-dub", "anivexa-aniwaves-dub"]);
  assert.equal(GATEWAY_SERVERS.dub[0].label, "Solaris", "Solaris leads the dub row");
});

test("a gateway button lights up for the real server it resolved to", () => {
  assert.equal(gatewayMatchesServer("anivexa-anikoto-ssub", "anivexa2-anikoto-hls-soft"), true);
  assert.equal(gatewayMatchesServer("anivexa-anikoto-ssub", "anivexa2-anikoto-hls-s2-soft"), true);
  assert.equal(gatewayMatchesServer("anivexa-anikoto-ssub", "anivexa2-aniwaves-hls-soft"), false, "other provider");
  assert.equal(gatewayMatchesServer("anivexa-anikoto-ssub", "anivexa2-anikoto-hls-dub"), false, "other mode");
  assert.equal(gatewayMatchesServer("anivexa-aniwaves-hsub", "anivexa2-aniwaves-hls-hard"), true);
  assert.equal(gatewayMatchesServer("anivexa-aniwaves-dub", "anivexa2-aniwaves-hls-s1-dub"), true);
  assert.equal(gatewayMatchesServer("anivexa-anikoto-dub", null), false);
});
