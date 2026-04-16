import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_ANIME_API_BASE_URL,
  PRODUCTION_ANIME_API_BASE_URL,
  resolveAnimeApiBaseUrl,
} from "../lib/anime/api.ts";

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
  assert.equal(resolveAnimeApiBaseUrl({ NODE_ENV: "staging" }), PRODUCTION_ANIME_API_BASE_URL);
});
