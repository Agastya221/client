import assert from "node:assert/strict";
import test from "node:test";
import { selectFocusedServers } from "../lib/anime/server-selection";
import { resolveFocusedServerOptions } from "../lib/anime/api";
import type { ServerHealthResult, ServerOption } from "../lib/anime/types";

const PICKER_OPTIONS: ServerOption[] = [
  { id: "anivexa2-aniwaves-hls-hard", label: "Waves", provider: "animekai", category: "sub", transport: "hls", subType: "hard" },
  { id: "anivexa2-anikoto-hls-soft", label: "Solaris Vidstream-2", provider: "animekai", category: "sub", transport: "hls", subType: "soft" },
  { id: "anivexa2-anikoto-hls-s1-soft", label: "Solaris Vidstream-1", provider: "animekai", category: "sub", transport: "hls", subType: "soft" },
  { id: "anivexa2-aniwaves-hls-dub", label: "Waves", provider: "animekai", category: "dub", transport: "hls" },
];

test("a failed server is hidden from the picker rather than shown disabled", () => {
  const health: Record<string, ServerHealthResult> = {
    "anivexa2-anikoto-hls-soft": { status: "failed", reason: "Media segment returned 404", checkedAt: 1 },
  };
  const focused = selectFocusedServers(PICKER_OPTIONS, health);
  assert.deepEqual(focused.soft.map((option) => option.id), ["anivexa2-anikoto-hls-s1-soft"]);
  assert.equal(focused.soft.some((option) => option.id === "anivexa2-anikoto-hls-soft"), false);
});

test("a manually selected server survives a failed probe so it can still be tested", () => {
  const health: Record<string, ServerHealthResult> = {
    "anivexa2-anikoto-hls-soft": { status: "failed", reason: "Media segment returned 404", checkedAt: 1 },
  };
  const kept = selectFocusedServers(PICKER_OPTIONS, health, { keepId: "anivexa2-anikoto-hls-soft" });
  assert.deepEqual(kept.soft.map((option) => option.id), [
    "anivexa2-anikoto-hls-soft",
    "anivexa2-anikoto-hls-s1-soft",
  ]);

  // The same failed server must never be offered as an automatic replacement:
  // the fallback search passes no keepId and so keeps hiding it.
  const replacements = selectFocusedServers(PICKER_OPTIONS, health);
  assert.equal(replacements.soft.some((option) => option.id === "anivexa2-anikoto-hls-soft"), false);
});

test("a slow upstream cannot block the server render and reports itself incomplete", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Promise<Response>((resolve) => {
    setTimeout(() => resolve(new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })), 250);
  })) as typeof fetch;

  try {
    const startedAt = Date.now();
    const result = await resolveFocusedServerOptions({
      anilistId: 999000001,
      episodeNumber: 1,
      uiProvider: "animekai",
      dubbed: false,
      timeoutMs: 25,
    });
    assert.equal(result.complete, false, "an unfinished lookup must not claim a final picker");
    assert.deepEqual(result.serverOptions, []);
    assert.ok(Date.now() - startedAt < 200, "the budget must cut off well before the slow upstream");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a route without an AniList id resolves as complete instead of pending forever", async () => {
  const result = await resolveFocusedServerOptions({
    anilistId: null,
    episodeNumber: 1,
    uiProvider: "animekai",
    dubbed: false,
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.serverOptions, []);
});

test("a failing provider is caught per lookup and still reports a complete picker", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("upstream down"); }) as typeof fetch;

  try {
    const result = await resolveFocusedServerOptions({
      anilistId: 999000002,
      episodeNumber: 1,
      uiProvider: "animekai",
      dubbed: false,
      timeoutMs: 2_000,
    });
    assert.equal(result.complete, true, "a definitive failure is an answer, not a pending state");
    assert.deepEqual(result.serverOptions, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
