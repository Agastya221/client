import assert from "node:assert/strict";
import test from "node:test";
import { GET as routeGET } from "../app/api/proxy/m3u8-streaming-proxy/route.ts";
import { maybeHandleFastSegment } from "../lib/proxy/fast-segment.ts";
import { signProxyParams } from "../lib/proxy/signature.ts";

process.env.AUTH_SECRET = "test-secret-for-proxy-signatures";

/** Signs a proxy URL the way the server does when it hands one out. */
function signed(raw: string): string {
  const u = new URL(raw);
  signProxyParams(u.searchParams);
  return u.toString();
}

// Differential test: the fast path must give exactly what the Next.js route gives.

type Upstream = { status: number; body?: string; headers?: Record<string, string> } | "throw";

function stubFetch(sequence: Upstream[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let index = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    const step = sequence[Math.min(index++, sequence.length - 1)];
    if (step === "throw") throw new Error("network down");
    return new Response(step.body ?? "", { status: step.status, headers: step.headers });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

async function snapshot(response: Response) {
  const headers = Object.fromEntries([...response.headers.entries()].sort());
  return { status: response.status, headers, body: await response.text() };
}

async function compare(url: string, upstream: Upstream[], requestHeaders: Record<string, string> = {}) {
  const make = () => new Request(url, { headers: requestHeaders });

  const route = stubFetch(upstream);
  const fromRoute = await snapshot(await routeGET(make()));
  route.restore();

  const fast = stubFetch(upstream);
  const handled = maybeHandleFastSegment(make());
  assert.ok(handled, "fast path should take this request");
  const fromFast = await snapshot(await handled);
  fast.restore();

  assert.deepEqual(fromFast, fromRoute);
  assert.deepEqual(fast.calls, route.calls, "upstream requests must match too");
  return fromFast;
}

const BASE = "https://site.example/api/proxy/m3u8-streaming-proxy";
const seg = (target: string, extra = "") =>
  signed(`${BASE}?url=${encodeURIComponent(target)}&referer=${encodeURIComponent("https://play.example/")}&type=video${extra}`);

test("a normal .ts segment matches the route exactly (headers, body, upstream call)", async () => {
  const out = await compare(seg("https://cdn.example/a/seg-001.ts", "&as_ts=1"), [
    { status: 200, body: "TSDATA", headers: { "content-type": "application/octet-stream", "content-length": "6" } },
  ]);
  assert.equal(out.headers["content-type"], "video/mp2t");
  assert.equal(out.body, "TSDATA");
});

test("extension-less CDN segment (as seen live) matches", async () => {
  await compare(seg("https://cdn.example/cdn/092e3d2d14736a0ad538", "&as_ts=1"), [
    { status: 200, body: "X", headers: { "content-type": "image/jpeg" } },
  ]);
});

test("range requests are forwarded and marked no-store, same as the route", async () => {
  const out = await compare(
    seg("https://cdn.example/v.mp4"),
    [{ status: 206, body: "PART", headers: { "content-type": "video/mp4", "content-range": "bytes 0-3/100", "accept-ranges": "bytes" } }],
    { range: "bytes=0-3" },
  );
  assert.equal(out.status, 206);
  assert.equal(out.headers["cache-control"], "no-store");
});

test("AES key files (.key are tagged type=video) match", async () => {
  await compare(seg("https://cdn.example/k/enc.key"), [{ status: 200, body: "0123456789abcdef" }]);
});

test("upstream 404 matches", async () => {
  await compare(seg("https://cdn.example/missing.ts", "&as_ts=1"), [{ status: 404, body: "nope" }]);
});

test("upstream 502 then success retries once, same as the route", async () => {
  await compare(seg("https://cdn.example/flaky.ts", "&as_ts=1"), [
    { status: 502 },
    { status: 200, body: "OK", headers: { "content-type": "video/mp2t" } },
  ]);
});

test("network failure matches the route's 500", async () => {
  await compare(seg("https://cdn.example/x.ts", "&as_ts=1"), ["throw"]);
});

test("bad and missing target urls match", async () => {
  await compare(`${BASE}?type=video`, [{ status: 200 }]);
  await compare(signed(`${BASE}?url=${encodeURIComponent("ftp://evil.example/x")}&type=video`), [{ status: 200 }]);
  await compare(signed(`${BASE}?url=not-a-url&type=video`), [{ status: 200 }]);
});

test("falls through to Next for everything the fast path must not handle", () => {
  const no = (url: string, method = "GET") => maybeHandleFastSegment(new Request(url, { method }));
  assert.equal(no(`${BASE}?url=x&type=playlist`), null, "playlists need rewriting");
  assert.equal(no(`${BASE}?url=x`), null, "untyped requests may be playlists or subtitles");
  assert.equal(no(`${BASE}?url=x&type=video&unwrap=flix-segment`), null, "FlixCloud segments need decoding");
  assert.equal(no(`${BASE}?url=x&type=video`, "OPTIONS"), null);
  assert.equal(no(`${BASE}?url=x&type=video`, "HEAD"), null);
  assert.equal(no(`https://site.example/api/proxy/dash?url=x&type=video`), null);
  assert.equal(no(`https://site.example/anime/anilist~1/watch?type=video`), null);
});
