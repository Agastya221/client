import assert from "node:assert/strict";
import test from "node:test";
import {
  bestTitleMatch,
  buildProviderOrder,
  decodeAnimeId,
  encodeAnimeId,
} from "../lib/anime/utils.ts";

test("encodeAnimeId and decodeAnimeId round-trip provider ids", () => {
  const encoded = encodeAnimeId("animekai", "frieren-beyond-journeys-end");
  const decoded = decodeAnimeId(encoded);

  assert.equal(encoded, "animekai~frieren-beyond-journeys-end");
  assert.deepEqual(decoded, {
    provider: "animekai",
    providerId: "frieren-beyond-journeys-end",
  });
});

test("buildProviderOrder prioritizes preferred and seeded providers without duplicates", () => {
  assert.deepEqual(buildProviderOrder("animekai", "hianime"), ["animekai", "hianime", "desidub"]);
  assert.deepEqual(buildProviderOrder("desidub", "desidub"), ["desidub", "hianime", "animekai"]);
});

test("bestTitleMatch chooses the closest normalized title", () => {
  const winner = bestTitleMatch("Solo Leveling", [
    { title: "Solo Levelling Season 2" },
    { title: "Solo Leveling" },
    { title: "One Piece" },
  ]);

  assert.deepEqual(winner, { title: "Solo Leveling" });
});
