import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAiringCountdown,
  resolveNextAiringEpisode,
} from "../lib/anime/airing";

test("airing anime resolves its upcoming AniList episode", () => {
  const fallback = { episode: 5, airingAt: 1_700_000_000 };

  assert.deepEqual(resolveNextAiringEpisode("RELEASING", null, fallback), fallback);
  assert.deepEqual(resolveNextAiringEpisode("Currently Airing", fallback, null), fallback);
});

test("finished anime keeps the existing next-episode path", () => {
  assert.equal(
    resolveNextAiringEpisode("FINISHED", { episode: 13, airingAt: 1_700_000_000 }, null),
    null,
  );
});

test("airing countdown stays compact", () => {
  const nowMs = 1_700_000_000_000;

  assert.equal(formatAiringCountdown(1_700_237_600, nowMs), "2d 18h");
  assert.equal(formatAiringCountdown(1_700_018_300, nowMs), "5h 5m");
  assert.equal(formatAiringCountdown(1_700_000_120, nowMs), "2m");
  assert.equal(formatAiringCountdown(1_699_999_999, nowMs), "airing now");
});
