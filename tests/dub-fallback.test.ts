import assert from "node:assert/strict";
import test from "node:test";
import { nextServerAfterFailure } from "../lib/anime/server-selection.ts";
import type { ServerHealthResult, ServerOption } from "../lib/anime/types.ts";

const opt = (id: string, category: "sub" | "dub", extra: Partial<ServerOption> = {}): ServerOption =>
  ({ id, label: id, provider: "animekai", category, transport: "hls", ...extra }) as ServerOption;

const OPTIONS = [
  opt("anivexa2-anikoto-hls-s1-dub", "dub"),
  opt("anivexa2-aniwaves-hls-dub", "dub"),
  opt("anivexa2-anikoto-hls-soft", "sub", { subType: "soft" }),
  opt("anivexa2-aniwaves-hls-hard", "sub", { subType: "hard" }),
  opt("megaplay-dub", "dub", { transport: "embed" }),
];
const none: Record<string, ServerHealthResult> = {};

test("dub: when Solaris dub fails, the next dub server (Waves) is chosen", () => {
  const next = nextServerAfterFailure({ dubbed: true, failedId: "anivexa2-anikoto-hls-s1-dub", options: OPTIONS, healthById: none });
  assert.equal(next?.id, "anivexa2-aniwaves-hls-dub");
});

test("dub: only dub servers are ever offered, never a sub server or the failed one", () => {
  const next = nextServerAfterFailure({ dubbed: true, failedId: "anivexa2-aniwaves-hls-dub", options: OPTIONS, healthById: none });
  assert.equal(next?.id, "anivexa2-anikoto-hls-s1-dub");
  assert.ok(next?.category === "dub");
  const afterBoth = nextServerAfterFailure({
    dubbed: true, failedId: "anivexa2-aniwaves-hls-dub", options: OPTIONS, healthById: none,
    excludeIds: ["anivexa2-anikoto-hls-s1-dub", "anivexa2-aniwaves-hls-dub"],
  });
  assert.equal(afterBoth?.id, "megaplay-dub", "embeds come last, only when the main dub servers are used up");
  assert.equal(nextServerAfterFailure({ dubbed: true, failedId: "x", options: OPTIONS, healthById: none, excludeIds: OPTIONS.map((o) => o.id) }), null);
});

test("dub: a server already known to be failing is skipped", () => {
  const health: Record<string, ServerHealthResult> = { "anivexa2-aniwaves-hls-dub": { status: "failed", reason: "x", checkedAt: 1 } };
  const next = nextServerAfterFailure({ dubbed: true, failedId: "anivexa2-anikoto-hls-s1-dub", options: OPTIONS, healthById: health });
  assert.equal(next?.id, "megaplay-dub");
});

test("sub: never switches by itself, soft and hard subs are different things", () => {
  for (const failedId of ["anivexa2-anikoto-hls-soft", "anivexa2-aniwaves-hls-hard", null]) {
    assert.equal(nextServerAfterFailure({ dubbed: false, failedId, options: OPTIONS, healthById: none }), null, String(failedId));
  }
});
