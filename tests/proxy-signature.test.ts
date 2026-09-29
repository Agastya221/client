import assert from "node:assert/strict";
import test from "node:test";
import { GET as routeGET } from "../app/api/proxy/m3u8-streaming-proxy/route.ts";
import { maybeHandleFastSegment } from "../lib/proxy/fast-segment.ts";
import { buildProxyUrl } from "../lib/proxy/build.ts";
import { signProxyParams, verifyProxyParams } from "../lib/proxy/signature.ts";

process.env.AUTH_SECRET = "test-secret-for-proxy-signatures";

const ORIGIN = "https://site.example";
const upstreamCalls: string[] = [];
globalThis.fetch = (async (url: string | URL | Request) => {
  upstreamCalls.push(String(url));
  const target = String(url);
  if (target.endsWith(".m3u8")) {
    return new Response("#EXTM3U\n#EXTINF:10,\nseg-1.ts\n#EXTINF:10,\nhttps://other-cdn.example/seg-2.ts\n", {
      headers: { "content-type": "application/vnd.apple.mpegurl" },
    });
  }
  return new Response("VIDEO", { headers: { "content-type": "video/mp2t" } });
}) as typeof fetch;

const video = (path: string) => new Request(ORIGIN + path);

test("links built by the server are accepted by both proxy paths", async () => {
  const link = buildProxyUrl("", "https://cdn.example/a/seg.ts", "https://play.example/", "video");
  assert.match(link, /[?&]sig=/);
  assert.equal((await routeGET(video(link))).status, 200);
  assert.equal((await maybeHandleFastSegment(video(link)))!.status, 200);
});

test("unsigned and forged links are rejected before anything is fetched", async () => {
  upstreamCalls.length = 0;
  const unsigned = "/api/proxy/m3u8-streaming-proxy?url=" + encodeURIComponent("https://evil.example/big.bin") + "&type=video";
  const forged = unsigned + "&sig=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  for (const path of [unsigned, forged]) {
    assert.equal((await maybeHandleFastSegment(video(path)))!.status, 403);
    assert.equal((await routeGET(video(path))).status, 403);
  }
  // Playlist and subtitle requests go through the route and must be protected too.
  assert.equal((await routeGET(video(unsigned.replace("type=video", "type=playlist")))).status, 403);
  assert.equal(upstreamCalls.length, 0, "a rejected request must never reach the network");
});

test("a signature cannot be moved to a different target or referer", async () => {
  const link = new URL(ORIGIN + buildProxyUrl("", "https://cdn.example/ok.ts", "https://play.example/", "video"));
  const retargeted = new URL(link);
  retargeted.searchParams.set("url", "https://evil.example/x");
  assert.equal((await maybeHandleFastSegment(new Request(retargeted)))!.status, 403);
  const rereferred = new URL(link);
  rereferred.searchParams.set("referer", "https://other.example/");
  assert.equal((await maybeHandleFastSegment(new Request(rereferred)))!.status, 403);
});

test("segment links rewritten into a playlist are signed and play", async () => {
  const playlistLink = buildProxyUrl("", "https://cdn.example/v/index.m3u8", "https://play.example/", "playlist");
  const body = await (await routeGET(video(playlistLink))).text();
  const segmentLines = body.split("\n").filter((line) => line && !line.startsWith("#"));
  assert.equal(segmentLines.length, 2);
  for (const line of segmentLines) {
    assert.match(line, /[?&]sig=/);
    const response = await maybeHandleFastSegment(video(line));
    assert.ok(response, "rewritten segment links take the fast path");
    assert.equal(response.status, 200, `rewritten link should verify: ${line.slice(0, 60)}`);
  }
});

test("fails closed when no secret is configured", () => {
  const params = new URLSearchParams({ url: "https://cdn.example/x.ts" });
  signProxyParams(params);
  const saved = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  try {
    assert.equal(verifyProxyParams(params), false);
    const unsignedParams = new URLSearchParams({ url: "https://cdn.example/x.ts" });
    signProxyParams(unsignedParams);
    assert.equal(unsignedParams.has("sig"), false, "nothing to sign with");
  } finally {
    process.env.AUTH_SECRET = saved;
  }
});

test("the Worker env binding is used when process.env lacks the secret", () => {
  const params = new URLSearchParams({ url: "https://cdn.example/x.ts" });
  signProxyParams(params);
  const saved = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  try {
    assert.equal(verifyProxyParams(params, { AUTH_SECRET: saved }), true);
  } finally {
    process.env.AUTH_SECRET = saved;
  }
});
