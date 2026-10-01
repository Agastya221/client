import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteStoredStreams,
  readStoredStream,
  STORE_CLEANUP_SECONDS,
  streamRefreshPrefixes,
  streamStoreKey,
  streamStorePrefix,
  writeStoredStream,
  type StreamStorage,
} from "../lib/stream-store.ts";

function memoryStorage() {
  const data = new Map<string, unknown>();
  const ttls = new Map<string, number>();
  const storage: StreamStorage = {
    get: async <T,>(key: string) => (data.has(key) ? (data.get(key) as T) : null),
    set: async (key, value, ttl) => { data.set(key, value); ttls.set(key, ttl); },
    delete: async (key) => { data.delete(key); },
    deletePrefix: async (prefix) => { for (const key of [...data.keys()]) if (key.startsWith(prefix)) data.delete(key); },
  };
  return { storage, data, ttls };
}

const req = { animeId: "anilist~21", episodeNumber: 5, dubbed: false, server: "anivexa2-anikoto-hls-soft", provider: "anikoto" };

test("keys separate episode, language, server and provider; prefixes group them", () => {
  assert.equal(streamStoreKey(req), "stream-link:v1:anilist~21:ep5:sub:anivexa2-anikoto-hls-soft:anikoto");
  assert.equal(streamStoreKey({ animeId: "anilist~21" }), "stream-link:v1:anilist~21:ep1:sub:auto:auto", "defaults");
  assert.notEqual(streamStoreKey({ ...req, dubbed: true }), streamStoreKey(req), "dub is its own entry");
  assert.notEqual(streamStoreKey({ ...req, episodeNumber: 6 }), streamStoreKey(req));
  assert.ok(streamStoreKey(req).startsWith(streamStorePrefix(req)));
  // episode 1 must not match episode 10 or 11 when deleting by prefix
  assert.ok(!streamStoreKey({ ...req, episodeNumber: 10 }).startsWith(streamStorePrefix({ ...req, episodeNumber: 1 })));
});

test("a stored link comes back exactly as stored, with no timer on it", async () => {
  const { storage, ttls } = memoryStorage();
  const result = { source: { kind: "hls", url: "https://cdn.example/master.m3u8?token=abc", isM3U8: true }, serverOptions: [{ id: "a" }] };
  const key = streamStoreKey(req);
  assert.equal(await readStoredStream(key, storage), null, "nothing stored yet");
  await writeStoredStream(key, result, storage, 1_000);
  const stored = await readStoredStream<typeof result>(key, storage);
  assert.deepEqual(stored?.result, result);
  assert.equal(stored?.storedAt, 1_000);
  assert.equal(ttls.get(key), STORE_CLEANUP_SECONDS, "only a long cleanup lifetime, so storage never fills");
  assert.ok(STORE_CLEANUP_SECONDS >= 7 * 24 * 3600, "not an expiry rule: far longer than a week");
  assert.ok(!("verifiedAt" in (stored as object)), "nothing re-checks it on a schedule");
});

test("junk or foreign values in storage are ignored, not served", async () => {
  const { storage, data } = memoryStorage();
  const key = streamStoreKey(req);
  data.set(key, { v: 2, result: { source: null } });
  assert.equal(await readStoredStream(key, storage), null, "unknown version");
  data.set(key, { v: 1 });
  assert.equal(await readStoredStream(key, storage), null, "no result");
  data.set(key, "garbage");
  assert.equal(await readStoredStream(key, storage), null);
  const failing: StreamStorage = { ...storage, get: async () => { throw new Error("KV down"); } };
  assert.equal(await readStoredStream(key, failing), null, "a storage outage just means 'not stored'");
});

test("a refresh discards the failing server's links and the auto links, and nothing else", async () => {
  const { storage, data } = memoryStorage();
  const put = (server: string, provider = "anikoto", ep = 5, dubbed = false) =>
    writeStoredStream(streamStoreKey({ animeId: "anilist~21", episodeNumber: ep, dubbed, server, provider }), { n: `${server}-${provider}-${ep}-${dubbed}` }, storage);
  await put("anivexa2-anikoto-hls-soft");
  await put("anivexa2-aniwaves-hls-hard", "aniwaves");
  await put("auto", "auto");
  await put("auto", "anikoto");
  await put("megaplay-sub");
  await put("anivexa2-anikoto-hls-soft", "anikoto", 6);       // other episode
  await put("anivexa2-anikoto-hls-soft", "anikoto", 5, true); // dub

  const prefixes = streamRefreshPrefixes({ animeId: "anilist~21", episodeNumber: 5, dubbed: false, server: "anivexa2-anikoto-hls-soft" });
  for (const prefix of prefixes) await deleteStoredStreams(prefix, storage);

  const left = [...data.keys()].map((k) => k.replace("stream-link:v1:anilist~21:", "")).sort();
  assert.deepEqual(left, [
    "ep5:dub:anivexa2-anikoto-hls-soft:anikoto",
    "ep5:sub:anivexa2-aniwaves-hls-hard:aniwaves",
    "ep5:sub:megaplay-sub:anikoto",
    "ep6:sub:anivexa2-anikoto-hls-soft:anikoto",
  ].sort(), "other servers, the dub, and other episodes keep their links");
});

test("refreshing 'auto' only discards the auto links", () => {
  assert.deepEqual(streamRefreshPrefixes({ animeId: "x", episodeNumber: 2, dubbed: true }), ["stream-link:v1:x:ep2:dub:auto:"]);
});

test("a refresh marks every Render call fresh; ordinary calls are untouched", async () => {
  const { freshContext, isFreshRequest, withFreshParam } = await import("../lib/anime/fresh-context.ts");
  assert.equal(isFreshRequest(), false);
  assert.equal(withFreshParam("/watch/anikoto/21/sub/anikoto-5"), "/watch/anikoto/21/sub/anikoto-5", "normal calls are unchanged");
  await freshContext.run({ fresh: true }, async () => {
    assert.equal(isFreshRequest(), true);
    assert.equal(withFreshParam("/watch/anikoto/21/sub/anikoto-5"), "/watch/anikoto/21/sub/anikoto-5?fresh=1");
    assert.equal(withFreshParam("/watch/x?lang=en"), "/watch/x?lang=en&fresh=1");
    assert.equal(withFreshParam("/watch/x?fresh=1"), "/watch/x?fresh=1", "not added twice");
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(isFreshRequest(), true, "still fresh after awaiting, so nested lookups are covered");
  });
  assert.equal(isFreshRequest(), false, "and only inside the refresh");
});

test("the link store talks to Render's /linkstore with the proxy key, and failures just mean 'not stored'", async () => {
  const { createRemoteStreamStorage, linkStoreUrl } = await import("../lib/stream-store-remote.ts");
  assert.equal(linkStoreUrl("https://render.example/anilist"), "https://render.example/linkstore");
  assert.equal(linkStoreUrl("https://render.example/anilist/"), "https://render.example/linkstore");
  assert.equal(linkStoreUrl(null), null);

  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const reply = (responder: (body: Record<string, unknown>) => Response) => (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers)), body });
    return responder(body);
  }) as typeof fetch;

  const stored = new Map<string, string>();
  const storage = createRemoteStreamStorage({
    url: () => "https://render.example/linkstore",
    key: () => "k123",
    fetchImpl: reply((b) => {
      if (b.op === "set") { stored.set(String(b.key), String(b.value)); return Response.json({ ok: true }); }
      if (b.op === "get") return Response.json({ value: stored.get(String(b.key)) ?? null });
      return Response.json({ ok: true });
    }),
  });

  await storage.set("stream-link:v1:a", { n: 1 }, 99);
  assert.deepEqual(await storage.get("stream-link:v1:a"), { n: 1 }, "round trip");
  assert.equal(await storage.get("stream-link:v1:missing"), null);
  await storage.delete("stream-link:v1:a");
  await storage.deletePrefix("stream-link:v1:a:ep5:sub:auto:");
  assert.deepEqual(calls.map((c) => c.body.op), ["set", "get", "get", "del", "delprefix"]);
  assert.ok(calls.every((c) => c.url === "https://render.example/linkstore" && c.headers["x-proxy-key"] === "k123"));
  assert.equal(calls[0].body.ttlSeconds, 99);
  assert.equal(calls[0].body.value, JSON.stringify({ n: 1 }));

  const broken = createRemoteStreamStorage({ url: () => "https://x/linkstore", fetchImpl: (async () => { throw new Error("Render down"); }) as typeof fetch });
  assert.equal(await broken.get("stream-link:v1:a"), null);
  await broken.set("stream-link:v1:a", {}, 60);
  await broken.delete("stream-link:v1:a");
  await broken.deletePrefix("stream-link:v1:");

  const refused = createRemoteStreamStorage({ url: () => "https://x/linkstore", fetchImpl: (async () => new Response("{}", { status: 503 })) as typeof fetch });
  assert.equal(await refused.get("stream-link:v1:a"), null, "Redis not configured on Render");
  const garbage = createRemoteStreamStorage({ url: () => "https://x/linkstore", fetchImpl: (async () => Response.json({ value: "{not json" })) as typeof fetch });
  assert.equal(await garbage.get("stream-link:v1:a"), null, "unreadable value");

  const off = createRemoteStreamStorage({ url: () => null, fetchImpl: (async () => { throw new Error("must not be called"); }) as typeof fetch });
  assert.equal(await off.get("stream-link:v1:a"), null, "no proxy configured (local dev): nothing is stored, nothing is called");
  await off.set("stream-link:v1:a", {}, 60);
});
