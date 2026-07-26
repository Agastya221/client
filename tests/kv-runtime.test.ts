import assert from "node:assert/strict";
import test from "node:test";
import { isKvConfigured, isKvRuntimeEnabled } from "../lib/cache/kv";

const ENV_KEYS = [
  "NODE_ENV",
  "NEXT_PHASE",
  "npm_lifecycle_event",
  "NEXT_PUBLIC_SITE_URL",
  "CF_KV_ACCOUNT_ID",
  "CF_KV_NAMESPACE_ID",
  "CF_KV_API_TOKEN",
  "CF_KV_ENABLED",
  "CF_KV_ALLOW_LOCAL",
  "CF_KV_ALLOW_BUILD",
] as const;

async function withEnvironment(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => void | Promise<void>,
): Promise<void> {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) Reflect.set(process.env, key, value);
  }

  try {
    await run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else Reflect.set(process.env, key, value);
    }
  }
}

test("KV stays disabled during local development even when production credentials exist", async () => {
  await withEnvironment({
    NODE_ENV: "development",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    CF_KV_ACCOUNT_ID: "account",
    CF_KV_NAMESPACE_ID: "namespace",
    CF_KV_API_TOKEN: "token",
  }, () => {
    assert.equal(isKvRuntimeEnabled(), false);
    assert.equal(isKvConfigured(), false);
  });
});

test("KV stays disabled during next build", async () => {
  await withEnvironment({
    NODE_ENV: "production",
    NEXT_PHASE: "phase-production-build",
    NEXT_PUBLIC_SITE_URL: "https://anime.example",
    CF_KV_ACCOUNT_ID: "account",
    CF_KV_NAMESPACE_ID: "namespace",
    CF_KV_API_TOKEN: "token",
  }, () => {
    assert.equal(isKvRuntimeEnabled(), false);
    assert.equal(isKvConfigured(), false);
  });
});

test("KV is enabled in production runtime when credentials are complete", async () => {
  await withEnvironment({
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://anime.example",
    CF_KV_ACCOUNT_ID: "account",
    CF_KV_NAMESPACE_ID: "namespace",
    CF_KV_API_TOKEN: "token",
  }, () => {
    assert.equal(isKvRuntimeEnabled(), true);
    assert.equal(isKvConfigured(), true);
  });
});

test("local KV access requires the explicit opt-in", async () => {
  await withEnvironment({
    NODE_ENV: "development",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    CF_KV_ACCOUNT_ID: "account",
    CF_KV_NAMESPACE_ID: "namespace",
    CF_KV_API_TOKEN: "token",
    CF_KV_ALLOW_LOCAL: "true",
  }, () => {
    assert.equal(isKvRuntimeEnabled(), true);
    assert.equal(isKvConfigured(), true);
  });
});
