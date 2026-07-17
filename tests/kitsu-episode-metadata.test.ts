import assert from "node:assert/strict";
import test from "node:test";
import { getKitsuEpisodeMetadataRange } from "../lib/anime/api.ts";

test("Kitsu fills one cached 100-episode artwork range for long-running anime", async () => {
  const originalFetch = globalThis.fetch;
  let mappingCalls = 0;
  let kitsuCalls = 0;

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.ani.zip") {
      mappingCalls += 1;
      return Response.json({
        mappings: { kitsu_id: 12 },
        episodes: {
          "101": { title: { en: "Episode 101" }, airdate: "2001-01-01" },
        },
      });
    }

    if (url.hostname === "kitsu.io") {
      kitsuCalls += 1;
      const offset = Number(url.searchParams.get("page[offset]") || 0);
      return Response.json({
        data: Array.from({ length: 20 }, (_, index) => {
          const number = offset + index + 1;
          return {
            attributes: {
              number,
              canonicalTitle: `Kitsu episode ${number}`,
              thumbnail: { original: `https://media.kitsu.app/episodes/${number}.jpg` },
              airdate: "2001-01-01",
            },
          };
        }),
      });
    }

    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    const anilistId = 987_654_322;
    const metadata = await getKitsuEpisodeMetadataRange(anilistId, 100);

    assert.equal(metadata.length, 100);
    assert.equal(metadata[0]?.number, 101);
    assert.equal(metadata[0]?.image, "https://media.kitsu.app/episodes/101.jpg");
    assert.equal(metadata.at(-1)?.number, 200);
    assert.equal(mappingCalls, 1);
    assert.equal(kitsuCalls, 5);

    assert.deepEqual(await getKitsuEpisodeMetadataRange(anilistId, 100), metadata);
    assert.equal(mappingCalls, 1);
    assert.equal(kitsuCalls, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
