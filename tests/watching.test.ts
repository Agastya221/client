import assert from "node:assert/strict";
import test from "node:test";
import { activityAt, siteWatching, WATCHING_MAX, WATCHING_MIN, type WatchingModel } from "../lib/watching.ts";
import { sanitizeSettings } from "../lib/access/settings.ts";

const IST: WatchingModel = { timezone: "Asia/Kolkata" };
// A weekday (Monday 15 June 2026) at the given India time
const at = (hourIst: number, minute = 0, day = 15) => new Date(Date.UTC(2026, 5, day, hourIst - 5, minute - 30));

test("the number lives between 9 and 45 and never above 45", () => {
  assert.equal(WATCHING_MIN, 9);
  assert.equal(WATCHING_MAX, 45);
});

test("busy in the evening, quiet before dawn", () => {
  assert.ok(activityAt(21.5) > 0.99);
  assert.ok(activityAt(9.5) < 0.05);
  assert.ok(siteWatching(at(22), IST) > siteWatching(at(5), IST) + 12);
});

test("always inside the range, all week, at any moment, in any time zone", () => {
  for (const timezone of ["Asia/Kolkata", "America/New_York", "Pacific/Auckland", undefined]) {
    for (let minutes = 0; minutes < 7 * 24 * 60; minutes += 13) {
      const now = new Date(Date.UTC(2026, 5, 15, 0, minutes));
      const n = siteWatching(now, { timezone });
      assert.ok(n >= WATCHING_MIN && n <= WATCHING_MAX, `${n} outside ${WATCHING_MIN}-${WATCHING_MAX} at ${now.toISOString()}`);
    }
  }
});

test("the busiest evening gets close to the top, the quietest hour stays near the bottom", () => {
  assert.ok(siteWatching(at(21, 30, 19), IST) >= 38);
  assert.ok(siteWatching(at(9, 30), IST) <= 14);
});

test("it follows the viewer's own clock: the same instant is busy in one place and quiet in another", () => {
  const instant = at(22); // 22:00 in India = 16:30 UTC = 12:30 in New York
  const india = siteWatching(instant, { timezone: "Asia/Kolkata" });
  const newYork = siteWatching(instant, { timezone: "America/New_York" });
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

test("a bad or missing time zone falls back instead of crashing", () => {
  assert.ok(Number.isFinite(siteWatching(at(22), { timezone: "Not/AZone" })));
  assert.ok(Number.isFinite(siteWatching(at(22))));
});

test("the only counter setting left is on or off; old manual numbers are dropped", () => {
  assert.deepEqual(sanitizeSettings({ watching: { enabled: false, min: 4, max: 20, timezone: "Asia/Kolkata" } }), { watching: { enabled: false } });
  assert.deepEqual(sanitizeSettings({ watching: { min: 4 } }), {});
  assert.deepEqual(sanitizeSettings({ maxMembers: "50", revoked: [3, "x", 3, -1, 7.4] }), { revoked: [3, 7] });
  assert.deepEqual(sanitizeSettings({ maxMembers: 80.4 }), { maxMembers: 80 });
  assert.deepEqual(sanitizeSettings(null), {});
});
