import assert from "node:assert/strict";
import test from "node:test";
import { fromAnilistListStatus } from "../lib/anilist/list-status.ts";

test("maps AniList list statuses to the details-page statuses", () => {
  assert.equal(fromAnilistListStatus("CURRENT"), "WATCHING");
  assert.equal(fromAnilistListStatus("REPEATING"), "WATCHING");
  assert.equal(fromAnilistListStatus("COMPLETED"), "COMPLETED");
  assert.equal(fromAnilistListStatus("PAUSED"), "ON_HOLD");
  assert.equal(fromAnilistListStatus("DROPPED"), "DROPPED");
  assert.equal(fromAnilistListStatus("PLANNING"), "PLAN_TO_WATCH");
});
