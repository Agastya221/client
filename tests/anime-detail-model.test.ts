import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnimeDetailModel,
  getAnimeDetailOverviewModel,
  getAnimeEpisodeListModel,
  getAnimeKaiWatchAvailability,
  resolveAnimeKaiWatchHref,
} from "../lib/anime/api.ts";

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

    if (url.endsWith("/api/anime/solo-leveling-ak")) {
      return jsonResponse({
        title: "Solo Leveling",
        image: "https://cdn.example/poster-ak.jpg",
        description: "AnimeKai Python detail",
        genres: ["Action", "Fantasy"],
        type: "TV",
        status: "Releasing",
        season: "Winter 2024",
        ani_id: "ani-solo-ak",
        subCount: 12,
        dubCount: 12,
        relations: [],
        recommendations: [],
      });
    }

    if (url.endsWith("/api/episodes/ani-solo-ak")) {
      return jsonResponse([
        { id: "ak-1", number: 1, title: "Arise", isSubbed: true, isDubbed: true },
      ]);
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
    assert.ok(calls.some((url) => url.endsWith("/api/anime/solo-leveling-ak")));
    assert.ok(calls.some((url) => url.endsWith("/api/episodes/ani-solo-ak")));
    assert.ok(!calls.some((url) => url.includes("/api/v2/anime/desidub/")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getAnimeDetailOverviewModel loads animekai hero data without waiting for episodes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/anime/solo-leveling-ak")) {
      return jsonResponse({
        title: "Solo Leveling",
        image: "https://cdn.example/poster-ak.jpg",
        description: "AnimeKai Python detail",
        genres: ["Action", "Fantasy"],
        type: "TV",
        status: "Releasing",
        season: "Winter 2024",
        duration: "24m",
        ani_id: "ani-solo-ak",
        subCount: 12,
        dubCount: 12,
        relations: [],
        recommendations: [],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const detail = await getAnimeDetailOverviewModel("animekai~solo-leveling-ak", "animekai", {
      resolveProviderFallbacks: false,
    });

    assert.equal(detail.activeProvider, "animekai");
    assert.equal(detail.anime.title, "Solo Leveling");
    assert.deepEqual(
      calls.map((url) => new URL(url).pathname),
      ["/api/anime/solo-leveling-ak"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("direct animekai slugs fall back to v2 detail when the Python endpoint is missing", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/anime/isekai-nonbiri-nouka-r4e8")) {
      return jsonResponse({ message: "Not Found" }, 404);
    }

    if (url.endsWith("/api/v2/anime/animekai/meta/isekai-nonbiri-nouka-r4e8")) {
      return jsonResponse({
        id: "isekai-nonbiri-nouka-r4e8",
        title: "Farming Life in Another World",
        image: "https://cdn.example/poster-ak.jpg",
        description: "V2 detail fallback",
        genres: ["Fantasy", "Slice of Life"],
        type: "TV",
        status: "Finished",
        season: "Winter 2023",
        totalEpisodes: 12,
        hasSub: true,
        hasDub: false,
        episodes: [{ id: "ak-1", number: 1, title: "Episode 1", isSubbed: true, isDubbed: false }],
        relations: [],
        recommendations: [],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const detail = await getAnimeDetailModel("animekai~isekai-nonbiri-nouka-r4e8", "animekai", {
      resolveProviderFallbacks: false,
      mergeEpisodeProviders: false,
    });

    assert.equal(detail.activeProvider, "animekai");
    assert.equal(detail.anime.title, "Farming Life in Another World");
    assert.equal(detail.episodes[0]?.idByProvider.animekai, "ak-1");
    assert.ok(calls.some((url) => url.endsWith("/api/anime/isekai-nonbiri-nouka-r4e8")));
    assert.ok(calls.some((url) => url.endsWith("/api/v2/anime/animekai/meta/isekai-nonbiri-nouka-r4e8")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getAnimeEpisodeListModel loads animekai episodes separately from meta", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/anime/solo-leveling-ak")) {
      return jsonResponse({
        title: "Solo Leveling",
        image: "https://cdn.example/poster-ak.jpg",
        description: "AnimeKai Python detail",
        genres: ["Action", "Fantasy"],
        type: "TV",
        status: "Releasing",
        season: "Winter 2024",
        duration: "24m",
        ani_id: "ani-solo-ak",
        subCount: 12,
        dubCount: 12,
        relations: [],
        recommendations: [],
      });
    }

    if (url.endsWith("/api/episodes/ani-solo-ak")) {
      return jsonResponse([
        { id: "ak-1", number: 1, title: "Arise", isSubbed: true, isDubbed: true },
      ]);
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const detail = await getAnimeEpisodeListModel("animekai~solo-leveling-ak", "animekai");
    assert.equal(detail.activeProvider, "animekai");
    assert.equal(detail.episodeCoverageMode, "active-provider");
    assert.equal(detail.episodes[0]?.idByProvider.animekai, "ak-1");
    assert.ok(calls.some((url) => url.endsWith("/api/anime/solo-leveling-ak")));
    assert.ok(calls.some((url) => url.endsWith("/api/episodes/ani-solo-ak")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getAnimeDetailModel keeps AnimeKai episode numbering canonical when a fallback provider returns mismatched episodes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/anime/liar-game-yer79")) {
      return jsonResponse({
        title: "Liar Game",
        image: "https://cdn.example/liar-game.jpg",
        description: "AnimeKai detail",
        genres: ["Mystery"],
        type: "TV",
        status: "Finished",
        season: "Summer 2025",
        ani_id: "ani-liar-game",
        subCount: 3,
        dubCount: 0,
        relations: [],
        recommendations: [],
      });
    }

    if (url.endsWith("/api/episodes/ani-liar-game")) {
      return jsonResponse([
        { id: "ak-1", number: 1, title: "The Legendary Con Artist", isSubbed: true, isDubbed: false },
        { id: "ak-2", number: 2, title: "Episode 2", isSubbed: true, isDubbed: false },
        { id: "ak-3", number: 3, title: "Episode 3", isSubbed: true, isDubbed: false },
      ]);
    }

    if (url.endsWith("/api/desidub/search?keyword=Liar%20Game")) {
      return jsonResponse({
        results: [{ slug: "liar-game-hindi", title: "Liar Game" }],
      });
    }

    if (url.endsWith("/api/desidub/anime/liar-game-hindi")) {
      return jsonResponse({
        title: "Liar Game",
        description: "DesiDub detail",
        episodes: [{ id: "dd-13", number: "13.0", title: "Episode 13.0" }],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const detail = await getAnimeDetailModel("animekai~liar-game-yer79", "animekai");

    assert.equal(detail.episodeCoverageMode, "merged-providers");
    assert.deepEqual(detail.episodes.map((episode) => episode.number), [1, 2, 3]);
    assert.deepEqual(detail.episodes.map((episode) => episode.availableProviders), [
      ["animekai"],
      ["animekai"],
      ["animekai"],
    ]);
    assert.ok(calls.some((url) => url.endsWith("/api/desidub/anime/liar-game-hindi")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveAnimeKaiWatchHref upgrades AniList banner links to direct animekai watch routes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/api/search?keyword=Solo%20Leveling")) {
      return jsonResponse({
        results: [{ slug: "solo-leveling-93rg", title: "Solo Leveling" }],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const href = await resolveAnimeKaiWatchHref("anilist~151807", "Solo Leveling");
    assert.equal(href, "/anime/animekai~solo-leveling-93rg/watch?ep=1&provider=animekai");
    assert.ok(calls.some((url) => url.endsWith("/api/search?keyword=Solo%20Leveling")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AniList passthrough titles stay readable and unavailable when AnimeKai mapping misses", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url === "https://graphql.anilist.co") {
      return jsonResponse({
        data: {
          Media: {
            id: 195600,
            idMal: null,
            title: {
              english: "Lost Future Project",
              romaji: "Lost Future Project",
              native: "Lost Future Project",
            },
            synonyms: ["LFP"],
            coverImage: {
              extraLarge: "https://cdn.example/poster.jpg",
              large: "https://cdn.example/poster.jpg",
              medium: "https://cdn.example/poster.jpg",
              color: "#ff5500",
            },
            bannerImage: null,
            description: "AniList only title",
            genres: ["Sci-Fi"],
            averageScore: null,
            meanScore: null,
            popularity: 1,
            trending: 1,
            episodes: null,
            status: "NOT_YET_RELEASED",
            format: "TV",
            season: null,
            seasonYear: 2026,
            startDate: { year: 2026 },
            studios: { nodes: [] },
            nextAiringEpisode: null,
            trailer: null,
            isAdult: false,
            characters: { nodes: [] },
            relations: { edges: [] },
            recommendations: { nodes: [] },
          },
        },
      });
    }

    if (url.endsWith("/api/search?keyword=Lost%20Future%20Project")) {
      return jsonResponse({ results: [] });
    }

    if (url.endsWith("/api/search?keyword=LFP")) {
      return jsonResponse({ results: [] });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const detail = await getAnimeDetailOverviewModel("anilist~195600", "animekai", {
      resolveProviderFallbacks: false,
    });
    const availability = await getAnimeKaiWatchAvailability("anilist~195600", ["Lost Future Project", "LFP"]);

    assert.equal(detail.anime.title, "Lost Future Project");
    assert.deepEqual(detail.availableProviders, []);
    assert.ok(detail.attempts.some((attempt) => attempt.message === "AniList direct lookup — no scraper needed"));
    assert.equal(availability.isAvailable, false);
    assert.equal(availability.watchHref, null);
    assert.equal(availability.message, "This anime is not available to watch yet.");
    assert.ok(calls.some((url) => url.endsWith("/api/search?keyword=Lost%20Future%20Project")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
