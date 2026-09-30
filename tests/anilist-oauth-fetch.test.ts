import assert from "node:assert/strict";
import test from "node:test";
import { ANILIST_TOKEN_URL, anilistOAuthFetch } from "../lib/anilist/endpoint.ts";

type Call = { url: string; init?: RequestInit };

async function withFetch(env: Record<string, string | undefined>, run: (calls: Call[]) => Promise<void>) {
  const real = globalThis.fetch;
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) { saved[key] = process.env[key]; if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try { await run(calls); } finally {
    globalThis.fetch = real;
    for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}

const tokenBody = () => new URLSearchParams({ grant_type: "authorization_code", code: "abc", client_id: "1", redirect_uri: "https://x/cb" });

test("on the Worker, the token exchange goes through the Render proxy with the shared key", async () => {
  await withFetch({ ANILIST_PROXY_URL: "https://proxy.example/anilist", ANILIST_PROXY_KEY: "k123" }, async (calls) => {
    await anilistOAuthFetch(ANILIST_TOKEN_URL, { method: "POST", body: tokenBody(), headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://proxy.example/anilist/token");
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get("x-proxy-key"), "k123");
    assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded", "the form body is passed along untouched");
    assert.equal(String(calls[0].init?.body), tokenBody().toString());
  });
});

test("a trailing slash on the proxy address does not double up", async () => {
  await withFetch({ ANILIST_PROXY_URL: "https://proxy.example/anilist///", ANILIST_PROXY_KEY: "k" }, async (calls) => {
    await anilistOAuthFetch(ANILIST_TOKEN_URL, { method: "POST" });
    assert.equal(calls[0].url, "https://proxy.example/anilist/token");
  });
});

test("without a proxy (local development) it is a plain fetch to AniList", async () => {
  await withFetch({ ANILIST_PROXY_URL: undefined, ANILIST_PROXY_KEY: undefined }, async (calls) => {
    await anilistOAuthFetch(ANILIST_TOKEN_URL, { method: "POST", body: tokenBody() });
    assert.equal(calls[0].url, ANILIST_TOKEN_URL);
    assert.equal(new Headers(calls[0].init?.headers).get("x-proxy-key"), null, "no key leaks to AniList");
  });
});

test("only the token request is redirected; the proxy key is never sent anywhere else", async () => {
  await withFetch({ ANILIST_PROXY_URL: "https://proxy.example/anilist", ANILIST_PROXY_KEY: "secret-key" }, async (calls) => {
    await anilistOAuthFetch("https://anilist.co/api/v2/oauth/authorize", { method: "GET" });
    await anilistOAuthFetch(new URL("https://graphql.anilist.co"), { method: "POST" });
    assert.deepEqual(calls.map((c) => c.url), ["https://anilist.co/api/v2/oauth/authorize", "https://graphql.anilist.co/"]);
    for (const call of calls) assert.equal(new Headers(call.init?.headers).get("x-proxy-key"), null);
  });
});
