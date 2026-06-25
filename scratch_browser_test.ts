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

async function main() {
  try {
    const url = await getFreshUrl();
    console.log("FRESH_URL_FOR_BROWSER:", url);
  } catch (e) {
    console.error(e);
  }
}

main();
