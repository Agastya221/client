import assert from "node:assert/strict";
import test from "node:test";
import { activityAt, animeWatching, siteWatching } from "../lib/watching.ts";
import { sanitizeSettings, type WatchingSettings } from "../lib/access/settings.ts";

const IST: WatchingSettings = { enabled: true, min: 6, max: 34, timezone: "Asia/Kolkata" };
// 22:00 and 05:00 in India
const at = (hourIst: number, minute = 0) => new Date(Date.UTC(2026, 5, 15, hourIst - 5, minute - 30));

test("busy in the evening, quiet before dawn", () => {
  assert.ok(activityAt(21.5) > 0.99);
  assert.ok(activityAt(9.5) < 0.05);
  assert.ok(siteWatching(at(22), IST) > siteWatching(at(5), IST) + 12);
});

test("always inside the configured range, all day, at any moment", () => {
  for (let minutes = 0; minutes < 24 * 60; minutes += 7) {
    const now = new Date(Date.UTC(2026, 5, 15, 0, minutes));
    const n = siteWatching(now, IST);
    assert.ok(n >= IST.min && n <= IST.max, `${n} at ${now.toISOString()}`);
  }
});

test("moves gradually, not in jumps", () => {
  let previous = siteWatching(at(21), IST);
  for (let seconds = 10; seconds < 1800; seconds += 10) {
    const n = siteWatching(new Date(at(21).getTime() + seconds * 1000), IST);
    assert.ok(Math.abs(n - previous) <= 2, `${previous} -> ${n} after ${seconds}s`);
    previous = n;
  }
});

test("each anime shows a different, smaller number that never exceeds the site total", () => {
  const now = at(22);
  const total = siteWatching(now, IST);
  const seen = new Set<number>();
  for (const id of ["anilist~21", "anilist~1535", "anilist~16498", "anilist~101922", "anilist~5114", "anilist~9253"]) {
    const n = animeWatching(id, now, IST);
    assert.ok(n >= 1 && n <= total, `${id}: ${n} of ${total}`);
    seen.add(n);
  }
  assert.ok(seen.size >= 3, "titles do not all show the same number");
  assert.equal(animeWatching("anilist~21", now, IST), animeWatching("anilist~21", now, IST), "stable for a given moment");
});

test("a bad time zone falls back instead of crashing", () => {
  assert.ok(Number.isFinite(siteWatching(at(22), { ...IST, timezone: "Not/AZone" })));
});

test("settings are sanitised: junk is dropped, numbers rounded, zones checked", () => {
  assert.deepEqual(sanitizeSettings({ maxMembers: "50", revoked: [3, "x", 3, -1, 7.4], watching: { max: 9999999 } }), {
    revoked: [3, 7],
    watching: {},
  });
  assert.deepEqual(sanitizeSettings({ maxMembers: 80.4, watching: { enabled: false, min: 4, max: 20, timezone: "Europe/London" } }), {
    maxMembers: 80,
    watching: { enabled: false, min: 4, max: 20, timezone: "Europe/London" },
  });
  assert.deepEqual(sanitizeSettings({ watching: { timezone: "Nope" } }), { watching: {} });
  assert.deepEqual(sanitizeSettings(null), {});
});
