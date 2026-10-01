/**
 * Builds public/search-index.json: the most popular anime titles from AniList, so the search box
 * can suggest instantly in the browser without asking AniList (whose per-address rate limit the
 * whole site shares through Render). Run by hand now and then: `node scripts/build-search-index.mjs [count]`.
 * It calls AniList directly from this machine, slowly, so it never uses the site's allowance.
 *
 * Row: [id, romaji, english, synonyms, cover file, color, format, status, year, episodes, genres, score]
 */
import { writeFileSync } from "node:fs";

const TOTAL = Number(process.argv[2] || 5000);
const PER_PAGE = 50;
const COVER_PREFIX = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/";
const QUERY = `query ($page: Int) { Page(page: $page, perPage: ${PER_PAGE}) { pageInfo { hasNextPage }
  media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
    id title { romaji english } synonyms coverImage { large color } format status seasonYear startDate { year }
    episodes genres averageScore } } }`;

const latin = (s) => /^[\x20-\x7EÀ-ɏ‘-‟]+$/.test(s);
const rows = [];
for (let page = 1; rows.length < TOTAL; page += 1) {
  let data;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { page } }),
    });
    if (res.ok) { data = (await res.json()).data.Page; break; }
    const wait = Number(res.headers.get("retry-after") || 30) * 1000;
    console.log(`page ${page}: ${res.status}, waiting ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!data) throw new Error(`page ${page} failed`);
  for (const m of data.media) {
    const cover = m.coverImage?.large || "";
    rows.push([
      m.id,
      m.title.romaji || "",
      m.title.english && m.title.english !== m.title.romaji ? m.title.english : 0,
      (m.synonyms || []).filter(latin).slice(0, 1),
      cover.startsWith(COVER_PREFIX + "large/") ? cover.slice((COVER_PREFIX + "large/").length) : cover,
      0, // colour: not needed for suggestions, saves space
      m.format || 0,
      m.status || 0,
      m.seasonYear || m.startDate?.year || 0,
      m.episodes || 0,
      (m.genres || []).slice(0, 1),
      0, // score: AniList's full answer fills it on the results page
    ]);
  }
  process.stdout.write(`\rpage ${page}: ${rows.length} titles`);
  if (!data.pageInfo.hasNextPage) break;
  await new Promise((r) => setTimeout(r, 2200));
}
// ~5,000 titles is about 300 KB compressed, loaded once when the search box is first used.
const out = JSON.stringify({ v: 1, builtAt: new Date().toISOString().slice(0, 10), coverPrefix: COVER_PREFIX, rows: rows.slice(0, TOTAL) });
writeFileSync(new URL("../public/search-index.json", import.meta.url), out);
console.log(`\nwrote ${rows.length} titles, ${(out.length / 1024).toFixed(0)} KB`);
