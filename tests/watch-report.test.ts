import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/watch/report/route";
import {
  affectsPlaybackCache,
  isWatchReportIssue,
} from "../lib/anime/watch-report";

test("watch report validation accepts known issue types", () => {
  assert.equal(isWatchReportIssue("episode_not_playing"), true);
  assert.equal(isWatchReportIssue("anything_else"), false);
  assert.equal(affectsPlaybackCache(["episode_not_playing"]), true);
  assert.equal(affectsPlaybackCache(["wrong_show"]), false);
});

test("watch reports no longer depend on an AniList ID or retired backend", async () => {
  const response = await POST(new Request("http://localhost/api/watch/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      animeId: "animekai~test-show",
      animeTitle: "Test Show",
      episodeNumber: 3,
      provider: "animekai",
      issues: ["episode_not_playing"],
      notes: "The selected server stays black.",
    }),
  }));
  const payload = await response.json() as {
    success?: boolean;
    reportId?: string;
    cacheInvalidated?: boolean;
  };

  assert.equal(response.status, 201);
  assert.equal(payload.success, true);
  assert.equal(typeof payload.reportId, "string");
  assert.equal(payload.cacheInvalidated, true);
});

test("watch reports require an issue selection", async () => {
  const response = await POST(new Request("http://localhost/api/watch/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      animeId: "anilist~1",
      episodeNumber: 1,
      issues: [],
    }),
  }));

  assert.equal(response.status, 400);
});
