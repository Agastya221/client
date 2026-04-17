import assert from "node:assert/strict";
import test from "node:test";
import { getAnimeDetailModel } from "../lib/anime/api.ts";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

test("getAnimeDetailModel keeps fast detail loads on the active provider only", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/v2/hianime/anime/solo-leveling-100")) {
      return jsonResponse({
        anime: {
          info: {
            name: "Solo Leveling",
            description: "Hunter rise.",
            poster: "https://cdn.example/poster.jpg",
            stats: {
              type: "TV",
              duration: "24m",
              episodes: { sub: 12, dub: 12 },
            },
            anilistId: 151807,
          },
          moreInfo: {
            genres: ["Action", "Fantasy"],
            status: "Releasing",
            aired: "2024",
          },
        },
        relatedAnimes: [],
        recommendedAnimes: [],
      });
    }

    if (url.endsWith("/api/v2/hianime/anime/solo-leveling-100/episodes")) {
      return jsonResponse({
        totalEpisodes: 12,
        episodes: [{ number: 1, title: "Arise", episodeId: "hid-1" }],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const detail = await getAnimeDetailModel("hianime~solo-leveling-100", null, {
      resolveProviderFallbacks: false,
      mergeEpisodeProviders: false,
    });

    assert.equal(detail.activeProvider, "hianime");
    assert.equal(detail.episodeCoverageMode, "active-provider");
    assert.deepEqual(detail.availableProviders, ["hianime"]);
    assert.equal(detail.episodes.length, 1);
    assert.deepEqual(
      calls.map((url) => new URL(url).pathname),
      [
        "/api/v2/hianime/anime/solo-leveling-100",
        "/api/v2/hianime/anime/solo-leveling-100/episodes",
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getAnimeDetailModel resolves only the requested fallback provider for provider switching", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/v2/hianime/anime/solo-leveling-100")) {
      return jsonResponse({
        anime: {
          info: {
            name: "Solo Leveling",
            description: "Hunter rise.",
            poster: "https://cdn.example/poster.jpg",
            stats: {
              type: "TV",
              duration: "24m",
              episodes: { sub: 12, dub: 12 },
            },
            anilistId: 151807,
          },
          moreInfo: {
            genres: ["Action", "Fantasy"],
            status: "Releasing",
            aired: "2024",
          },
        },
        relatedAnimes: [],
        recommendedAnimes: [],
      });
    }

    if (url.endsWith("/api/v2/hianime/anime/solo-leveling-100/episodes")) {
      return jsonResponse({
        totalEpisodes: 12,
        episodes: [{ number: 1, title: "Arise", episodeId: "hid-1" }],
      });
    }

    if (url.endsWith("/api/v2/anime/animekai/search/Solo%20Leveling?page=1")) {
      return jsonResponse({
        results: [{ id: "solo-leveling-ak", title: "Solo Leveling" }],
      });
    }

    if (url.endsWith("/api/v2/anime/animekai/info/solo-leveling-ak")) {
      return jsonResponse({
        id: "solo-leveling-ak",
        title: "Solo Leveling",
        image: "https://cdn.example/poster-ak.jpg",
        description: "AnimeKai detail",
        genres: ["Action", "Fantasy"],
        type: "TV",
        status: "Releasing",
        season: "Winter 2024",
        duration: "24m",
        totalEpisodes: 12,
        hasSub: true,
        hasDub: true,
        episodes: [{ id: "ak-1", number: 1, title: "Arise", isSubbed: true, isDubbed: true }],
        relations: [],
        recommendations: [],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const detail = await getAnimeDetailModel("hianime~solo-leveling-100", "animekai", {
      resolveProviderFallbacks: false,
      mergeEpisodeProviders: false,
    });

    assert.equal(detail.activeProvider, "animekai");
    assert.equal(detail.episodeCoverageMode, "active-provider");
    assert.deepEqual(detail.availableProviders, ["hianime", "animekai"]);
    assert.equal(detail.episodes[0]?.idByProvider.animekai, "ak-1");
    assert.ok(calls.some((url) => url.endsWith("/api/v2/anime/animekai/search/Solo%20Leveling?page=1")));
    assert.ok(calls.some((url) => url.endsWith("/api/v2/anime/animekai/info/solo-leveling-ak")));
    assert.ok(!calls.some((url) => url.includes("/api/v2/anime/desidub/")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
