import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogAvailabilityForMedia } from "../lib/anilist/availability.ts";
import type { AnilistMedia } from "../lib/anilist/api.ts";

test("getCatalogAvailabilityForMedia calculates latest episode for RELEASING media", async () => {
  const mockMedia: AnilistMedia[] = [
    {
      id: 12345,
      status: "RELEASING",
      nextAiringEpisode: { episode: 5, airingAt: 1700000000 },
      coverImage: { extraLarge: "", large: "", medium: "", color: null },
      bannerImage: null,
      description: null,
      genres: [],
      averageScore: null,
      meanScore: null,
      popularity: 100,
      trending: 50,
      episodes: 12,
      format: "TV",
      season: null,
      seasonYear: null,
      startDate: { year: null },
      studios: { nodes: [] },
      trailer: null,
      isAdult: false,
    },
    {
      id: 67890,
      status: "FINISHED",
      nextAiringEpisode: null,
      coverImage: { extraLarge: "", large: "", medium: "", color: null },
      bannerImage: null,
      description: null,
      genres: [],
      averageScore: null,
      meanScore: null,
      popularity: 100,
      trending: 50,
      episodes: 12,
      format: "TV",
      season: null,
      seasonYear: null,
      startDate: { year: null },
      studios: { nodes: [] },
      trailer: null,
      isAdult: false,
    },
  ];

  const results = await getCatalogAvailabilityForMedia(mockMedia);

  // Releasing media with next episode 5 should target episode 4
  assert.equal(results[12345].watchHref, "/anime/anilist~12345/watch?ep=4");

  // Finished media should target episode 1
  assert.equal(results[67890].watchHref, "/anime/anilist~67890/watch?ep=1");
});

test("language fallback helper simulation logic", () => {
  const mockEpisodes = [
    { number: 1, isSubbed: true, isDubbed: true },
    { number: 2, isSubbed: true, isDubbed: true },
    { number: 3, isSubbed: true, isDubbed: false },
    { number: 4, isSubbed: true, isDubbed: false },
  ];

  const simulateFilter = (episodes: typeof mockEpisodes | any[], dubbed: boolean) => {
    const hasLanguageInfo = episodes.some(
      (ep) => ep.isSubbed !== undefined || ep.isDubbed !== undefined
    );
    return episodes.filter((ep) => {
      if (!hasLanguageInfo) return true;
      if (dubbed) return ep.isDubbed ?? false;
      return ep.isSubbed ?? true;
    });
  };

  const getFallbackEpisodeForLanguage = (episodes: any[], targetDubbed: boolean, currentEpNum: number) => {
    const targetEpisodes = simulateFilter(episodes, targetDubbed);
    if (targetEpisodes.length === 0) return currentEpNum;
    const exactMatch = targetEpisodes.find((ep) => ep.number === currentEpNum);
    if (exactMatch) return currentEpNum;
    const closest = [...targetEpisodes].reverse().find((ep) => ep.number <= currentEpNum);
    return closest ? closest.number : targetEpisodes[0].number;
  };

  // Switch to Dub on episode 4 (which has no Dub) -> should fallback to the closest dubbed episode (Episode 2)
  assert.equal(getFallbackEpisodeForLanguage(mockEpisodes, true, 4), 2);

  // Switch to Dub on episode 2 (which has Dub) -> should target Episode 2
  assert.equal(getFallbackEpisodeForLanguage(mockEpisodes, true, 2), 2);

  // Switch to Sub on episode 2 (which has Sub) -> should target Episode 2
  assert.equal(getFallbackEpisodeForLanguage(mockEpisodes, false, 2), 2);

  // Simulation with no language info (both undefined)
  const legacyEpisodes = [
    { number: 1, title: "Ep 1" },
    { number: 2, title: "Ep 2" },
  ];
  // Should show all episodes for both sub and dub
  assert.equal(simulateFilter(legacyEpisodes, false).length, 2);
  assert.equal(simulateFilter(legacyEpisodes, true).length, 2);
  assert.equal(getFallbackEpisodeForLanguage(legacyEpisodes, true, 2), 2);
});
