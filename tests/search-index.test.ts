import assert from "node:assert/strict";
import test from "node:test";
import { indexEntries, matchSearchIndex, normalizeSearchText, type Row } from "../lib/search-index.ts";
import { searchStoreKey } from "../lib/stream-store.ts";

const row = (id: number, romaji: string, english: string | 0 = 0, synonyms: string[] = []): Row =>
  [id, romaji, english, synonyms, `bx${id}.jpg`, 0, "TV", "FINISHED", 2010, 12, ["Action"], 80];
// In popularity order, like the real file.
const index = indexEntries({ v: 1, coverPrefix: "https://cdn/cover/", rows: [
  row(16498, "Shingeki no Kyojin", "Attack on Titan", ["AoT"]),
  row(101922, "Kimetsu no Yaiba", "Demon Slayer: Kimetsu no Yaiba"),
  row(20, "NARUTO", "Naruto"),
  row(1735, "Naruto: Shippuuden", "Naruto Shippuden"),
  row(1535, "DEATH NOTE", "Death Note"),
  row(97986, "Boruto: Naruto Next Generations", "Boruto"),
  row(154587, "Sousou no Frieren", "Frieren: Beyond Journey’s End"),
  row(5, "Onigiri"),
]});
const ids = (q: string) => matchSearchIndex(index, q).map((media) => media.id);

test("exact titles come first, in any casing or spacing", () => {
  assert.equal(ids("naruto")[0], 20);
  assert.equal(ids("  NARUTO ")[0], 20);
  assert.equal(ids("death note")[0], 1535);
  assert.equal(ids("attack on titan")[0], 16498);
});

test("English, Japanese and short names all find the title", () => {
  assert.equal(ids("demon slayer")[0], 101922);
  assert.equal(ids("kimetsu")[0], 101922);
  assert.equal(ids("aot")[0], 16498);
  assert.equal(ids("frieren")[0], 154587);
  assert.ok(!ids("demon slayer").includes(5), "no unrelated title");
});

test("partial typing and related titles", () => {
  assert.equal(ids("narut")[0], 20, "while typing");
  assert.deepEqual(ids("naruto").slice(0, 3), [20, 1735, 97986]);
  assert.equal(ids("shippuden")[0], 1735, "a word inside the title");
  assert.deepEqual(ids("zzzz"), []);
  assert.deepEqual(ids(""), []);
});

test("index entries carry what the dropdown and cards need", () => {
  const [media] = matchSearchIndex(index, "attack on titan");
  assert.equal(media.title.english, "Attack on Titan");
  assert.equal(media.coverImage.large, "https://cdn/cover/large/bx16498.jpg");
  assert.equal(media.coverImage.medium, "https://cdn/cover/medium/bx16498.jpg");
  assert.equal(media.seasonYear, 2010);
  assert.equal(normalizeSearchText("Frieren: Beyond Journey’s End"), "frieren beyond journey s end");
});

test("search cache keys ignore casing and spacing and are valid store keys", () => {
  const a = searchStoreKey({ q: "Naruto ", page: 1, suggest: true });
  assert.equal(a, searchStoreKey({ q: "naruto", page: 1, suggest: true }));
  assert.notEqual(a, searchStoreKey({ q: "naruto", page: 1, suggest: false }));
  assert.ok(a.startsWith("stream-link:search:v1:"));
  assert.ok(!/[\s*?[\]\\]/.test(a) && a.length <= 300);
});
