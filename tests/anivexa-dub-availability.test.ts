import assert from "node:assert/strict";
import test from "node:test";
import { discoverAnivexaProviderServerOptions, resolveStreamSource } from "../lib/anime/api.ts";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function anivexaPayload(audio: "sub" | "dub", suffix: string) {
  return {
    [audio === "dub" ? "sdub" : "ssub"]: {
      streams: [{
        url: `https://video.example/${suffix}/master.m3u8`,
        type: "hls",
        referer: "https://megaplay.buzz/",
        server: "Megaplay",
      }],
      subtitles: audio === "sub"
        ? [{ file: `https://subs.example/${suffix}.vtt`, language: "en" }]
        : [],
    },
  };
}

test("dub discovery finds a real episode route without delaying sub resolution", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.includes("/watch/anikoto/21/sub/anikoto-1")) {
      return jsonResponse(anivexaPayload("sub", "one-piece-sub"));
    }
    if (url.includes("/watch/anikoto/21/dub/anikoto-1")) {
      return jsonResponse(anivexaPayload("dub", "one-piece-dub"));
    }
    if (url.includes("/watch/")) return jsonResponse({ error: "not available" }, 404);
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const result = await resolveStreamSource({
      animeId: "anilist~21",
      episodeNumber: 1,
      provider: "anikoto",
      dubbed: false,
    });

    assert.ok(result.source);
    assert.equal(result.serverOptions.some((option) => option.category === "dub"), false);
    assert.equal(calls.some((url) => url.includes("/watch/anikoto/21/dub/anikoto-1")), false);

    const dubOptions = await discoverAnivexaProviderServerOptions({
      anilistId: 21,
      episodeNumber: 1,
      dubbed: true,
      uiProvider: "anikoto",
      workerProvider: "anikoto",
    });
    assert.ok(dubOptions.some((option) =>
      option.id === "anivexa2-anikoto-hls-dub" && option.category === "dub"));
    assert.ok(calls.some((url) => url.includes("/watch/anikoto/21/dub/anikoto-1")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dub discovery returns no options when the exact episode route fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/watch/anikoto/991002/sub/anikoto-1")) {
      return jsonResponse(anivexaPayload("sub", "sub-only"));
    }
    if (url.includes("/watch/")) return jsonResponse({ error: "not available" }, 404);
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const result = await resolveStreamSource({
      animeId: "anilist~991002",
      episodeNumber: 1,
      provider: "anikoto",
      dubbed: false,
    });

    assert.ok(result.source);
    assert.equal(result.serverOptions.some((option) => option.category === "dub"), false);
    const dubOptions = await discoverAnivexaProviderServerOptions({
      anilistId: 991002,
      episodeNumber: 1,
      dubbed: true,
      uiProvider: "anikoto",
      workerProvider: "anikoto",
    });
    assert.deepEqual(dubOptions, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
