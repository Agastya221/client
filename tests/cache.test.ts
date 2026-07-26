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

test("cacheFetch serves stale data without rewriting it before hard expiry", async () => {
  const key = `test-cache:stale-hit:${Date.now()}:${Math.random()}`;
  let fetchCount = 0;
  const options = {
    freshMs: 1,
    staleMs: 1_000,
    expireMs: 1_000,
    persistent: false,
  };

  const first = await cacheFetch(key, async () => {
    fetchCount += 1;
    return { value: fetchCount };
  }, options);

  await new Promise((resolve) => setTimeout(resolve, 10));

  const stale = await cacheFetch(key, async () => {
    fetchCount += 1;
    return { value: fetchCount };
  }, options);

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(first, { value: 1 });
  assert.deepEqual(stale, { value: 1 });
  assert.equal(fetchCount, 1);
});

test("memory-only cache entries never call the persistent KV transport", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    nodeEnv: process.env.NODE_ENV,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    accountId: process.env.CF_KV_ACCOUNT_ID,
    namespaceId: process.env.CF_KV_NAMESPACE_ID,
    apiToken: process.env.CF_KV_API_TOKEN,
  };
  let transportCalls = 0;

  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.NEXT_PUBLIC_SITE_URL = "https://anime.example";
  process.env.CF_KV_ACCOUNT_ID = "account";
  process.env.CF_KV_NAMESPACE_ID = "namespace";
  process.env.CF_KV_API_TOKEN = "token";
  globalThis.fetch = (async () => {
    transportCalls += 1;
    throw new Error("KV transport must not be called");
  }) as typeof fetch;

  try {
    const key = `test-cache:memory-only:${Date.now()}:${Math.random()}`;
    const value = await cacheFetch(
      key,
      async () => ({ value: "local" }),
      { persistent: false },
    );

    assert.deepEqual(value, { value: "local" });
    assert.equal(transportCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      NODE_ENV: originalEnv.nodeEnv,
      NEXT_PUBLIC_SITE_URL: originalEnv.siteUrl,
      CF_KV_ACCOUNT_ID: originalEnv.accountId,
      CF_KV_NAMESPACE_ID: originalEnv.namespaceId,
      CF_KV_API_TOKEN: originalEnv.apiToken,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
