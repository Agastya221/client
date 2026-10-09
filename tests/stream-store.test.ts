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
  assert.equal(streamStoreKey(req), "stream-link:v2:anilist~21:ep5:sub:anivexa2-anikoto-hls-soft:anikoto");
  assert.equal(streamStoreKey({ animeId: "anilist~21" }), "stream-link:v2:anilist~21:ep1:sub:auto:auto", "defaults");
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

  const left = [...data.keys()].map((k) => k.replace("stream-link:v2:anilist~21:", "")).sort();
  assert.deepEqual(left, [
    "ep5:dub:anivexa2-anikoto-hls-soft:anikoto",
    "ep5:sub:anivexa2-aniwaves-hls-hard:aniwaves",
    "ep5:sub:megaplay-sub:anikoto",
    "ep6:sub:anivexa2-anikoto-hls-soft:anikoto",
  ].sort(), "other servers, the dub, and other episodes keep their links");
});

test("refreshing 'auto' only discards the auto links", () => {
  assert.deepEqual(streamRefreshPrefixes({ animeId: "x", episodeNumber: 2, dubbed: true }), ["stream-link:v2:x:ep2:dub:auto:"]);
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

  await storage.set("stream-link:v2:a", { n: 1 }, 99);
  assert.deepEqual(await storage.get("stream-link:v2:a"), { n: 1 }, "round trip");
  assert.equal(await storage.get("stream-link:v2:missing"), null);
  await storage.delete("stream-link:v2:a");
  await storage.deletePrefix("stream-link:v2:a:ep5:sub:auto:");
  assert.deepEqual(calls.map((c) => c.body.op), ["set", "get", "get", "del", "delprefix"]);
  assert.ok(calls.every((c) => c.url === "https://render.example/linkstore" && c.headers["x-proxy-key"] === "k123"));
  assert.equal(calls[0].body.ttlSeconds, 99);
  assert.equal(calls[0].body.value, JSON.stringify({ n: 1 }));

  const broken = createRemoteStreamStorage({ url: () => "https://x/linkstore", fetchImpl: (async () => { throw new Error("Render down"); }) as typeof fetch });
  assert.equal(await broken.get("stream-link:v2:a"), null);
  await broken.set("stream-link:v2:a", {}, 60);
  await broken.delete("stream-link:v2:a");
  await broken.deletePrefix("stream-link:v2:");

  const refused = createRemoteStreamStorage({ url: () => "https://x/linkstore", fetchImpl: (async () => new Response("{}", { status: 503 })) as typeof fetch });
  assert.equal(await refused.get("stream-link:v2:a"), null, "Redis not configured on Render");
  const garbage = createRemoteStreamStorage({ url: () => "https://x/linkstore", fetchImpl: (async () => Response.json({ value: "{not json" })) as typeof fetch });
  assert.equal(await garbage.get("stream-link:v2:a"), null, "unreadable value");

  const off = createRemoteStreamStorage({ url: () => null, fetchImpl: (async () => { throw new Error("must not be called"); }) as typeof fetch });
  assert.equal(await off.get("stream-link:v2:a"), null, "no proxy configured (local dev): nothing is stored, nothing is called");
  await off.set("stream-link:v2:a", {}, 60);
});

test("the direct Upstash store sends Redis commands with the token, only touches stream-link keys, and failures mean 'not stored'", async () => {
  const { createUpstashStreamStorage, upstashConfig } = await import("../lib/stream-store-upstash.ts");
  assert.deepEqual(upstashConfig({ UPSTASH_REDIS_REST_URL: "https://u.example/", UPSTASH_REDIS_REST_TOKEN: " t " }), { url: "https://u.example", token: "t" });
  assert.equal(upstashConfig({ UPSTASH_REDIS_REST_URL: "https://u.example" }), null, "no token");
  assert.equal(upstashConfig({ UPSTASH_REDIS_REST_URL: "http://u.example", UPSTASH_REDIS_REST_TOKEN: "t" }), null, "https only");
  assert.equal(upstashConfig({ UPSTASH_REDIS_REST_URL: "https://YOUR_URL", UPSTASH_REDIS_REST_TOKEN: "t" }), null, "placeholder");
  assert.equal(upstashConfig({}), null);

  const calls: { url: string; auth: string | null; command: unknown[] }[] = [];
  const data = new Map<string, string>();
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization"), command });
    if (command[0] === "SET") { data.set(String(command[1]), String(command[2])); return Response.json({ result: "OK" }); }
    if (command[0] === "GET") return Response.json({ result: data.get(String(command[1])) ?? null });
    if (command[0] === "SCAN") {
      const match = String(command[3]).replace(/\*$/, "");
      return Response.json({ result: ["0", [...data.keys()].filter((k) => k.startsWith(match))] });
    }
    if (command[0] === "DEL") { for (const k of command.slice(1)) data.delete(String(k)); return Response.json({ result: command.length - 1 }); }
    return Response.json({ result: null });
  }) as typeof fetch;
  const storage = createUpstashStreamStorage({ fetchImpl, config: () => ({ url: "https://u.example", token: "tok" }) });

  await storage.set("stream-link:v2:a:ep1:sub:s1:p", { n: 1 }, 99);
  await storage.set("stream-link:v2:a:ep1:sub:auto:p", { n: 2 }, 99);
  await storage.set("stream-link:v2:a:ep2:sub:s1:p", { n: 3 }, 99);
  assert.deepEqual(await storage.get("stream-link:v2:a:ep1:sub:s1:p"), { n: 1 }, "round trip");
  assert.equal(await storage.get("stream-link:v2:missing"), null);
  assert.deepEqual(calls[0].command, ["SET", "stream-link:v2:a:ep1:sub:s1:p", JSON.stringify({ n: 1 }), "EX", 99]);
  assert.ok(calls.every((c) => c.url === "https://u.example" && c.auth === "Bearer tok"));

  await storage.deletePrefix("stream-link:v2:a:ep1:sub:");
  assert.deepEqual([...data.keys()], ["stream-link:v2:a:ep2:sub:s1:p"], "only that episode's links go");
  await storage.delete("stream-link:v2:a:ep2:sub:s1:p");
  assert.equal(data.size, 0);

  const before = calls.length;
  assert.equal(await storage.get("smartcache:other"), null);
  await storage.set("other:key", {}, 60);
  await storage.delete("other:key");
  await storage.deletePrefix("other:");
  await storage.deletePrefix("stream-link:*");
  assert.equal(calls.length, before, "keys outside stream-link: are never sent to Redis");

  const broken = createUpstashStreamStorage({ fetchImpl: (async () => { throw new Error("down"); }) as typeof fetch, config: () => ({ url: "https://u", token: "t" }) });
  assert.equal(await broken.get("stream-link:v2:a"), null);
  await broken.set("stream-link:v2:a", {}, 60);
  await broken.deletePrefix("stream-link:v2:");
  const refused = createUpstashStreamStorage({ fetchImpl: (async () => new Response("{}", { status: 401 })) as typeof fetch, config: () => ({ url: "https://u", token: "t" }) });
  assert.equal(await refused.get("stream-link:v2:a"), null, "bad token");
  const garbage = createUpstashStreamStorage({ fetchImpl: (async () => Response.json({ result: "{not json" })) as typeof fetch, config: () => ({ url: "https://u", token: "t" }) });
  assert.equal(await garbage.get("stream-link:v2:a"), null);
  const off = createUpstashStreamStorage({ fetchImpl: (async () => { throw new Error("must not be called"); }) as typeof fetch, config: () => null });
  assert.equal(await off.get("stream-link:v2:a"), null, "no secrets: nothing is called");
});

test("a resolved link is stored under the request, its real server and 'auto', so both ways of opening an episode find it", async () => {
  const { streamStoreKey, streamStoreWriteKeys, isExplicitServer } = await import("../lib/stream-store.ts");
  const fresh = { animeId: "anilist~1", episodeNumber: 3, dubbed: false, server: null, provider: "anikoto" };
  const keys = streamStoreWriteKeys(fresh, { activeServerId: "anivexa2-anikoto-hls-soft", provider: "anikoto" }, false);
  assert.deepEqual(keys, [
    "stream-link:v2:anilist~1:ep3:sub:auto:anikoto",
    "stream-link:v2:anilist~1:ep3:sub:anivexa2-anikoto-hls-soft:anikoto",
  ]);
  // what clicking the episode in the list asks for later
  assert.ok(keys.includes(streamStoreKey({ ...fresh, server: "anivexa2-anikoto-hls-soft" })));

  // a server-specific request also fills "auto" when it is empty, but never overwrites it
  const clicked = { ...fresh, server: "anivexa2-anikoto-hls-soft" };
  assert.ok(streamStoreWriteKeys(clicked, { activeServerId: "anivexa2-anikoto-hls-soft", provider: "anikoto" }, false).includes(streamStoreKey(fresh)));
  assert.ok(!streamStoreWriteKeys(clicked, { activeServerId: "anivexa2-anikoto-hls-soft", provider: "anikoto" }, true).includes(streamStoreKey(fresh)));

  // the provider the page will use afterwards (from the result) is covered as well as the requested one
  const otherProvider = streamStoreWriteKeys({ ...fresh, provider: null }, { activeServerId: "megaplay-sub", provider: "anikoto" }, true);
  assert.ok(otherProvider.includes("stream-link:v2:anilist~1:ep3:sub:megaplay-sub:anikoto"));
  assert.ok(otherProvider.includes("stream-link:v2:anilist~1:ep3:sub:megaplay-sub:auto"));

  assert.equal(isExplicitServer("auto"), false);
  assert.equal(isExplicitServer(null), false);
  assert.equal(isExplicitServer("megaplay-sub"), true);
});

test("server lists have their own key, outside what a link refresh deletes", async () => {
  const { serverListStoreKey, streamRefreshPrefixes } = await import("../lib/stream-store.ts");
  const key = serverListStoreKey({ anilistId: 21, episodeNumber: 5, dubbed: true, workerProvider: "anikoto" });
  assert.equal(key, "stream-link:servers:v1:21:ep5:dub:anikoto");
  for (const prefix of streamRefreshPrefixes({ animeId: "anilist~21", episodeNumber: 5, dubbed: true, server: "x" })) {
    assert.ok(!key.startsWith(prefix), prefix);
  }
});

test("stored links use the v2 key, so entries saved without skip times are not served again", () => {
  assert.ok(streamStoreKey({ animeId: "anilist~21", episodeNumber: 5 }).startsWith("stream-link:v2:"));
});
