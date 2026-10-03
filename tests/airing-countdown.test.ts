import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAiringCountdown,
  resolveAiringCardState,
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

test("airing card never says 'airing now left' and hides stale schedules", () => {
  const airingAt = 1_700_000_000;
  const airingMs = airingAt * 1000;

  assert.deepEqual(resolveAiringCardState(airingAt, 0), { kind: "pending" });
  assert.deepEqual(resolveAiringCardState(airingAt, airingMs - 9_000_000), {
    kind: "upcoming",
    badge: "2h 30m left",
  });
  assert.deepEqual(resolveAiringCardState(airingAt, airingMs), { kind: "aired", badge: "Should be out" });
  assert.deepEqual(resolveAiringCardState(airingAt, airingMs + 90 * 60_000), {
    kind: "aired",
    badge: "Should be out",
  });
  assert.deepEqual(resolveAiringCardState(airingAt, airingMs + 2 * 24 * 3_600_000), { kind: "hidden" });
  for (const offset of [0, 1, 60_000, 7_200_000, 9_000_000]) {
    const state = resolveAiringCardState(airingAt, airingMs + offset);
    assert.ok(!("badge" in state) || !/airing now left/i.test(state.badge));
  }
});
