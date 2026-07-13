import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ANIVEXA_WORKER_URL,
  LOCAL_ANIME_API_BASE_URL,
  PRODUCTION_ANIME_API_BASE_URL,
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
