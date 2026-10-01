import assert from "node:assert/strict";
import test from "node:test";
import { edgeCacheKey, isShareable, withEdgeCache } from "../lib/edge-page-cache.ts";

const get = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

test("only the shareable watch page and comment list are cached, per deploy", () => {
  const key = (url: string, headers?: Record<string, string>) => edgeCacheKey(get(url, headers), "v1")?.key ?? null;
  assert.equal(key("https://yorumi.lol/anime/anilist~21/watch?ep=5"), "https://edge-cache.yorumi.internal/v1/watch/anilist~21/5/sub");
  assert.equal(key("https://yorumi.lol/anime/anilist~21/watch?ep=5&dub=1"), "https://edge-cache.yorumi.internal/v1/watch/anilist~21/5/dub");
  assert.equal(key("https://yorumi.lol/anime/anilist~21/watch"), "https://edge-cache.yorumi.internal/v1/watch/anilist~21/1/sub");
  assert.notEqual(edgeCacheKey(get("https://yorumi.lol/anime/anilist~21/watch?ep=5"), "v2")?.key, key("https://yorumi.lol/anime/anilist~21/watch?ep=5"), "a deploy starts fresh");
  assert.equal(key("https://yorumi.lol/anime/anilist~21/watch?ep=5&server=x"), null, "a chosen server is not shared");
  assert.equal(key("https://yorumi.lol/anime/anilist~21/watch?ep=0"), null);
  assert.equal(key("https://yorumi.lol/anime/anilist~21/watch?ep=5", { RSC: "1" }), null, "client navigation payload");
  assert.equal(key("https://yorumi.lol/anime/anilist~21"), null);
  assert.equal(edgeCacheKey(new Request("https://yorumi.lol/anime/anilist~21/watch?ep=5", { method: "POST" }), "v1"), null);

  assert.equal(key("https://yorumi.lol/api/comments?animeId=anilist~21&episode=3"), "https://edge-cache.yorumi.internal/v1/comments/anilist~21/3");
  assert.equal(edgeCacheKey(get("https://yorumi.lol/api/comments?animeId=anilist~21&episode=3"), "v1")?.seconds, 20);
  assert.equal(key("https://yorumi.lol/api/comments?animeId=anilist~21&episode=3&fresh=1"), null, "right after a post: always fresh");
  assert.equal(key("https://yorumi.lol/api/comments"), null);
});

test("responses with cookies or errors are never shared", () => {
  assert.equal(isShareable(new Response("ok")), true);
  assert.equal(isShareable(new Response("no", { status: 500 })), false);
  assert.equal(isShareable(new Response("ok", { headers: { "set-cookie": "a=1" } })), false);
});

test("a miss asks Next once and stores the page; the next request is served from the cache", async () => {
  const store = new Map<string, Response>();
  const cache = {
    async match(request: Request) { return store.get(request.url)?.clone(); },
    async put(request: Request, response: Response) { store.set(request.url, response); },
  };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
  let calls = 0;
  const next = async () => { calls += 1; return new Response("<html>ep5</html>", { headers: { "content-type": "text/html", "cache-control": "no-store" } }); };
  const request = () => get("https://yorumi.lol/anime/anilist~21/watch?ep=5");

  const first = await withEdgeCache(request(), "v1", next, ctx, cache);
  assert.equal(first.headers.get("x-edge-cache"), "MISS");
  assert.equal(first.headers.get("cache-control"), "no-store", "the viewer's own response keeps Next's headers");
  assert.equal(await first.text(), "<html>ep5</html>");
  await Promise.all(pending);

  const second = await withEdgeCache(request(), "v1", next, ctx, cache);
  assert.equal(second.headers.get("x-edge-cache"), "HIT");
  assert.equal(await second.text(), "<html>ep5</html>");
  assert.equal(calls, 1);

  const other = await withEdgeCache(get("https://yorumi.lol/anime/anilist~21/watch?ep=5&server=x"), "v1", next, ctx, cache);
  assert.equal(other.headers.get("x-edge-cache"), null, "not cacheable: straight to Next");
  assert.equal(calls, 2);
});

test("without a cache (workers.dev, tests) everything goes to Next", async () => {
  let calls = 0;
  const response = await withEdgeCache(get("https://x/anime/a/watch?ep=1"), "v1", async () => { calls += 1; return new Response("x"); }, { waitUntil() {} }, null);
  assert.equal(await response.text(), "x");
  assert.equal(calls, 1);
});
