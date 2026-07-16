import assert from "node:assert/strict";
import test from "node:test";
import { getAniZipEpisodeMetadata } from "../lib/anime/api.ts";

test("AniZip metadata retries empty responses and caches the first valid payload", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    const payload = calls === 1
      ? { episodes: {} }
      : {
          episodes: {
            "1": {
              title: { en: "Romance Dawn" },
              image: "https://artworks.example/one-piece-1.jpg",
            },
          },
        };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const anilistId = 987_654_321;
    assert.deepEqual(await getAniZipEpisodeMetadata(anilistId), []);

    const recovered = await getAniZipEpisodeMetadata(anilistId);
    assert.equal(recovered[0]?.title, "Romance Dawn");
    assert.equal(recovered[0]?.image, "https://artworks.example/one-piece-1.jpg");

    const cached = await getAniZipEpisodeMetadata(anilistId);
    assert.deepEqual(cached, recovered);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
