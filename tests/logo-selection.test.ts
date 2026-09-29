import assert from "node:assert/strict";
import test from "node:test";
import { selectFanartLogos } from "../lib/anilist/logo-selection.ts";

const EN = "https://assets.fanart.tv/fanart/en-logo.png";
const JA = "https://assets.fanart.tv/fanart/ja-logo.png";

test("an English logo wins even when a Japanese one is far more popular", () => {
  const selection = selectFanartLogos({
    hdtvlogo: [
      { url: JA, lang: "ja", likes: "99" },
      { url: EN, lang: "en", likes: "1" },
    ],
  });

  assert.equal(selection.english?.url, EN);
  assert.equal(selection.best?.url, EN);
});

test("no English logo leaves `english` null so ani.zip can win instead", () => {
  // This is the Mushoku Tensei regression: when `english` is null the caller
  // must fall back to the ani.zip clearlogo rather than to this Japanese logo.
  const selection = selectFanartLogos({
    hdtvlogo: [{ url: JA, lang: "ja", likes: "99" }],
  });

  assert.equal(selection.english, null);
  assert.equal(selection.best?.url, JA);
  assert.equal(selection.best?.language, "ja");
});

test("an empty payload selects nothing", () => {
  assert.deepEqual(selectFanartLogos({}), { english: null, best: null });
  assert.deepEqual(selectFanartLogos({ hdtvlogo: [], clearlogo: [] }), {
    english: null,
    best: null,
  });
});

test("non-https and malformed logo urls are discarded", () => {
  const selection = selectFanartLogos({
    hdtvlogo: [
      { url: "http://assets.fanart.tv/fanart/insecure.png", lang: "en", likes: "50" },
      { url: "not a url", lang: "en", likes: "50" },
      { url: undefined, lang: "en", likes: "50" },
    ],
  });

  assert.equal(selection.english, null);
  assert.equal(selection.best, null);
});

test("likes break ties within the same language", () => {
  const selection = selectFanartLogos({
    hdtvlogo: [
      { url: "https://assets.fanart.tv/fanart/en-low.png", lang: "en", likes: "2" },
      { url: EN, lang: "en", likes: "40" },
    ],
  });

  assert.equal(selection.english?.url, EN);
});

test("clearlogo entries are considered alongside hdtvlogo", () => {
  const selection = selectFanartLogos({
    hdtvlogo: [{ url: JA, lang: "ja", likes: "99" }],
    clearlogo: [{ url: EN, lang: "en", likes: "0" }],
  });

  assert.equal(selection.english?.url, EN);
  assert.equal(selection.best?.url, EN);
});

test("an untagged logo ranks below every preferred language", () => {
  const selection = selectFanartLogos({
    hdtvlogo: [
      { url: "https://assets.fanart.tv/fanart/unknown.png", lang: "xx", likes: "99" },
      { url: JA, lang: "ja", likes: "0" },
    ],
  });

  assert.equal(selection.best?.url, JA);
  assert.equal(selection.english, null);
});
