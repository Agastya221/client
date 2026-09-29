import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ANIVEXA_WORKER_URL,
  LOCAL_ANIME_API_BASE_URL,
  PRODUCTION_ANIME_API_BASE_URL,
  classifyAnivexaStreamSubType,
  knownEpisodeCountForNavigation,
  preferEnglishSubtitleDefault,
  resolveAnivexaWorkerUrl,
  resolveAnimeApiBaseUrl,
} from "../lib/anime/api.ts";

test("resolveAnivexaWorkerUrl has a production-safe worker fallback", () => {
  assert.equal(resolveAnivexaWorkerUrl({}), DEFAULT_ANIVEXA_WORKER_URL);
  assert.equal(
    resolveAnivexaWorkerUrl({ NEXT_PUBLIC_ANIVEXA_WORKER_URL: "https://worker.example.com///" }),
    "https://worker.example.com",
  );
});

test("resolveAnimeApiBaseUrl prefers an explicit server-side env var", () => {
  assert.equal(
    resolveAnimeApiBaseUrl({
      NODE_ENV: "production",
      ANIME_API_BASE_URL: "https://backend.example.com///",
    }),
    "https://backend.example.com",
  );
});

test("resolveAnimeApiBaseUrl accepts the public env var when needed", () => {
  assert.equal(
    resolveAnimeApiBaseUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_ANIME_API_BASE_URL: "https://public-backend.example.com/",
    }),
    "https://public-backend.example.com",
  );
});

test("resolveAnimeApiBaseUrl uses environment-aware fallbacks", () => {
  assert.equal(resolveAnimeApiBaseUrl({ NODE_ENV: "development" }), LOCAL_ANIME_API_BASE_URL);
  assert.equal(resolveAnimeApiBaseUrl({ NODE_ENV: "test" }), LOCAL_ANIME_API_BASE_URL);
  assert.equal(resolveAnimeApiBaseUrl({ NODE_ENV: "production" }), PRODUCTION_ANIME_API_BASE_URL);
  assert.equal(
    resolveAnimeApiBaseUrl({ NODE_ENV: "staging" } as unknown as NodeJS.ProcessEnv),
    PRODUCTION_ANIME_API_BASE_URL,
  );
});

test("Prism classification follows the selected stream subtitle URL", () => {
  const burnedIn = {
    url: "https://cdn.example.com/master.m3u8",
    referer: "https://player.example.com/embed/hard",
  };
  const softSub = {
    url: "https://cdn.example.com/master.m3u8",
    referer: "https://player.example.com/embed/soft?sub=https%3A%2F%2Fsubs.example.com%2Fshow_eng.vtt",
  };

  assert.equal(classifyAnivexaStreamSubType("anineko", burnedIn), "hard");
  assert.equal(classifyAnivexaStreamSubType("anineko", softSub), "soft");
  assert.equal(classifyAnivexaStreamSubType("animegg", softSub), "hard");
  assert.equal(classifyAnivexaStreamSubType("aniwaves", { server: "Vidplay" }), "hard");
  assert.equal(classifyAnivexaStreamSubType("aniwaves", { server: "MyCloud" }), "unknown");
});

test("subtitle defaults prefer exactly one English track", () => {
  const tracks = preferEnglishSubtitleDefault([
    { label: "Spanish", lang: "es", url: "https://subs.example.com/es.vtt", isDefault: true },
    { label: "English", lang: "en", url: "https://subs.example.com/en.vtt", isDefault: false },
    { label: "English 2", lang: "en-2", url: "https://subs.example.com/en-2.vtt", isDefault: false },
  ]);

  assert.deepEqual(tracks.map((track) => track.isDefault), [false, true, false]);
});

test("navigation count falls back to aired totals for long-running anime", () => {
  assert.equal(knownEpisodeCountForNavigation({ episodeCount: null, subCount: 1169, dubCount: null }), 1169);
  assert.equal(knownEpisodeCountForNavigation({ episodeCount: 12, subCount: 10, dubCount: 8 }), 12);
  assert.equal(knownEpisodeCountForNavigation({ episodeCount: 3000, subCount: null, dubCount: null }), 2000);
});
