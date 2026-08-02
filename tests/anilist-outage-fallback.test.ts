import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnilistSeasonal,
  getAnilistTrending,
  searchAnilist,
} from "../lib/anilist/api";

test("catalog lists remain renderable when AniList and Jikan are both unavailable", async () => {
  const originalFetch = globalThis.fetch;
  let anilistCalls = 0;
  let jikanCalls = 0;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("graphql.anilist.co")) {
      anilistCalls += 1;
      return new Response(JSON.stringify({
        errors: [{
          message: "The AniList API has been temporarily disabled due to severe stability issues.",
          status: 403,
        }],
      }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    if (url.includes("api.jikan.moe")) {
      jikanCalls += 1;
      return new Response("Gateway Timeout", { status: 504 });
    }

    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const uniqueSize = 900 + Math.floor(Math.random() * 50);
    const trending = await getAnilistTrending(uniqueSize);
    const seasonal = await getAnilistSeasonal(uniqueSize + 1);
    const search = await searchAnilist({
      search: `outage-${Date.now()}-${Math.random()}`,
      perPage: uniqueSize + 2,
    });

    assert.deepEqual(trending, []);
    assert.deepEqual(seasonal, []);
    assert.deepEqual(search.media, []);
    assert.equal(search.pageInfo.total, 0);
    assert.equal(search.pageInfo.hasNextPage, false);
    assert.equal(anilistCalls, 1, "the outage circuit should suppress repeated AniList requests");
    assert.ok(jikanCalls >= 3, "each catalog request should attempt the configured fallback");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
