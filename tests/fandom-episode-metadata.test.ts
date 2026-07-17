import assert from "node:assert/strict";
import test from "node:test";
import { getFandomEpisodeMetadataRange } from "../lib/anime/api.ts";

test("One Piece Fandom fills catalog artwork gaps with separate original and rail thumbnails", async () => {
  const originalFetch = globalThis.fetch;
  let fandomCalls = 0;

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.ani.zip") {
      return Response.json({
        titles: { en: "One Piece" },
        episodes: { "1140": { title: { en: "Episode 1140" }, airDate: "2025-08-17" } },
      });
    }
    if (url.hostname === "onepiece.fandom.com") {
      fandomCalls += 1;
      return Response.json({
        query: {
          pages: {
            "1140": {
              title: "Episode 1140",
              original: { source: "https://static.wikia.nocookie.net/original-1140.png" },
              thumbnail: { source: "https://static.wikia.nocookie.net/thumb-1140.png" },
            },
          },
        },
      });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    const metadata = await getFandomEpisodeMetadataRange(987_654_324, 1100);
    const episode = metadata.find((entry) => entry.number === 1140);
    assert.equal(episode?.image, "https://static.wikia.nocookie.net/original-1140.png");
    assert.equal(episode?.thumbnail, "https://static.wikia.nocookie.net/thumb-1140.png");
    assert.equal(fandomCalls, 2);

    await getFandomEpisodeMetadataRange(987_654_324, 1100);
    assert.equal(fandomCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
