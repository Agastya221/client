import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnilistDetail,
  getAnilistSeasonal,
  getAnilistTrending,
  searchAnilist,
} from "../lib/anilist/api";

test("catalog lists remain renderable when AniList and Jikan are both unavailable", async () => {
  const originalFetch = globalThis.fetch;
  let anilistCalls = 0;
  let jikanCalls = 0;
  let kitsuCalls = 0;
  const jikanUrls: string[] = [];

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
      jikanUrls.push(url);
      return new Response("Gateway Timeout", { status: 504 });
    }

    if (url.includes("kitsu.io/api/edge/anime")) {
      kitsuCalls += 1;
      return Response.json({
        data: [{
          type: "anime",
          id: "1",
          attributes: {
            canonicalTitle: "Fallback Anime",
            titles: { en: "Fallback Anime", en_jp: "Fallback Anime", ja_jp: "Fallback Anime" },
            synopsis: "Available while AniList is down.",
            averageRating: "80.5",
            userCount: 100,
            favoritesCount: 10,
            status: "current",
            subtype: "TV",
            startDate: "2026-01-01",
            nextRelease: "2026-03-12T18:00:00.000Z",
            episodeCount: 12,
            episodeLength: 24,
            posterImage: { original: "https://example.com/poster.jpg", large: "https://example.com/poster.jpg" },
            coverImage: { original: "https://example.com/banner.jpg", large: "https://example.com/banner.jpg" },
          },
          relationships: {
            mappings: { data: [{ type: "mappings", id: "map-1" }] },
            genres: { data: [{ type: "genres", id: "genre-1" }] },
          },
        }],
        included: [
          { type: "mappings", id: "map-1", attributes: { externalSite: "anilist/anime", externalId: "12345" } },
          { type: "genres", id: "genre-1", attributes: { name: "Action" } },
        ],
        meta: { count: 1 },
        links: {},
      });
    }

    if (url.includes("kitsu.io/api/edge/mappings")) {
      kitsuCalls += 1;
      return Response.json({
        data: [{
          type: "mappings",
          id: "map-1",
          attributes: { externalSite: "anilist/anime", externalId: "12345" },
          relationships: { item: { data: { type: "anime", id: "1" } } },
        }],
        included: [{
          type: "anime",
          id: "1",
          attributes: {
            canonicalTitle: "Fallback Anime",
            titles: { en: "Fallback Anime", en_jp: "Fallback Anime", ja_jp: "Fallback Anime" },
            synopsis: "Available while AniList is down.",
            averageRating: "80.5",
            userCount: 100,
            favoritesCount: 10,
            status: "current",
            subtype: "TV",
            startDate: "2026-01-01",
            nextRelease: "2026-03-12T18:00:00.000Z",
            episodeCount: 12,
            episodeLength: 24,
            posterImage: { original: "https://example.com/poster.jpg", large: "https://example.com/poster.jpg" },
            coverImage: { original: "https://example.com/banner.jpg", large: "https://example.com/banner.jpg" },
          },
          relationships: { genres: { data: [] } },
        }],
      });
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
    const detail = await getAnilistDetail(12345);

    assert.equal(trending[0]?.id, 12345);
    assert.equal(seasonal[0]?.id, 12345);
    assert.equal(search.media[0]?.id, 12345);
    assert.equal(search.pageInfo.total, 1);
    assert.equal(search.pageInfo.hasNextPage, false);
    assert.equal(detail.id, 12345);
    assert.equal(detail.title.english, "Fallback Anime");
    assert.equal(detail.nextAiringEpisode?.episode, 11);
    assert.equal(detail.nextAiringEpisode?.airingAt, 1_773_338_400);
    assert.equal(anilistCalls, 1, "the outage circuit should suppress repeated AniList requests");
    assert.equal(jikanCalls, 1, "the Jikan outage circuit should suppress duplicate failing requests");
    assert.match(jikanUrls[0] || "", /\/top\/anime/, "trending should use Jikan's top-airing endpoint");
    assert.ok(kitsuCalls >= 3, "Kitsu should supply real catalog entries when both primary sources fail");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
