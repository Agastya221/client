import assert from "node:assert/strict";
import test from "node:test";
import { probeStreamHealth } from "../lib/anime/stream-health";
import { rankServerOptions, bestVerifiedServer, focusedServerCandidates, selectFocusedServers } from "../lib/anime/server-selection";
import type { ServerHealthResult, ServerOption } from "../lib/anime/types";

test("HLS health follows the first variant, segment, and subtitle file", async () => {
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("master.m3u8")) return new Response(
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nmedia.m3u8\n",
    );
    if (url.endsWith("media.m3u8")) return new Response("#EXTM3U\n#EXTINF:4,\nseg-1.ts\n");
    if (url.endsWith("seg-1.ts")) return new Response(new Uint8Array([0x47, 0x00]), {
      status: 206, headers: { "Content-Type": "video/mp2t" },
    });
    if (url.endsWith("en.vtt")) return new Response("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello");
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;

  const health = await probeStreamHealth({
    url: "https://media.example/master.m3u8",
    transport: "hls",
    subType: "soft",
    subtitles: [{ file: "https://media.example/en.vtt", language: "en" }],
  }, fetcher);
  assert.equal(health.status, "working");
  assert.equal(health.reason, "Media and subtitles loaded");
  assert.deepEqual(urls.map((url) => new URL(url).pathname), [
    "/master.m3u8", "/media.m3u8", "/seg-1.ts", "/en.vtt",
  ]);
});

test("health reports an HLS media failure and rejects an HTML MP4 response", async () => {
  const hlsFetch = (async (input: RequestInfo | URL) => String(input).endsWith("master.m3u8")
    ? new Response("#EXTM3U\n#EXTINF:4,\nseg-1.ts\n")
    : new Response("missing", { status: 404 })) as typeof fetch;
  const hls = await probeStreamHealth({
    url: "https://media.example/master.m3u8", transport: "hls",
  }, hlsFetch);
  assert.equal(hls.status, "failed");
  assert.equal(hls.reason, "Media segment returned 404");

  const mp4Fetch = (async () => new Response("<html>blocked</html>", {
    headers: { "Content-Type": "text/html" },
  })) as typeof fetch;
  const mp4 = await probeStreamHealth({
    url: "https://media.example/video.mp4", transport: "mp4",
  }, mp4Fetch);
  assert.equal(mp4.status, "failed");
});

test("DASH manifest alone remains unverified", async () => {
  const fetcher = (async () => new Response("<?xml version='1.0'?><MPD></MPD>")) as typeof fetch;
  const health = await probeStreamHealth({
    url: "https://media.example/stream.mpd", transport: "dash",
  }, fetcher);
  assert.equal(health.status, "unverified");
});

test("selection prefers checked internal servers and skips failed choices", () => {
  const options: ServerOption[] = [
    { id: "anivexa2-senshi-hls-hard", label: "Kage", provider: "animegg", category: "sub", transport: "hls", subType: "hard" },
    { id: "anivexa2-animegg-mp4-hard", label: "Nexus", provider: "animegg", category: "sub", transport: "mp4", subType: "hard" },
    { id: "anivexa2-aniwaves-hls-hard", label: "Waves", provider: "animegg", category: "sub", transport: "hls", subType: "hard" },
  ];
  const health: Record<string, ServerHealthResult> = {
    [options[0].id]: { status: "failed", reason: "HTTP 403", checkedAt: 1 },
    [options[2].id]: { status: "working", reason: "Media segment loaded", checkedAt: 1 },
  };
  assert.deepEqual(rankServerOptions(options, health).map((option) => option.label), ["Waves", "Nexus", "Kage"]);
  assert.equal(bestVerifiedServer(options, health)?.label, "Waves");
});

test("focused choices keep Waves and Solaris variants and exclude Nexus", () => {
  const options: ServerOption[] = [
    { id: "anivexa2-aniwaves-hls-hard", label: "Waves Vidplay", provider: "animegg", category: "sub", transport: "hls", subType: "hard" },
    { id: "anivexa2-anikoto-hls-soft", label: "Solaris Vidstream-2", provider: "animegg", category: "sub", transport: "hls", subType: "soft" },
    { id: "anivexa2-anikoto-hls-s1-soft", label: "Solaris Vidstream-1 beta", provider: "animegg", category: "sub", transport: "hls", subType: "soft" },
    { id: "anivexa2-aniwaves-hls-dub", label: "Waves Vidplay", provider: "animegg", category: "dub", transport: "hls" },
    { id: "anivexa2-anikoto-hls-dub", label: "Solaris Vidstream-2", provider: "animegg", category: "dub", transport: "hls" },
    { id: "anivexa2-animegg-mp4-hard", label: "Nexus 720p", provider: "animegg", category: "sub", transport: "mp4", subType: "hard" },
  ];
  const health: Record<string, ServerHealthResult> = {
    [options[1].id]: { status: "failed", reason: "Media segment returned 404", checkedAt: 1 },
  };
  assert.equal(focusedServerCandidates(options).some((option) => option.label.includes("Nexus")), false);
  const focused = selectFocusedServers(options, health);
  assert.deepEqual(focused.hard.map((option) => option.label), ["Waves Vidplay"]);
  assert.deepEqual(focused.soft.map((option) => option.label), ["Solaris Vidstream-1 beta"]);
  assert.deepEqual(focused.dub.map((option) => option.label), ["Waves Vidplay", "Solaris Vidstream-2"]);
});
