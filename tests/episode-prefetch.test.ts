import assert from "node:assert/strict";
import test from "node:test";
import { latestAiredEpisode, pickPrefetchWindow, prefetchMissKey } from "../lib/episode-prefetch.ts";

const now = 1_800_000_000;

test("the latest aired episode comes from the next one on the schedule", () => {
  assert.equal(latestAiredEpisode({ id: 1, status: "RELEASING", nextAiringEpisode: { episode: 5, airingAt: now + 3600 } }, now), 4);
  assert.equal(latestAiredEpisode({ id: 1, status: "RELEASING", nextAiringEpisode: { episode: 5, airingAt: now - 60 } }, now), 5, "AniList not updated yet");
  assert.equal(latestAiredEpisode({ id: 1, status: "RELEASING", nextAiringEpisode: { episode: 1, airingAt: now + 60 } }, now), null, "nothing aired yet");
  assert.equal(latestAiredEpisode({ id: 1, status: "RELEASING", nextAiringEpisode: null }, now), null, "unknown");
  assert.equal(latestAiredEpisode({ id: 1, status: "FINISHED", episodes: 12 }, now), 12);
});

test("each run takes the next part of the list and the whole list is covered", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  const seen = new Set<number>();
  for (let run = 0; run < 3; run++) for (const item of pickPrefetchWindow(items, run * 600_000, 10)) seen.add(item);
  assert.equal(seen.size, 23);
  assert.deepEqual(pickPrefetchWindow([], 0, 10), []);
  assert.equal(pickPrefetchWindow([1, 2], 0, 10).length, 2);
});

test("miss markers are valid store keys", () => {
  const key = prefetchMissKey("anilist~21", 1100);
  assert.ok(key.startsWith("stream-link:") && !/[\s*?[\]\\]/.test(key));
});
