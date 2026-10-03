import assert from "node:assert/strict";
import test from "node:test";
import {
  formatReleaseSchedule,
  isUnreleasedStatus,
  resolveNotAiredEpisode,
  resolveReleaseSchedule,
} from "../lib/anime/release-schedule";

const edgerunners2 = {
  status: "NOT_YET_RELEASED",
  nextAiringEpisode: { episode: 1, airingAt: 1_792_479_600 },
  startDate: { year: 2026, month: 10, day: 20 },
};

test("unreleased statuses are recognised", () => {
  assert.equal(isUnreleasedStatus("NOT_YET_RELEASED"), true);
  assert.equal(isUnreleasedStatus("Upcoming"), true);
  assert.equal(isUnreleasedStatus("Not yet released"), true);
  assert.equal(isUnreleasedStatus("RELEASING"), false);
  assert.equal(isUnreleasedStatus(null), false);
});

test("release schedule prefers the exact broadcast slot", () => {
  assert.deepEqual(
    resolveReleaseSchedule({ nextAiringEpisode: edgerunners2.nextAiringEpisode, startDate: edgerunners2.startDate }),
    { kind: "exact", airingAt: 1_792_479_600 },
  );
});

test("release schedule falls back through day, month, year, unknown", () => {
  assert.deepEqual(resolveReleaseSchedule({ startDate: { year: 2026, month: 10, day: 20 } }), {
    kind: "day", year: 2026, month: 10, day: 20,
  });
  assert.deepEqual(resolveReleaseSchedule({ startDate: { year: 2027, month: 4 } }), { kind: "month", year: 2027, month: 4 });
  assert.deepEqual(resolveReleaseSchedule({ startDate: { year: 2027 } }), { kind: "year", year: 2027 });
  assert.deepEqual(resolveReleaseSchedule({ startDate: { year: null } }), { kind: "unknown" });
  // The premiere date says nothing about later episodes.
  assert.deepEqual(resolveReleaseSchedule({ episodeNumber: 3, startDate: { year: 2027, month: 4 } }), { kind: "unknown" });
});

test("release schedule reads an episode air date", () => {
  assert.deepEqual(resolveReleaseSchedule({ episodeNumber: 4, airDate: "2026-10-27" }), {
    kind: "day", year: 2026, month: 10, day: 27,
  });
  assert.deepEqual(resolveReleaseSchedule({ episodeNumber: 4, airDate: "2026-10-27T15:00:00Z" }), {
    kind: "exact", airingAt: Date.UTC(2026, 9, 27, 15) / 1000,
  });
});

test("unreleased title with no stream is a not-aired state", () => {
  const state = resolveNotAiredEpisode({
    episodeNumber: 1,
    hasSource: false,
    status: edgerunners2.status,
    message: "This episode has not aired yet.",
    nextAiringEpisode: edgerunners2.nextAiringEpisode,
    startDate: edgerunners2.startDate,
  });
  assert.deepEqual(state, {
    episodeNumber: 1,
    schedule: { kind: "exact", airingAt: 1_792_479_600 },
    latestAiredEpisode: null,
  });
});

test("an airing show's future episode points back at the latest aired one", () => {
  const state = resolveNotAiredEpisode({
    episodeNumber: 8,
    hasSource: false,
    status: "RELEASING",
    nextAiringEpisode: { episode: 8, airingAt: 1_800_000_000 },
    subCount: 7,
  });
  assert.equal(state?.latestAiredEpisode, 7);
  assert.deepEqual(state?.schedule, { kind: "exact", airingAt: 1_800_000_000 });

  const further = resolveNotAiredEpisode({
    episodeNumber: 10,
    hasSource: false,
    status: "RELEASING",
    nextAiringEpisode: { episode: 8, airingAt: 1_800_000_000 },
  });
  assert.equal(further?.latestAiredEpisode, 7);
  assert.deepEqual(further?.schedule, { kind: "unknown" });
});

test("server message alone is enough", () => {
  const state = resolveNotAiredEpisode({
    episodeNumber: 13,
    hasSource: false,
    status: "RELEASING",
    message: "This episode has not aired yet.",
    subCount: 12,
  });
  assert.equal(state?.latestAiredEpisode, 12);
});

test("ordinary stream failures and playable episodes are not not-aired", () => {
  assert.equal(resolveNotAiredEpisode({
    episodeNumber: 3,
    hasSource: false,
    status: "RELEASING",
    nextAiringEpisode: { episode: 8, airingAt: 1_800_000_000 },
    message: "All servers failed",
  }), null);
  assert.equal(resolveNotAiredEpisode({
    episodeNumber: 8,
    hasSource: true,
    status: "RELEASING",
    nextAiringEpisode: { episode: 8, airingAt: 1_800_000_000 },
  }), null);
  assert.equal(resolveNotAiredEpisode({ episodeNumber: 1, hasSource: false, status: "FINISHED" }), null);
});

test("calendar labels do not shift with the time zone", () => {
  assert.equal(formatReleaseSchedule({ kind: "day", year: 2026, month: 10, day: 20 }, "en-US"), "Oct 20, 2026");
  assert.equal(formatReleaseSchedule({ kind: "month", year: 2027, month: 4 }), "April 2027");
  assert.equal(formatReleaseSchedule({ kind: "year", year: 2027 }), "2027");
  assert.equal(formatReleaseSchedule({ kind: "unknown" }), "");
});
