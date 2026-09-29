import assert from "node:assert/strict";
import test from "node:test";
import { isKvConfigured, kvDelete, kvDeletePrefix, kvGet, kvSet } from "../lib/cache/kv.ts";

const CONTEXT_KEY = Symbol.for("__cloudflare-context__");

class FakeKv {
  store = new Map<string, { value: string; ttl?: number }>();
  async get(key: string) {
    return this.store.get(key)?.value ?? null;
  }
  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    this.store.set(key, { value, ttl: options?.expirationTtl });
  }
  async delete(key: string) {
    this.store.delete(key);
  }
  // Like real KV, the cursor marks a key position (the last key returned), so
  // deleting keys between pages does not shift or skip later entries.
  async list({ prefix = "", limit = 1000, cursor }: { prefix?: string; limit?: number; cursor?: string }) {
    const names = [...this.store.keys()]
      .filter((name) => name.startsWith(prefix) && (cursor === undefined || name > cursor))
      .sort();
    const page = names.slice(0, limit);
    const done = names.length <= limit;
    return { keys: page.map((name) => ({ name })), list_complete: done, cursor: done ? undefined : page[page.length - 1] };
  }
}

async function inWorker(kv: FakeKv | null, run: () => Promise<void>) {
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const env = process.env as Record<string, string | undefined>;
  const saved = {
    context: globals[CONTEXT_KEY],
    node: env.NODE_ENV,
    site: env.NEXT_PUBLIC_SITE_URL,
    lifecycle: env.npm_lifecycle_event,
    phase: env.NEXT_PHASE,
    token: env.CF_KV_API_TOKEN,
  };
  env.NODE_ENV = "production";
  env.NEXT_PUBLIC_SITE_URL = "https://example.workers.dev";
  delete env.npm_lifecycle_event; // `npm test` would otherwise look like a build
  delete env.NEXT_PHASE;
  delete env.CF_KV_API_TOKEN;
  globals[CONTEXT_KEY] = kv ? { env: { APP_CACHE_KV: kv }, ctx: {}, cf: {} } : undefined;
  try {
    await run();
  } finally {
    globals[CONTEXT_KEY] = saved.context;
    env.NODE_ENV = saved.node;
    env.NEXT_PUBLIC_SITE_URL = saved.site;
    env.npm_lifecycle_event = saved.lifecycle;
    env.NEXT_PHASE = saved.phase;
    env.CF_KV_API_TOKEN = saved.token;
  }
}

test("uses the native binding with no REST token configured", async () => {
  await inWorker(new FakeKv(), async () => {
    assert.equal(isKvConfigured(), true);
  });
});

test("round-trips JSON through the binding and honours the 60s TTL floor", async () => {
  const kv = new FakeKv();
  await inWorker(kv, async () => {
    await kvSet("anilist:trending", { a: 1 }, 5);
    assert.deepEqual(await kvGet("anilist:trending"), { a: 1 });
    assert.equal(kv.store.get("anilist:trending")?.ttl, 60);
    await kvSet("anilist:seasonal", { b: 2 }, 3600);
    assert.equal(kv.store.get("anilist:seasonal")?.ttl, 3600);
  });
});

test("a miss returns null and delete removes the key", async () => {
  const kv = new FakeKv();
  await inWorker(kv, async () => {
    assert.equal(await kvGet("nope"), null);
    await kvSet("k", 1, 120);
    await kvDelete("k");
    assert.equal(await kvGet("k"), null);
  });
});

test("deletePrefix removes only matching keys, across pages", async () => {
  const kv = new FakeKv();
  await inWorker(kv, async () => {
    for (let i = 0; i < 2500; i += 1) await kvSet(`stream:${i}`, i, 120);
    await kvSet("anilist:keep", "x", 120);
    await kvDeletePrefix("stream:");
    assert.equal([...kv.store.keys()].some((key) => key.startsWith("stream:")), false);
    assert.equal(await kvGet("anilist:keep"), "x");
  });
});

test("outside a Worker with no REST credentials the cache is simply off", async () => {
  await inWorker(null, async () => {
    assert.equal(isKvConfigured(), false);
    assert.equal(await kvGet("anything"), null);
  });
});
