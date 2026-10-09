import assert from "node:assert/strict";
import test from "node:test";
import { heroImageSrc, IMAGE_PROXY_PATH, isProxiableImage, maybeHandleImageProxy } from "../lib/proxy/image-proxy.ts";

test("only fanart.tv and TheTVDB artwork goes through the proxy; everything else stays direct", () => {
  assert.equal(isProxiableImage("https://assets.fanart.tv/fanart/tv/1/hdtvlogo/x.png"), true);
  assert.equal(isProxiableImage("https://artworks.thetvdb.com/banners/v4/series/1/clearlogo/x.png"), true);
  assert.equal(isProxiableImage("http://assets.fanart.tv/x.png"), false, "https only");
  assert.equal(isProxiableImage("https://assets.fanart.tv.evil.com/x.png"), false);
  assert.equal(isProxiableImage("https://evil.com/?u=https://assets.fanart.tv/x.png"), false);
  assert.equal(isProxiableImage("https://s4.anilist.co/file/x.jpg"), false, "AniList's own CDN already caches well");
  assert.equal(isProxiableImage(null), false);
  assert.equal(isProxiableImage("not a url"), false);
  const logo = "https://assets.fanart.tv/fanart/tv/1/hdtvlogo/a b.png";
  assert.equal(heroImageSrc(logo), `${IMAGE_PROXY_PATH}?u=${encodeURIComponent(logo)}`);
  assert.equal(heroImageSrc("https://www.official-site.jp/logo.png"), "https://www.official-site.jp/logo.png");
  assert.equal(heroImageSrc(null), null);
});

test("the proxy refuses other hosts and methods, and ignores other paths", async () => {
  const req = (u: string, method = "GET", path = IMAGE_PROXY_PATH) => new Request(`https://yorumi.lol${path}?u=${encodeURIComponent(u)}`, { method });
  assert.equal(maybeHandleImageProxy(new Request("https://yorumi.lol/anime/1")), null, "not ours: falls through");
  assert.equal((await maybeHandleImageProxy(req("https://evil.com/x.png")))?.status, 400);
  assert.equal((await maybeHandleImageProxy(new Request(`https://yorumi.lol${IMAGE_PROXY_PATH}`)))?.status, 400, "no u");
  assert.equal((await maybeHandleImageProxy(req("https://assets.fanart.tv/x.png", "POST")))?.status, 405);
});

test("a good image is served with long caching; a failed or non-image answer is not", async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } })) as typeof fetch;
    const ok = await maybeHandleImageProxy(new Request(`https://yorumi.lol${IMAGE_PROXY_PATH}?u=${encodeURIComponent("https://assets.fanart.tv/a.png")}`));
    assert.equal(ok?.status, 200);
    assert.equal(ok?.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(ok?.headers.get("content-type"), "image/png");
    assert.equal((await ok!.arrayBuffer()).byteLength, 4);

    globalThis.fetch = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    const html = await maybeHandleImageProxy(new Request(`https://yorumi.lol${IMAGE_PROXY_PATH}?u=${encodeURIComponent("https://assets.fanart.tv/b.png")}`));
    assert.equal(html?.status, 415, "never serves a non-image as an image");

    globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const missing = await maybeHandleImageProxy(new Request(`https://yorumi.lol${IMAGE_PROXY_PATH}?u=${encodeURIComponent("https://assets.fanart.tv/c.png")}`));
    assert.equal(missing?.status, 404);
    assert.equal(missing?.headers.get("cache-control"), "public, max-age=300", "a miss is retried soon, not cached for a year");

    globalThis.fetch = (async () => { throw new Error("down"); }) as typeof fetch;
    assert.equal((await maybeHandleImageProxy(new Request(`https://yorumi.lol${IMAGE_PROXY_PATH}?u=${encodeURIComponent("https://assets.fanart.tv/d.png")}`)))?.status, 504);
  } finally {
    globalThis.fetch = real;
  }
});
