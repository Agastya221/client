import assert from "node:assert/strict";
import test from "node:test";
import { getTvMazeEpisodeMetadataRange } from "../lib/anime/api.ts";

test("TVMaze fills a long-running anime range with absolute ordered artwork", async () => {
  const originalFetch = globalThis.fetch;
  let episodeCalls = 0;

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.ani.zip") {
      return Response.json({
        titles: { en: "Long Runner" },
        mappings: { kitsu_id: 99 },
        episodes: {
          "1": { title: { en: "First" }, airDate: "1999-10-20" },
        },
      });
    }

    if (url.pathname === "/search/shows") {
      return Response.json([
        { score: 1, show: { id: 1, name: "Long Runner", type: "Scripted", premiered: "2023-01-01" } },
        { score: 0.8, show: { id: 2, name: "Long Runner", type: "Animation", language: "Japanese", premiered: "1999-10-20" } },
      ]);
    }

    if (url.pathname === "/shows/2/episodes") {
      episodeCalls += 1;
      return Response.json(Array.from({ length: 125 }, (_, index) => ({
        id: 10_000 + index,
        name: `Episode ${index + 1}`,
        season: 2000 + Math.floor(index / 25),
        number: (index % 25) + 1,
        type: "regular",
        airdate: new Date(Date.UTC(2000, 0, index + 1)).toISOString().slice(0, 10),
        image: { original: `https://static.tvmaze.com/episode-${index + 1}.jpg` },
        summary: `<p>Real summary ${index + 1}</p>`,
      })));
    }

    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    const anilistId = 987_654_323;
    const metadata = await getTvMazeEpisodeMetadataRange(anilistId, 100);

    assert.equal(metadata.length, 25);
    assert.equal(metadata[0]?.number, 101);
    assert.equal(metadata[0]?.image, "https://static.tvmaze.com/episode-101.jpg");
    assert.equal(metadata[0]?.description, "Real summary 101");
    assert.equal(metadata.at(-1)?.number, 125);

    assert.deepEqual(await getTvMazeEpisodeMetadataRange(anilistId, 100), metadata);
    assert.equal(episodeCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
