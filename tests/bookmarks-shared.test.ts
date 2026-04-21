import assert from "node:assert/strict";
import test from "node:test";
import {
  bookmarksToList,
  mergeBookmarks,
  type BookmarkStore,
} from "../lib/anime/bookmarks-shared.ts";

test("mergeBookmarks keeps the newer status while preserving better metadata", () => {
  const remote: BookmarkStore = {
    "anime-1": {
      animeId: "anime-1",
      title: "Frieren: Beyond Journey's End",
      poster: "https://img.example/frieren.jpg",
      href: "/anime/anilist~52991",
      status: "WATCHING",
      lastUpdated: 100,
    },
  };

  const local: BookmarkStore = {
    "anime-1": {
      animeId: "anime-1",
      title: "Frieren",
      poster: null,
      href: "/anime/anilist~52991",
      status: "PLAN_TO_WATCH",
      lastUpdated: 200,
    },
  };

  const merged = mergeBookmarks(remote, local);

  assert.equal(merged["anime-1"]?.status, "PLAN_TO_WATCH");
  assert.equal(merged["anime-1"]?.poster, "https://img.example/frieren.jpg");
  assert.equal(merged["anime-1"]?.title, "Frieren: Beyond Journey's End");
});

test("bookmarksToList sorts newest first", () => {
  const bookmarks: BookmarkStore = {
    a: {
      animeId: "a",
      title: "Older",
      poster: null,
      href: "/anime/a",
      status: "WATCHING",
      lastUpdated: 10,
    },
    b: {
      animeId: "b",
      title: "Newer",
      poster: null,
      href: "/anime/b",
      status: "PLAN_TO_WATCH",
      lastUpdated: 20,
    },
  };

  assert.deepEqual(
    bookmarksToList(bookmarks).map((bookmark) => bookmark.animeId),
    ["b", "a"],
  );
});
