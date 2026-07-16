import assert from "node:assert/strict";
import test from "node:test";
import { resolveStreamSource } from "../lib/anime/api.ts";

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

test("sub resolution exposes Dub when the exact episode has a real Anivexa dub route", async () => {
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
    assert.ok(result.serverOptions.some((option) =>
      option.id === "anivexa2-anikoto-hls-dub" && option.category === "dub"));
    assert.ok(result.serverOptions.some((option) =>
      option.id === "megaplay-dub" && option.category === "dub"));
    assert.ok(calls.some((url) => url.includes("/watch/anikoto/21/dub/anikoto-1")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sub resolution does not advertise Dub when every exact-episode dub probe fails", async () => {
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});
