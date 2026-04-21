import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAnilistMediaCollection,
  normalizeAnilistPageInfo,
} from "../lib/anilist/api.ts";

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
