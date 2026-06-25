import { decryptEmbed } from "./lib/anime/reanime-decrypt";

const REANIME_BASE = "https://reanime.to";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, */*",
};

async function findReanimeSlug(title: string): Promise<string> {
  const url = `${REANIME_BASE}/api/search?q=${encodeURIComponent(title)}&limit=5`;
  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json() as any;
  const results = Array.isArray(data) ? data : data.results ?? data.data ?? [];
  return results[0].anime_id ?? results[0].slug ?? results[0].id;
}

async function getFreshUrl() {
  const anilistId = "180745";
  const title = "Classroom of the Elite 4th Season: Second Year, First Semester";
  const episodeNum = 15;
  const slug = await findReanimeSlug(title);

  const watchUrl = `${REANIME_BASE}/api/watch/${slug}/${episodeNum}`;
  const flixUrl = `${REANIME_BASE}/api/flix/${anilistId}/${episodeNum}`;

  const [watchRes, flixRes] = await Promise.all([
    fetch(watchUrl, { headers: HEADERS }).then(r => r.json()),
    fetch(flixUrl, { headers: HEADERS }).then(r => r.json())
  ]);

  const links = [...(watchData()?.episode_links ?? [])];
  function watchData() { return watchRes; }

  if (flixRes?.success && flixRes?.servers) {
    const existingIds = new Set(links.map(l => l.$id));
    for (const server of flixRes.servers) {
      if (!existingIds.has(server.$id)) links.push(server);
    }
  }

  const p = ["sub", "s-sub"];
  const serverPriority: Record<string, number> = { "HD-2": 0, "HD-1": 1 };
  const filteredLinks = links
    .filter(l => p.includes(l.dataType))
    .sort((a, b) => (serverPriority[a.serverName] ?? 9) - (serverPriority[b.serverName] ?? 9));

  const chosenServer = filteredLinks[0];
  const embedRes = await fetch(chosenServer.dataLink, {
    headers: { ...HEADERS, Referer: `${REANIME_BASE}/` }
  });
  const html = await embedRes.text();
  const decrypted = await decryptEmbed(html);
  return decrypted.url;
}

async function testFetch(url: string, referer: string | null) {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (referer) headers["Referer"] = referer;

  console.log(`Fetching HLS manifest with Referer: "${referer}"`);
  try {
    const res = await fetch(url, { headers });
    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers.get("content-type"));
    const text = await res.text();
    console.log("Body preview:", text.slice(0, 200));
  } catch (e) {
    console.error("Fetch failed:", e);
  }
  console.log("---");
}

async function main() {
  try {
    const url = await getFreshUrl();
    console.log("Fresh HLS URL:", url);
    console.log("Testing fetches directly from this process...");
    await testFetch(url, "https://flixcloud.cc/");
    await testFetch(url, "https://reanime.to/");
    await testFetch(url, "https://tatakai-anivexa.tatakai-anime.workers.dev/");
    await testFetch(url, null);
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
