import assert from "node:assert/strict";
import test from "node:test";

function installSessionStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          values.set(key, value);
        },
        removeItem(key: string) {
          values.delete(key);
        },
      },
    },
  });
}

test("reuses a cached AniList entry without another details-page request", async () => {
  installSessionStorage();
  const {
    configureAnilistListEntryCache,
    deleteCachedAnilistListEntry,
    readCachedAnilistListEntry,
    writeCachedAnilistListEntry,
  } = await import("../lib/anilist/list-entry-client.ts");

  configureAnilistListEntryCache("user-one");
  assert.equal(readCachedAnilistListEntry(182205), null);

  writeCachedAnilistListEntry(182205, {
    id: 99,
    status: "WATCHING",
    progress: 2,
    score: null,
  });

  assert.deepEqual(readCachedAnilistListEntry(182205), {
    entry: {
      id: 99,
      status: "WATCHING",
      progress: 2,
      score: null,
    },
  });

  deleteCachedAnilistListEntry(182205);
  assert.equal(readCachedAnilistListEntry(182205), null);
});

test("keeps cached list state isolated per signed-in user", async () => {
  installSessionStorage();
  const {
    configureAnilistListEntryCache,
    readCachedAnilistListEntry,
    writeCachedAnilistListEntry,
  } = await import("../lib/anilist/list-entry-client.ts");

  configureAnilistListEntryCache("user-alpha");
  writeCachedAnilistListEntry(21, {
    id: 1,
    status: "COMPLETED",
    progress: 1122,
    score: null,
  });

  configureAnilistListEntryCache("user-beta");
  assert.equal(readCachedAnilistListEntry(21), null);

  writeCachedAnilistListEntry(21, null);
  assert.deepEqual(readCachedAnilistListEntry(21), { entry: null });
});
