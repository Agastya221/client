import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/player/skip-times/route.ts";
import { fetchSkipTimes } from "../lib/player/aniskip.ts";

test("AniSkip client waits for duration and deduplicates a valid lookup", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response(JSON.stringify({
      op: { start: 58, end: 147 },
      ed: null,
      recap: null,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    assert.deepEqual(
      await fetchSkipTimes(999_901, 1, 0),
      { op: null, ed: null, recap: null },
    );
    assert.equal(requests, 0);

    const [first, second] = await Promise.all([
      fetchSkipTimes(999_901, 1, 1420),
      fetchSkipTimes(999_901, 1, 1420),
    ]);
    assert.deepEqual(first.op, { start: 58, end: 147 });
    assert.deepEqual(second, first);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skip-time route sends duration and normalizes community timestamps", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  globalThis.fetch = (async (input) => {
    upstreamUrl = String(input);
    return new Response(JSON.stringify({
      found: true,
      results: [
        {
          interval: { startTime: 58, endTime: 147 },
          skipType: "op",
        },
        {
          interval: { startTime: 1325, endTime: 1415 },
          skipType: "ed",
        },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await GET(new NextRequest(
      "http://localhost/api/player/skip-times?malId=999902&episode=2&duration=1422",
    ));
    assert.equal(response.status, 200);
    assert.match(upstreamUrl, /episodeLength=1420/);
    assert.deepEqual(await response.json(), {
      op: { start: 58, end: 147 },
      ed: { start: 1325, end: 1415 },
      recap: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
