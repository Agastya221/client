import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFollowedReleaseUpdates,
  type FollowedReleaseListEntry,
  type FollowedReleaseMedia,
} from "../lib/anilist/release-updates.ts";

const NOW = Date.UTC(2026, 6, 23, 12);

function media(
  id: number,
  overrides: Partial<FollowedReleaseMedia> = {},
): FollowedReleaseMedia {
  return {
    id,
    title: { userPreferred: `Anime ${id}` },
    coverImage: {
      extraLarge: `https://example.com/${id}.jpg`,
      color: "#ff6600",
    },
    format: "TV",
    status: "RELEASING",
    startDate: { year: 2026, month: 7, day: 1 },
    nextAiringEpisode: {
      episode: 6,
      airingAt: Math.floor((NOW + 86_400_000) / 1000),
    },
    ...overrides,
  };
}

function entry(
  anime: FollowedReleaseMedia,
  overrides: Partial<FollowedReleaseListEntry> = {},
): FollowedReleaseListEntry {
  return {
    status: "CURRENT",
    progress: 3,
    updatedAt: Math.floor(NOW / 1000),
    media: anime,
    ...overrides,
  };
}

test("shows newly aired episodes only for eligible list entries", () => {
  const followed = entry(media(101));
  const dropped = entry(media(102), { status: "DROPPED", progress: 0 });

  const updates = buildFollowedReleaseUpdates([followed, dropped], NOW);

  assert.equal(updates.length, 1);
  assert.deepEqual(
    {
      kind: updates[0].kind,
      mediaId: updates[0].mediaId,
      latestEpisode: updates[0].latestEpisode,
      newEpisodeCount: updates[0].newEpisodeCount,
      href: updates[0].href,
    },
    {
      kind: "episode",
      mediaId: 101,
      latestEpisode: 5,
      newEpisodeCount: 2,
      href: "/anime/anilist~101/watch?ep=4",
    },
  );
});

test("does not show an episode update when AniList progress is caught up", () => {
  const updates = buildFollowedReleaseUpdates(
    [entry(media(101), { progress: 5 })],
    NOW,
  );

  assert.deepEqual(updates, []);
});

test("treats a delayed next-airing timestamp as aired instead of falling back to episode one", () => {
  const delayed = media(150, {
    nextAiringEpisode: {
      episode: 8,
      airingAt: Math.floor((NOW - 60_000) / 1000),
    },
  });

  const updates = buildFollowedReleaseUpdates(
    [entry(delayed, { progress: 7 })],
    NOW,
  );

  assert.equal(updates[0]?.latestEpisode, 8);
  assert.equal(updates[0]?.href, "/anime/anilist~150/watch?ep=8");
});

test("shows a recently released sequel for an anime on the user's list", () => {
  const sequel = media(202, {
    title: { userPreferred: "Anime 201 Season 2" },
    startDate: { year: 2026, month: 7, day: 10 },
    nextAiringEpisode: {
      episode: 3,
      airingAt: Math.floor((NOW + 86_400_000) / 1000),
    },
  });
  const original = media(201, {
    status: "FINISHED",
    episodes: 12,
    nextAiringEpisode: null,
    relations: {
      edges: [{ relationType: "SEQUEL", node: sequel }],
    },
  });

  const updates = buildFollowedReleaseUpdates(
    [entry(original, { status: "COMPLETED", progress: 12 })],
    NOW,
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].kind, "season");
  assert.equal(updates[0].mediaId, 202);
  assert.equal(updates[0].sourceMediaId, 201);
  assert.equal(updates[0].href, "/anime/anilist~202");
});

test("does not announce a sequel that is already anywhere on the user's list", () => {
  const sequel = media(302);
  const original = media(301, {
    status: "FINISHED",
    episodes: 12,
    nextAiringEpisode: null,
    relations: {
      edges: [{ relationType: "SEQUEL", node: sequel }],
    },
  });

  const updates = buildFollowedReleaseUpdates(
    [
      entry(original, { status: "COMPLETED", progress: 12 }),
      entry(sequel, { status: "DROPPED", progress: 0 }),
    ],
    NOW,
  );

  assert.deepEqual(updates, []);
});

test("ignores an old finished sequel instead of treating it as a new season", () => {
  const oldSequel = media(402, {
    status: "FINISHED",
    episodes: 12,
    nextAiringEpisode: null,
    startDate: { year: 2024, month: 1, day: 1 },
  });
  const original = media(401, {
    status: "FINISHED",
    episodes: 12,
    nextAiringEpisode: null,
    relations: {
      edges: [{ relationType: "SEQUEL", node: oldSequel }],
    },
  });

  const updates = buildFollowedReleaseUpdates(
    [entry(original, { status: "COMPLETED", progress: 12 })],
    NOW,
  );

  assert.deepEqual(updates, []);
});
