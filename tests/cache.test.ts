import assert from "node:assert/strict";
import test from "node:test";
import {
  cacheFetch,
  cacheInvalidate,
  cacheStats,
  cacheStore,
} from "../lib/cache";

test("cacheFetch serves repeat reads from the in-memory L1 cache", async () => {
  const key = `test-cache:memory-hit:${Date.now()}:${Math.random()}`;
  cacheInvalidate(key);
  let fetchCount = 0;

  const first = await cacheFetch(key, async () => {
    fetchCount += 1;
    return { value: "first" };
  });
  const second = await cacheFetch(key, async () => {
    fetchCount += 1;
    return { value: "second" };
  });

  assert.deepEqual(first, { value: "first" });
  assert.deepEqual(second, { value: "first" });
  assert.equal(fetchCount, 1);
  assert.equal(cacheStats().mode, "memory+cloudflare-kv");
});

test("cacheStore immediately warms memory without waiting for KV", async () => {
  const key = `test-cache:manual-store:${Date.now()}:${Math.random()}`;
  cacheInvalidate(key);
  cacheStore(key, { value: "warm" });
  let fetchCount = 0;

  const result = await cacheFetch(key, async () => {
    fetchCount += 1;
    return { value: "origin" };
  });

  assert.deepEqual(result, { value: "warm" });
  assert.equal(fetchCount, 0);
});
