import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeWatchHistories,
  watchHistoryToList,
  type WatchHistory,
} from "../lib/anime/watch-history-shared.ts";

test("mergeWatchHistories keeps the newer episode progress and richer metadata", () => {
  const remote: WatchHistory = {
    "anime-1": {
      title: "Frieren: Beyond Journey's End",
      poster: "https://img.example/frieren.jpg",
      href: "/anime/anilist~52991",
      provider: "animekai",
      lastEpisode: 2,
      lastUpdated: 200,
      episodes: {
        "1": { progress: 1, duration: 1400, timestamp: 100 },
        "2": { progress: 0.45, duration: 1440, timestamp: 200 },
      },
    },
  };

  const local: WatchHistory = {
    "anime-1": {
      title: "Frieren",
      poster: null,
      href: "/anime/anilist~52991",
      provider: "animekai",
      lastEpisode: 2,
      lastUpdated: 350,
      episodes: {
        "2": { progress: 0.82, duration: 1440, timestamp: 350 },
      },
    },
  };

  const merged = mergeWatchHistories(remote, local);

  assert.equal(merged["anime-1"]?.title, "Frieren");
  assert.equal(merged["anime-1"]?.poster, "https://img.example/frieren.jpg");
  assert.equal(merged["anime-1"]?.lastEpisode, 2);
  assert.equal(merged["anime-1"]?.episodes["1"]?.progress, 1);
  assert.equal(merged["anime-1"]?.episodes["2"]?.progress, 0.82);
  assert.equal(merged["anime-1"]?.lastUpdated, 350);
});

test("watchHistoryToList sorts newest entries first", () => {
  const history: WatchHistory = {
    a: {
      title: "Older Anime",
      poster: null,
      href: "/anime/a",
      provider: "animekai",
      lastEpisode: 1,
      lastUpdated: 50,
      episodes: { "1": { progress: 0.4, duration: 1200, timestamp: 50 } },
    },
    b: {
      title: "Newer Anime",
      poster: null,
      href: "/anime/b",
      provider: "animekai",
      lastEpisode: 3,
      lastUpdated: 100,
      episodes: { "3": { progress: 0.9, duration: 1200, timestamp: 100 } },
    },
  };

  const list = watchHistoryToList(history);

  assert.deepEqual(
    list.map((entry) => entry.animeId),
    ["b", "a"],
  );
});
