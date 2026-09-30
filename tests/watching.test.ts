import assert from "node:assert/strict";
import test from "node:test";
import { activityAt, animeWatching, siteWatching, watchingRange, type WatchingModel } from "../lib/watching.ts";
import { sanitizeSettings } from "../lib/access/settings.ts";

const IST: WatchingModel = { maxMembers: 50, timezone: "Asia/Kolkata" };
// A weekday (Monday 15 June 2026) at the given India time
const at = (hourIst: number, minute = 0, day = 15) => new Date(Date.UTC(2026, 5, day, hourIst - 5, minute - 30));

test("the range comes from the open spots: 50 spots means a peak of 35, and it grows by itself", () => {
  assert.deepEqual(watchingRange(50), { min: 5, max: 35 });
  assert.deepEqual(watchingRange(100), { min: 11, max: 70 });
  assert.ok(watchingRange(50).max < 50, "never reaches the member limit");
  assert.ok(watchingRange(3).max >= 3 && watchingRange(1).min >= 2, "tiny limits still give a sane range");
});

test("busy in the evening, quiet before dawn", () => {
  assert.ok(activityAt(21.5) > 0.99);
  assert.ok(activityAt(9.5) < 0.05);
  assert.ok(siteWatching(at(22), IST) > siteWatching(at(5), IST) + 12);
});

test("always inside the range for the open spots, all week, at any moment", () => {
  for (const spots of [20, 50, 120]) {
    const { min, max } = watchingRange(spots);
    for (let minutes = 0; minutes < 7 * 24 * 60; minutes += 13) {
      const now = new Date(Date.UTC(2026, 5, 15, 0, minutes));
      const n = siteWatching(now, { maxMembers: spots, timezone: "Asia/Kolkata" });
      assert.ok(n >= min && n <= max, `${n} outside ${min}-${max} for ${spots} spots at ${now.toISOString()}`);
    }
  }
});

test("more open spots means bigger numbers, with nothing changed by hand", () => {
  const now = at(22);
  assert.ok(siteWatching(now, { maxMembers: 200, timezone: "Asia/Kolkata" }) > siteWatching(now, IST) * 2);
});

test("it follows the viewer's own clock: the same instant is busy in one place and quiet in another", () => {
  const instant = at(22); // 22:00 in India = 16:30 UTC = 12:30 in New York
  const india = siteWatching(instant, { maxMembers: 50, timezone: "Asia/Kolkata" });
  const newYork = siteWatching(instant, { maxMembers: 50, timezone: "America/New_York" });
  assert.ok(india > newYork + 8, `${india} vs ${newYork}`);
});

test("Friday to Sunday is a little livelier than the middle of the week", () => {
  const friday = siteWatching(at(22, 0, 19), IST);
  const monday = siteWatching(at(22, 0, 15), IST);
  assert.ok(friday >= monday, `${friday} vs ${monday}`);
});

test("moves gradually, not in jumps", () => {
  let previous = siteWatching(at(21), IST);
  for (let seconds = 10; seconds < 1800; seconds += 10) {
    const n = siteWatching(new Date(at(21).getTime() + seconds * 1000), IST);
    assert.ok(Math.abs(n - previous) <= 2, `${previous} -> ${n} after ${seconds}s`);
    previous = n;
  }
});

test("each anime shows its own number, never above the site total, and airing ones are larger", () => {
  const now = at(22);
  const total = siteWatching(now, IST);
  const ids = ["anilist~21", "anilist~1535", "anilist~16498", "anilist~101922", "anilist~5114", "anilist~9253"];
  const seen = new Set<number>();
  let airingAtLeastAsLarge = 0;
  for (const id of ids) {
    const n = animeWatching(id, now, IST);
    assert.ok(n >= 2 && n <= total, `${id}: ${n} of ${total}`);
    seen.add(n);
    if (animeWatching(id, now, IST, { airing: true }) >= n) airingAtLeastAsLarge++;
  }
  assert.ok(seen.size >= 3, "titles do not all show the same number");
  assert.equal(airingAtLeastAsLarge, ids.length);
  // over many titles an airing one is never smaller than a finished one at the same moment
  for (let i = 0; i < 60; i++) {
    const id = `anilist~${i * 53 + 7}`;
    assert.ok(animeWatching(id, now, IST, { airing: true }) >= animeWatching(id, now, IST), id);
  }
  assert.equal(animeWatching("anilist~21", now, IST), animeWatching("anilist~21", now, IST), "stable for a given moment");
});

test("even the quietest hour never shows a lonely 1 on a title", () => {
  const quiet = at(9, 30);
  for (let i = 0; i < 40; i++) assert.ok(animeWatching(`anilist~${i * 37}`, quiet, IST) >= 2);
});

test("a bad or missing time zone falls back instead of crashing", () => {
  assert.ok(Number.isFinite(siteWatching(at(22), { maxMembers: 50, timezone: "Not/AZone" })));
  assert.ok(Number.isFinite(siteWatching(at(22), { maxMembers: 50 })));
});

test("the only counter setting left is on or off; old manual numbers are dropped", () => {
  assert.deepEqual(sanitizeSettings({ watching: { enabled: false, min: 4, max: 20, timezone: "Asia/Kolkata" } }), { watching: { enabled: false } });
  assert.deepEqual(sanitizeSettings({ watching: { min: 4 } }), {});
  assert.deepEqual(sanitizeSettings({ maxMembers: "50", revoked: [3, "x", 3, -1, 7.4] }), { revoked: [3, 7] });
  assert.deepEqual(sanitizeSettings({ maxMembers: 80.4 }), { maxMembers: 80 });
  assert.deepEqual(sanitizeSettings(null), {});
});
