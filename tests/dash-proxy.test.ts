import assert from "node:assert/strict";
import test from "node:test";
import {
  createDashProxyToken,
  isAllowedDashAsset,
  readDashProxyToken,
} from "../lib/anime/dash-proxy";

test("DASH proxy sessions protect headers and restrict asset hosts", () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "dash-proxy-test-secret";
  try {
    const manifest = "https://media.animeonsen.xyz/show/episode.mpd";
    const token = createDashProxyToken(manifest, "Bearer private-token", "https://www.animeonsen.xyz/");
    const session = readDashProxyToken(token);
    assert.equal(session?.authorization, "Bearer private-token");
    assert.equal(token.includes("private-token"), false);
    assert.equal(readDashProxyToken(`${token.slice(0, -2)}xx`), null);
    assert.equal(isAllowedDashAsset(new URL("https://media.animeonsen.xyz/show/seg-1.m4s"), manifest), true);
    assert.equal(isAllowedDashAsset(new URL("https://cdn.animeonsen.xyz/show/seg-1.m4s"), manifest), true);
    assert.equal(isAllowedDashAsset(new URL("https://example.com/seg-1.m4s"), manifest), false);
    assert.equal(isAllowedDashAsset(new URL("http://localhost/seg-1.m4s"), manifest), false);
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});
