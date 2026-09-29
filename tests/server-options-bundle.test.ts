import assert from "node:assert/strict";
import test from "node:test";
import { discoverAnivexaProviderServerOptions } from "../lib/anime/api.ts";

// Opening an episode asks for four server lists (Waves/Solaris x sub/dub). They must
// cost one KV write together, not four.

const CONTEXT_KEY = Symbol.for("__cloudflare-context__");

class FakeKv {
  puts: string[] = [];
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.puts.push(key); this.store.set(key, value); }
  async delete(key: string) { this.store.delete(key); }
  async list() { return { keys: [], list_complete: true }; }
}

type Scenario = Record<string, boolean>; // "aniwaves:sub" -> has streams?
let upstream: string[] = [];

function stubUpstream(scenario: Scenario) {
  upstream = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const match = url.match(/\/watch\/([a-z]+)\/\d+\/(sub|dub)\//);
    if (!match) return new Response("{}", { status: 404 });
    const combo = `${match[1]}:${match[2]}`;
    upstream.push(combo);
    const streams = scenario[combo]
      ? [{ url: `https://cdn.example/${match[1]}-${match[2]}.m3u8`, type: "hls", server: "HD-1" }]
      : [];
    return new Response(JSON.stringify({ streams }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

async function withWorkerKv(kv: FakeKv, run: () => Promise<void>) {
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const env = process.env as Record<string, string | undefined>;
  const saved = { ctx: globals[CONTEXT_KEY], node: env.NODE_ENV, site: env.NEXT_PUBLIC_SITE_URL, life: env.npm_lifecycle_event, fetch: globalThis.fetch };
  env.NODE_ENV = "production";
  env.NEXT_PUBLIC_SITE_URL = "https://example.workers.dev";
  delete env.npm_lifecycle_event;
  globals[CONTEXT_KEY] = { env: { APP_CACHE_KV: kv }, ctx: {}, cf: {} };
  try {
    await run();
  } finally {
    globals[CONTEXT_KEY] = saved.ctx;
    env.NODE_ENV = saved.node;
    env.NEXT_PUBLIC_SITE_URL = saved.site;
    env.npm_lifecycle_event = saved.life;
    globalThis.fetch = saved.fetch;
  }
}

const openEpisode = (anilistId: number, episodeNumber: number) => Promise.all(
  (["aniwaves", "anikoto"] as const).flatMap((workerProvider) => [false, true].map((dubbed) =>
    discoverAnivexaProviderServerOptions({ anilistId, episodeNumber, dubbed, uiProvider: "animekai", workerProvider }))),
);

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

test("opening an episode writes its four server lists as ONE KV entry", async () => {
  const kv = new FakeKv();
  await withWorkerKv(kv, async () => {
    stubUpstream({ "aniwaves:sub": true, "aniwaves:dub": true, "anikoto:sub": true, "anikoto:dub": true });
    const lists = await openEpisode(880001, 1);
    await flush();
    assert.deepEqual(lists.map((list) => list.length > 0), [true, true, true, true]);
    assert.equal(upstream.length, 4, "each list is fetched from upstream once");
    const serverOptionWrites = kv.puts.filter((key) => key.startsWith("anivexa-server-options"));
    assert.deepEqual(serverOptionWrites, ["anivexa-server-options:v2:880001:ep1"]);
  });
});

test("a second visit is served from the entry with no upstream calls or writes", async () => {
  const kv = new FakeKv();
  await withWorkerKv(kv, async () => {
    stubUpstream({ "aniwaves:sub": true, "aniwaves:dub": true, "anikoto:sub": true, "anikoto:dub": true });
    await openEpisode(880002, 3);
    await flush();
    const writesAfterFirst = kv.puts.length;
    upstream = [];
    const again = await openEpisode(880002, 3);
    await flush();
    assert.deepEqual(again.map((list) => list.length > 0), [true, true, true, true]);
    assert.equal(upstream.length, 0);
    assert.equal(kv.puts.length, writesAfterFirst);
  });
});

test("the served lists keep the caller's UI provider", async () => {
  const kv = new FakeKv();
  await withWorkerKv(kv, async () => {
    stubUpstream({ "aniwaves:sub": true, "anikoto:sub": true });
    const [waves] = await Promise.all([
      discoverAnivexaProviderServerOptions({ anilistId: 880003, episodeNumber: 1, dubbed: false, uiProvider: "anikoto", workerProvider: "aniwaves" }),
    ]);
    assert.ok(waves.length > 0);
    assert.ok(waves.every((option) => option.provider === "anikoto"));
  });
});

test("a sub-only title: the empty dub list is still asked live, never trusted from cache", async () => {
  const kv = new FakeKv();
  await withWorkerKv(kv, async () => {
    stubUpstream({ "aniwaves:sub": true, "anikoto:sub": true });
    const lists = await openEpisode(880004, 2);
    await flush();
    // [waves sub, waves dub, solaris sub, solaris dub]
    assert.deepEqual(lists.map((list) => list.length > 0), [true, false, true, false]);
    assert.equal(kv.puts.filter((key) => key.startsWith("anivexa-server-options")).length, 1);
    // The dub later appears upstream: it must show up rather than being hidden by the cache.
    stubUpstream({ "aniwaves:sub": true, "anikoto:sub": true, "aniwaves:dub": true });
    const dub = await discoverAnivexaProviderServerOptions({ anilistId: 880004, episodeNumber: 2, dubbed: true, uiProvider: "animekai", workerProvider: "aniwaves" });
    assert.ok(dub.length > 0, "a newly available dub is not masked by the cached empty list");
  });
});

test("when every list is empty nothing is cached, so nothing is hidden for 30 minutes", async () => {
  const kv = new FakeKv();
  await withWorkerKv(kv, async () => {
    stubUpstream({});
    const lists = await openEpisode(880005, 1);
    await flush();
    assert.ok(lists.every((list) => list.length === 0));
    assert.equal(kv.puts.filter((key) => key.startsWith("anivexa-server-options")).length, 0);
  });
});
