import assert from "node:assert/strict";
import test from "node:test";
import {
  getEpisodeArtworkUrl,
  mergeEpisodeMetadataIntoWatchSession,
  resolveEpisodeLanguageAvailability,
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

test("episode metadata supplies titles and preserves unique provider screen caps", () => {
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
    { number: 1, title: "Romance Dawn", image: "https://anizip.example/episode-1.jpg", description: "Luffy sets sail.", airDate: "1999-10-20" },
    { number: 2, title: "AniZip title", image: "https://anizip.example/episode-2.jpg" },
  ]);

  assert.equal(merged.episode.title, "Romance Dawn");
  assert.equal(merged.episode.image, "https://anizip.example/episode-1.jpg");
  assert.equal(merged.episodes[0]?.title, "Romance Dawn");
  assert.equal(merged.episodes[0]?.image, "https://anizip.example/episode-1.jpg");
  assert.equal(merged.episodes[0]?.description, "Luffy sets sail.");
  assert.equal(merged.episodes[0]?.airDate, "1999-10-20");
  assert.equal(merged.episodes[1]?.title, "Provider title");
  assert.equal(merged.episodes[1]?.image, providerArtwork);
  assert.strictEqual(merged.source, source);
  assert.strictEqual(merged.serverOptions, session.serverOptions);
});

test("preferred HD catalog artwork replaces a unique provider thumbnail", () => {
  const providerArtwork = "https://provider.example/episode-1.jpg";
  const session = {
    anime: { id: "anilist~21" },
    episode: episode(1, "Episode 1", providerArtwork),
    episodes: [episode(1, "Episode 1", providerArtwork)],
  } as unknown as WatchSessionModel;

  const merged = mergeEpisodeMetadataIntoWatchSession(session, [{
    number: 1,
    title: null,
    image: "https://static.tvmaze.com/original/episode-1.jpg",
    thumbnail: "https://static.tvmaze.com/medium/episode-1.jpg",
    preferArtwork: true,
  }]);

  assert.equal(merged.episode.image, "https://static.tvmaze.com/original/episode-1.jpg");
  assert.equal(merged.episode.thumbnail, "https://static.tvmaze.com/medium/episode-1.jpg");
});

test("episode descriptions use clean source typography", () => {
  const session = {
    anime: { id: "anilist~21" },
    episode: episode(1, "Episode 1"),
    episodes: [episode(1, "Episode 1")],
  } as unknown as WatchSessionModel;

  const merged = mergeEpisodeMetadataIntoWatchSession(session, [
    { number: 1, title: null, image: null, description: "He leaves — until she returns -- with news. It`s true! Source: crunchyroll" },
  ]);

  assert.equal(merged.episode.description, "He leaves, until she returns, with news. It's true!");
});

test("episode language badges follow per-episode counts and confirmed current servers", () => {
  const common = {
    subCount: 3,
    dubCount: 2,
    hasAnySubEpisode: false,
    hasSubFallback: true,
    hasDubServerForCurrentEpisode: false,
    currentEpisodeNumber: 3,
  };

  assert.deepEqual(
    resolveEpisodeLanguageAvailability({ number: 1 }, common),
    { subbed: true, dubbed: true },
  );
  assert.deepEqual(
    resolveEpisodeLanguageAvailability({ number: 3 }, common),
    { subbed: true, dubbed: false },
  );
  assert.deepEqual(
    resolveEpisodeLanguageAvailability(
      { number: 3, isSubbed: false, isDubbed: false },
      { ...common, subCount: 0, dubCount: 0, hasSubFallback: false, hasDubServerForCurrentEpisode: true },
    ),
    { subbed: false, dubbed: true },
  );
});

test("current episode dub badge follows exact server discovery over broad catalogue counts", () => {
  assert.deepEqual(
    resolveEpisodeLanguageAvailability(
      { number: 1, isDubbed: true },
      {
        subCount: 12,
        dubCount: 12,
        hasAnySubEpisode: true,
        hasSubFallback: true,
        hasDubServerForCurrentEpisode: false,
        currentEpisodeNumber: 1,
      },
    ),
    { subbed: true, dubbed: false },
  );
});

test("confirmed per-episode catalogue availability overrides a broad dub count", () => {
  const common = {
    subCount: 12,
    dubCount: 12,
    hasAnySubEpisode: true,
    hasSubFallback: true,
    hasDubServerForCurrentEpisode: false,
    currentEpisodeNumber: 1,
  };

  assert.equal(
    resolveEpisodeLanguageAvailability(
      { number: 2, isDubbed: false, dubAvailabilityKnown: true },
      common,
    ).dubbed,
    false,
  );
  assert.equal(
    resolveEpisodeLanguageAvailability(
      { number: 3, isDubbed: true, dubAvailabilityKnown: true },
      common,
    ).dubbed,
    true,
  );
});

test("deferred availability metadata enables dub before an episode is selected", () => {
  const session = {
    anime: { id: "anilist~21" },
    episode: episode(1, "Episode 1"),
    episodes: [episode(1, "Episode 1"), episode(2, "Episode 2")],
  } as unknown as WatchSessionModel;
  session.episodes[1].isDubbed = false;

  const merged = mergeEpisodeMetadataIntoWatchSession(session, [
    {
      number: 2,
      title: null,
      image: null,
      isSubbed: true,
      isDubbed: true,
      subAvailabilityKnown: true,
      dubAvailabilityKnown: true,
    },
  ]);

  assert.equal(merged.episodes[1]?.isSubbed, true);
  assert.equal(merged.episodes[1]?.isDubbed, true);
  assert.equal(merged.episodes[1]?.dubAvailabilityKnown, true);
});

test("confirmed sub-only metadata clears a stale provider dub flag", () => {
  const staleEpisode = episode(2, "Episode 2");
  staleEpisode.isDubbed = true;
  const session = {
    anime: { id: "anilist~21" },
    episode: episode(1, "Episode 1"),
    episodes: [episode(1, "Episode 1"), staleEpisode],
  } as unknown as WatchSessionModel;

  const merged = mergeEpisodeMetadataIntoWatchSession(session, [{
    number: 2,
    title: null,
    image: null,
    isSubbed: true,
    isDubbed: false,
    subAvailabilityKnown: true,
    dubAvailabilityKnown: true,
  }]);

  assert.equal(merged.episodes[1]?.isDubbed, false);
  assert.equal(merged.episodes[1]?.dubAvailabilityKnown, true);
});

test("episode metadata replaces repeated provider artwork", () => {
  const repeatedArtwork = "https://provider.example/series-banner.jpg";
  const session = {
    anime: { id: "anilist~21" },
    episode: episode(1, "Episode 1", repeatedArtwork),
    episodes: [
      episode(1, "Episode 1", repeatedArtwork),
      episode(2, "Episode 2", repeatedArtwork),
    ],
  } as unknown as WatchSessionModel;

  const merged = mergeEpisodeMetadataIntoWatchSession(session, [
    { number: 1, title: null, image: "https://anizip.example/episode-1.jpg" },
    { number: 2, title: null, image: "https://anizip.example/episode-2.jpg" },
  ]);

  assert.equal(merged.episode.image, "https://anizip.example/episode-1.jpg");
  assert.equal(merged.episodes[1]?.image, "https://anizip.example/episode-2.jpg");
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
