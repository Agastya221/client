import assert from "node:assert/strict";
import test from "node:test";
import {
  getEpisodeArtworkUrl,
  mergeEpisodeMetadataIntoWatchSession,
} from "../lib/anime/episode-metadata.ts";
import type { EpisodeModel, WatchSessionModel } from "../lib/anime/types.ts";

function episode(number: number, title: string, image: string | null = null): EpisodeModel {
  return {
    number,
    title,
    image,
    isSubbed: true,
    isDubbed: false,
    idByProvider: { animekai: `episode-${number}` },
    availableProviders: ["animekai"],
  };
}

test("episode metadata supplies titles and prefers unique episode screen caps", () => {
  const providerArtwork = "https://provider.example/episode-2.jpg";
  const source = { kind: "iframe", iframeUrl: "https://player.example/2" };
  const session = {
    anime: { id: "anilist~21" },
    episode: episode(1, "Episode 1"),
    episodes: [
      episode(1, "Episode 1"),
      episode(2, "Provider title", providerArtwork),
    ],
    source,
    serverOptions: [{ id: "provider", label: "Provider" }],
  } as unknown as WatchSessionModel;

  const merged = mergeEpisodeMetadataIntoWatchSession(session, [
    { number: 1, title: "Romance Dawn", image: "https://anizip.example/episode-1.jpg" },
    { number: 2, title: "AniZip title", image: "https://anizip.example/episode-2.jpg" },
  ]);

  assert.equal(merged.episode.title, "Romance Dawn");
  assert.equal(merged.episode.image, "https://anizip.example/episode-1.jpg");
  assert.equal(merged.episodes[0]?.title, "Romance Dawn");
  assert.equal(merged.episodes[0]?.image, "https://anizip.example/episode-1.jpg");
  assert.equal(merged.episodes[1]?.title, "Provider title");
  assert.equal(merged.episodes[1]?.image, "https://anizip.example/episode-2.jpg");
  assert.strictEqual(merged.source, source);
  assert.strictEqual(merged.serverOptions, session.serverOptions);
});

test("series artwork is never used as an episode-art fallback", () => {
  const anime = {
    banner: "https://img.example/banner.jpg?size=large",
    poster: "https://img.example/poster.jpg",
  };

  assert.equal(
    getEpisodeArtworkUrl("https://img.example/banner.jpg?size=small", anime),
    null,
  );
  assert.equal(
    getEpisodeArtworkUrl("https://img.example/episode-1.jpg", anime),
    "https://img.example/episode-1.jpg",
  );
});

test("empty deferred metadata preserves the complete watch session reference", () => {
  const session = {
    anime: { id: "anilist~21" },
    episode: episode(1, "Episode 1"),
    episodes: [episode(1, "Episode 1")],
  } as unknown as WatchSessionModel;

  assert.strictEqual(mergeEpisodeMetadataIntoWatchSession(session, []), session);
});
