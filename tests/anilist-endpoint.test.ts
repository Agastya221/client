import assert from "node:assert/strict";
import test from "node:test";
import { ANILIST_DIRECT_URL, anilistFetch, anilistProxyUrl } from "../lib/anilist/endpoint.ts";

type Call = { url: string; init: RequestInit };

function withStubbedFetch(run: (calls: Call[]) => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("{}");
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = original;
  });
}

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  return run().finally(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

test("goes straight to AniList when no proxy is configured", async () => {
  await withEnv({ ANILIST_PROXY_URL: undefined, ANILIST_PROXY_KEY: undefined }, () =>
    withStubbedFetch(async (calls) => {
      await anilistFetch({ method: "POST", body: "{}" });
      assert.equal(calls[0].url, ANILIST_DIRECT_URL);
      assert.equal(new Headers(calls[0].init.headers).has("x-proxy-key"), false);
    }),
  );
});

test("uses the proxy and sends the shared key when configured", async () => {
  await withEnv(
    { ANILIST_PROXY_URL: "https://proxy.example/anilist", ANILIST_PROXY_KEY: "s3cret" },
    () =>
      withStubbedFetch(async (calls) => {
        await anilistFetch({ method: "POST", headers: { Authorization: "Bearer t" }, body: "{}" });
        assert.equal(calls[0].url, "https://proxy.example/anilist");
        const headers = new Headers(calls[0].init.headers);
        assert.equal(headers.get("x-proxy-key"), "s3cret");
        // The caller's own headers (e.g. a user's AniList token) must survive.
        assert.equal(headers.get("Authorization"), "Bearer t");
      }),
  );
});

test("a proxy without a key still routes there rather than falling back to AniList", async () => {
  await withEnv({ ANILIST_PROXY_URL: "https://proxy.example/anilist", ANILIST_PROXY_KEY: undefined }, () =>
    withStubbedFetch(async (calls) => {
      await anilistFetch({ method: "POST", body: "{}" });
      assert.equal(calls[0].url, "https://proxy.example/anilist");
      assert.equal(new Headers(calls[0].init.headers).has("x-proxy-key"), false);
    }),
  );
});

test("blank or whitespace-only proxy urls count as unset", () => {
  assert.equal(anilistProxyUrl({ ANILIST_PROXY_URL: "   " }), null);
  assert.equal(anilistProxyUrl({}), null);
  assert.equal(anilistProxyUrl({ ANILIST_PROXY_URL: " https://p/anilist " }), "https://p/anilist");
});
