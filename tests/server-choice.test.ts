import assert from "node:assert/strict";
import test from "node:test";
import {
  choiceFromServer,
  choiceMatchesServer,
  describeChoice,
  displayServerLabel,
  serverIdForChoice,
} from "../lib/anime/server-selection.ts";
import type { ServerOption } from "../lib/anime/types.ts";

const opt = (id: string, extra: Partial<ServerOption> = {}): ServerOption =>
  ({ id, label: id, provider: "animekai", category: "sub", ...extra });

test("a picked server is remembered as provider + kind, not an episode-specific id", () => {
  assert.deepEqual(choiceFromServer(opt("anivexa2-anikoto-hls-s2-soft", { subType: "soft" })),
    { kind: "provider", provider: "anikoto", mode: "soft" });
  assert.deepEqual(choiceFromServer(opt("anivexa2-aniwaves-hls-hard", { subType: "hard" })),
    { kind: "provider", provider: "aniwaves", mode: "hard" });
  assert.deepEqual(choiceFromServer(opt("anivexa2-anikoto-hls-s1-dub", { category: "dub" })),
    { kind: "provider", provider: "anikoto", mode: "dub" });
  // the instant gateway buttons remember the same way
  assert.deepEqual(choiceFromServer(opt("anivexa-aniwaves-hsub")), { kind: "provider", provider: "aniwaves", mode: "hard" });
});

test("embeds are remembered by their id", () => {
  assert.deepEqual(choiceFromServer(opt("megaplay-sub")), { kind: "embed", id: "megaplay-sub" });
  assert.deepEqual(choiceFromServer(opt("anivexa2-aniwaves-embed-s1-dub", { category: "dub" })),
    { kind: "embed", id: "anivexa2-aniwaves-embed-s1-dub" });
});

test("a remembered choice is requested with an id the server resolves on any episode", () => {
  assert.equal(serverIdForChoice({ kind: "provider", provider: "anikoto", mode: "soft" }), "anivexa-anikoto-ssub");
  assert.equal(serverIdForChoice({ kind: "provider", provider: "aniwaves", mode: "hard" }), "anivexa-aniwaves-hsub");
  assert.equal(serverIdForChoice({ kind: "provider", provider: "anikoto", mode: "dub" }), "anivexa-anikoto-dub");
});

test("matching tells whether the playing server is the remembered one", () => {
  const solarisSoft = { kind: "provider", provider: "anikoto", mode: "soft" } as const;
  assert.equal(choiceMatchesServer(solarisSoft, "anivexa2-anikoto-hls-s3-soft"), true, "any Solaris soft variant");
  assert.equal(choiceMatchesServer(solarisSoft, "anivexa2-aniwaves-hls-hard"), false, "Waves is a different choice");
  assert.equal(choiceMatchesServer(solarisSoft, "anivexa2-anikoto-hls-dub"), false, "dub is a different choice");
  assert.equal(choiceMatchesServer({ kind: "embed", id: "megaplay-sub" }, "megaplay-sub"), true);
  assert.equal(choiceMatchesServer({ kind: "embed", id: "megaplay-sub" }, "animeplay-sub"), false);
  assert.equal(choiceMatchesServer(solarisSoft, null), false);
});

test("the message names the choice in plain words", () => {
  assert.equal(describeChoice({ kind: "provider", provider: "anikoto", mode: "soft" }), "Solaris · Soft subs");
  assert.equal(describeChoice({ kind: "provider", provider: "aniwaves", mode: "hard" }), "Waves · Hard subs");
  assert.equal(describeChoice({ kind: "provider", provider: "anikoto", mode: "dub" }), "Solaris · Dub");
});

test("embeds are always named Server N, never Solaris or Waves", () => {
  const embeds = [opt("megaplay-sub"), opt("animeplay-sub"), opt("anivexa2-aniwaves-embed-hard"), opt("anivexa2-anikoto-embed-s1-soft")];
  assert.deepEqual(embeds.map((entry) => displayServerLabel(entry, embeds)), ["Server 1", "Server 2", "Server 3", "Server 4"]);
});

test("main servers keep their brand names", () => {
  const soft = [opt("anivexa2-anikoto-hls-soft"), opt("anivexa2-anikoto-hls-s1-soft")];
  assert.deepEqual(soft.map((entry) => displayServerLabel(entry, soft)), ["Solaris 1", "Solaris 2"]);
  const hard = [opt("anivexa2-aniwaves-hls-hard")];
  assert.equal(displayServerLabel(hard[0], hard), "Waves");
});
