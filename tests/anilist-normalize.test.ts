import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnilistSeasonEntries,
  filterAnilistMediaByPartialTitle,
  getAnilistFranchiseSeasonEntries,
  normalizeAnilistMediaCollection,
  normalizeAnilistPageInfo,
  type AnilistDetailMedia,
  type AnilistMedia,
} from "../lib/anilist/api.ts";

function mediaFixture(id: number, year: number, format = "TV"): AnilistMedia {
  return {
    id,
    idMal: id,
    title: { romaji: `Season ${id}`, english: null, native: `Season ${id}` },
    coverImage: { extraLarge: "", large: "", medium: "", color: null },
    bannerImage: null,
    description: null,
    genres: [],
    averageScore: null,
    meanScore: null,
    popularity: 0,
    trending: 0,
    episodes: 12,
    status: "FINISHED",
    format,
    season: "SPRING",
    seasonYear: year,
    startDate: { year },
    studios: { nodes: [] },
    nextAiringEpisode: null,
    trailer: null,
    isAdult: false,
  };
}

function detailFixture(id: number, total = 10): AnilistDetailMedia {
  const detail = mediaFixture(id, 2010 + id) as AnilistDetailMedia;
  detail.characters = { nodes: [] };
  detail.recommendations = { nodes: [] };
  detail.relations = {
    edges: [
      ...(id > 1 ? [{ relationType: "PREQUEL", node: mediaFixture(id - 1, 2010 + id - 1) }] : []),
      ...(id < total ? [{ relationType: "SEQUEL", node: mediaFixture(id + 1, 2010 + id + 1) }] : []),
    ],
  };
  return detail;
}

test("normalizeAnilistMediaCollection drops null entries and repairs partial media payloads", () => {
  const media = normalizeAnilistMediaCollection([
    null,
    {
      id: 123,
      title: { english: "Test Title" },
      coverImage: { large: "https://img.example/test.jpg" },
      genres: ["Action", "", null],
      popularity: 99,
      trending: 55,
      status: "RELEASING",
      format: "TV",
      isAdult: false,
    },
  ]);

  assert.equal(media.length, 1);
  assert.equal(media[0]?.id, 123);
  assert.equal(media[0]?.title.romaji, "Test Title");
  assert.equal(media[0]?.coverImage.large, "https://img.example/test.jpg");
  assert.deepEqual(media[0]?.genres, ["Action"]);
});

test("normalizeAnilistPageInfo provides safe defaults for partial pageInfo payloads", () => {
  const pageInfo = normalizeAnilistPageInfo({ currentPage: 4, hasNextPage: true }, 4, 24);

  assert.equal(pageInfo.currentPage, 4);
  assert.equal(pageInfo.lastPage, 4);
  assert.equal(pageInfo.total, 0);
  assert.equal(pageInfo.perPage, 24);
  assert.equal(pageInfo.hasNextPage, false);
});

test("partial title matching finds short prefixes across titles and synonyms", () => {
  const vinland = mediaFixture(101348, 2019);
  vinland.title = { romaji: "Vinland Saga", english: "Vinland Saga", native: "ヴィンランド・サガ" };
  vinland.popularity = 900;

  const unrelated = mediaFixture(20, 2020);
  unrelated.title = { romaji: "Another Show", english: "Another Show", native: "Another Show" };
  unrelated.synonyms = ["Northern Adventure"];
  unrelated.popularity = 1_000;

  const synonymMatch = mediaFixture(30, 2021);
  synonymMatch.title = { romaji: "Saga Test", english: null, native: "Saga Test" };
  synonymMatch.synonyms = ["Vinsmoke Story"];
  synonymMatch.popularity = 100;

  assert.deepEqual(
    filterAnilistMediaByPartialTitle([unrelated, synonymMatch, vinland], "vin").map((media) => media.id),
    [vinland.id, synonymMatch.id],
  );
});

test("buildAnilistSeasonEntries orders the franchise, dedupes media, and excludes non-anime sources", () => {
  const current = mediaFixture(2, 2020) as AnilistDetailMedia;
  current.characters = { nodes: [] };
  current.recommendations = { nodes: [] };
  current.relations = {
    edges: [
      { relationType: "SEQUEL", node: mediaFixture(3, 2021) },
      { relationType: "PREQUEL", node: mediaFixture(1, 2019) },
      { relationType: "SIDE_STORY", node: mediaFixture(3, 2021) },
      { relationType: "SIDE_STORY", node: mediaFixture(4, 2022, "ONA") },
      { relationType: "PARENT", node: mediaFixture(5, 2023) },
      { relationType: "SOURCE", node: mediaFixture(99, 2018, "MANGA") },
    ],
  };

  const seasons = buildAnilistSeasonEntries(current);

  assert.deepEqual(seasons.map((entry) => entry.media.id), [1, 2, 3]);
  assert.equal(seasons.find((entry) => entry.media.id === 2)?.isCurrent, true);
  assert.equal(seasons.find((entry) => entry.media.id === 3)?.relationType, "SEQUEL");
});

test("getAnilistFranchiseSeasonEntries traverses a cached ten-season chain", async () => {
  const details = new Map(Array.from({ length: 10 }, (_, index) => {
    const detail = detailFixture(index + 1);
    return [detail.id, detail] as const;
  }));

  const seasons = await getAnilistFranchiseSeasonEntries(details.get(5)!, {
    maxMainlineEntries: 10,
    loadDetail: async (id) => {
      const detail = details.get(id);
      if (!detail) throw new Error(`Missing fixture ${id}`);
      return detail;
    },
  });

  assert.deepEqual(seasons.map((entry) => entry.media.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(seasons.find((entry) => entry.media.id === 5)?.isCurrent, true);
});
