import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAnimeKaiCatalogItem,
  normalizeAnimeKaiEpisodesPayload,
  normalizeDesidubCatalogItem,
  normalizeDesidubEpisodesPayload,
  normalizeHianimeCatalogItem,
  normalizeHianimeEpisodesPayload,
  normalizeStreamSourceFromUrl,
  unwrapProviderPayload,
} from "../lib/anime/api.ts";

test("unwrapProviderPayload reads wrapped HiAnime data payloads", () => {
  const wrapped = {
    status: 200,
    data: {
      animes: [{ id: "solo-leveling-100", name: "Solo Leveling" }],
    },
  };

  const payload = unwrapProviderPayload(wrapped);
  const anime = normalizeHianimeCatalogItem(payload.animes[0]);

  assert.equal(anime.provider, "hianime");
  assert.equal(anime.providerId, "solo-leveling-100");
  assert.equal(anime.title, "Solo Leveling");
  assert.equal(anime.href, "/anime/hianime~solo-leveling-100");
});

test("normalizeAnimeKaiCatalogItem keeps flat response metadata", () => {
  const anime = normalizeAnimeKaiCatalogItem({
    id: "frieren-123",
    title: "Frieren: Beyond Journey's End",
    image: "https://cdn.example/frieren.jpg",
    genres: ["Adventure", "Drama", "Fantasy"],
    type: "TV",
    score: "9.3",
    season: "Fall 2023",
    sub: 28,
    dub: 28,
    episodes: 28,
  });

  assert.equal(anime.provider, "animekai");
  assert.equal(anime.title, "Frieren: Beyond Journey's End");
  assert.deepEqual(anime.genres, ["Adventure", "Drama", "Fantasy"]);
  assert.equal(anime.year, "2023");
  assert.equal(anime.episodeCount, 28);
});

test("normalizeDesidubCatalogItem and episodes preserve dubbed availability", () => {
  const anime = normalizeDesidubCatalogItem({
    slug: "one-piece-dub",
    title: "One Piece Hindi Dub",
    poster: "https://cdn.example/one-piece.jpg",
    genres: ["Action", "Adventure"],
    description: "Dub archive",
  });
  const episodes = normalizeDesidubEpisodesPayload({
    episodes: [
      { id: "ep-1", number: 1, title: "I'm Luffy!" },
      { id: "ep-2", number: 2, title: "Enter Zoro" },
    ],
  });

  assert.equal(anime.provider, "desidub");
  assert.equal(anime.type, "Dubbed Anime");
  assert.equal(episodes[0]?.isDubbed, true);
  assert.equal(episodes[0]?.idByProvider.desidub, "ep-1");
});

test("normalize episode payloads across providers", () => {
  const hianimeEpisodes = normalizeHianimeEpisodesPayload({
    episodes: [{ number: 7, title: "The Hunter Awakens", episodeId: "hid-7" }],
  });
  const animeKaiEpisodes = normalizeAnimeKaiEpisodesPayload({
    episodes: [{ id: "ak-7", number: 7, title: "The Hunter Awakens", isSubbed: true, isDubbed: true }],
  });

  assert.equal(hianimeEpisodes[0]?.availableProviders[0], "hianime");
  assert.equal(hianimeEpisodes[0]?.idByProvider.hianime, "hid-7");
  assert.equal(animeKaiEpisodes[0]?.idByProvider.animekai, "ak-7");
  assert.equal(animeKaiEpisodes[0]?.isDubbed, true);
});

test("normalizeStreamSourceFromUrl proxies m3u8 streams and referer-protected sources", () => {
  const source = normalizeStreamSourceFromUrl({
    label: "DesiDub CDN",
    url: "https://video.example/playlist.m3u8",
    referer: "https://player.example/embed/abc",
    forceProxy: true,
  });

  assert.equal(source.kind, "video");
  assert.equal(source.isM3U8, true);
  assert.equal(source.requiresProxy, true);
  assert.ok(source.proxiedUrl?.includes("/api/proxy/m3u8-streaming-proxy"));
  assert.ok(source.proxiedUrl?.includes("referer="));
});
