import assert from "node:assert/strict";
import test from "node:test";
import { getFallbackWatchTargets, normalizeProviderParam } from "../lib/anime/fallback.ts";
import type { WatchSessionModel } from "../lib/anime/types.ts";

function createSession(overrides: Partial<WatchSessionModel> = {}): WatchSessionModel {
  return {
    anime: {
      id: "hianime~solo-leveling-100",
      provider: "hianime",
      providerId: "solo-leveling-100",
      href: "/anime/hianime~solo-leveling-100",
      title: "Solo Leveling",
      genres: ["Action"],
      providerIds: {
        hianime: "solo-leveling-100",
        animekai: "solo-leveling-kai",
        desidub: "solo-leveling-dub",
      },
    },
    episode: {
      number: 3,
      title: "Episode 3",
      idByProvider: {
        hianime: "hid-3",
        animekai: "ak-3",
        desidub: "dd-3",
      },
      availableProviders: ["hianime", "animekai", "desidub"],
    },
    episodes: [],
    provider: "hianime",
    availableProviders: ["hianime", "animekai", "desidub"],
    attempts: [],
    watchAttempts: [],
    source: {
      kind: "video",
      label: "HD-1",
      url: "https://video.example/playlist.m3u8",
      proxiedUrl: "https://api.example/api/proxy/m3u8-streaming-proxy?url=test",
      iframeUrl: null,
      isM3U8: true,
      requiresProxy: true,
    },
    subtitles: [],
    serverOptions: [
      { id: "HD-1", label: "HD-1", provider: "hianime", category: "sub" },
      { id: "HD-2", label: "HD-2", provider: "hianime", category: "sub" },
      { id: "HD-3", label: "HD-3", provider: "hianime", category: "sub" },
    ],
    activeServerId: "HD-1",
    dubbed: false,
    fallbackHistory: [],
    ...overrides,
  };
}

test("getFallbackWatchTargets tries same-provider servers before provider switches", () => {
  const targets = getFallbackWatchTargets(createSession());

  assert.deepEqual(targets, [
    { provider: "hianime", server: "HD-2", reason: "Retry HD-2" },
    { provider: "hianime", server: "HD-3", reason: "Retry HD-3" },
    { provider: "animekai", reason: "Switch to animekai" },
    { provider: "desidub", reason: "Switch to desidub" },
  ]);
});

test("getFallbackWatchTargets skips the active server and unavailable providers", () => {
  const targets = getFallbackWatchTargets(
    createSession({
      availableProviders: ["hianime", "animekai"],
      serverOptions: [{ id: "HD-1", label: "HD-1", provider: "hianime" }],
    }),
  );

  assert.deepEqual(targets, [{ provider: "animekai", reason: "Switch to animekai" }]);
});

test("normalizeProviderParam only accepts supported providers", () => {
  assert.equal(normalizeProviderParam("hianime"), "hianime");
  assert.equal(normalizeProviderParam("animekai"), "animekai");
  assert.equal(normalizeProviderParam("manga"), null);
  assert.equal(normalizeProviderParam(""), null);
});
