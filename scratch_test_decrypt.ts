import { decryptEmbed } from "./lib/anime/reanime-decrypt.ts";

const REANIME_BASE = "https://reanime.to";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, */*",
};

async function findReanimeSlug(title: string): Promise<string> {
  const url = `${REANIME_BASE}/api/search?q=${encodeURIComponent(title)}&limit=5`;
  console.log("Searching ReAnime slug for title:", title, "at", url);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json() as any;
  const results = Array.isArray(data) ? data : data.results ?? data.data ?? [];
  if (!results.length) throw new Error(`No search results for "${title}"`);
  
  const winner = results[0];
  const slug = winner.anime_id ?? winner.slug ?? winner.id;
  if (!slug) throw new Error("No slug found in search result");
  return slug;
}

async function resolveDirectHls(anilistId: string, title: string, episodeNum: number, audio: "sub" | "dub") {
  const slug = await findReanimeSlug(title);
  console.log("Found ReAnime slug:", slug);

  const watchUrl = `${REANIME_BASE}/api/watch/${slug}/${episodeNum}`;
  const flixUrl = `${REANIME_BASE}/api/flix/${anilistId}/${episodeNum}`;

  console.log("Fetching watch and flix endpoints concurrently...");
  const [watchRes, flixRes] = await Promise.allSettled([
    fetch(watchUrl, { headers: HEADERS }).then(r => {
      if (!r.ok) throw new Error(`watch: ${r.status}`);
      return r.json();
    }),
    fetch(flixUrl, { headers: HEADERS }).then(r => {
      if (!r.ok) throw new Error(`flix: ${r.status}`);
      return r.json();
    })
  ]);

  const watchData = watchRes.status === "fulfilled" ? watchRes.value : null;
  const flixData = flixRes.status === "fulfilled" ? flixRes.value : null;

  const links = [...(watchData?.episode_links ?? [])];
  if (flixData?.success && flixData?.servers) {
    const existingIds = new Set(links.map(l => l.$id));
    for (const server of flixData.servers) {
      if (!existingIds.has(server.$id)) {
        links.push(server);
      }
    }
  }

  const p = audio === "sub" ? ["sub", "s-sub"] : ["dub", "s-dub"];
  const serverPriority: Record<string, number> = { "HD-2": 0, "HD-1": 1 };
  
  const filteredLinks = links
    .filter(l => p.includes(l.dataType))
    .sort((a, b) => (serverPriority[a.serverName] ?? 9) - (serverPriority[b.serverName] ?? 9));

  if (!filteredLinks.length) {
    throw new Error(`No ${audio} servers found for ${title} Ep ${episodeNum}`);
  }

  const chosenServer = filteredLinks[0];
  console.log("Chosen Server:", chosenServer.serverName, "DataLink:", chosenServer.dataLink);

  console.log("Fetching chosen embed page to extract obfuscated payload...");
  const embedRes = await fetch(chosenServer.dataLink, {
    headers: { ...HEADERS, Referer: `${REANIME_BASE}/` }
  });
  if (!embedRes.ok) throw new Error(`Embed fetch failed: ${embedRes.status}`);

  const html = await embedRes.text();
  console.log("Decrypting embed payload...");
  const decrypted = await decryptEmbed(html);
  
  console.log("\n--- Decryption Successful! ---");
  console.log("Decrypted Stream URL:", decrypted.url);
  console.log("Subtitles Count:", decrypted.subtitles?.length || 0);
  console.log("-------------------------------\n");

  return decrypted.url;
}

async function main() {
  const anilistId = "180745";
  const title = "Classroom of the Elite 4th Season: Second Year, First Semester";
  const episode = 15;
  const audio = "sub";

  try {
    const streamUrl = await resolveDirectHls(anilistId, title, episode, audio);
    
    // Now let's try fetching it through our local Next.js proxy
    const localProxyUrl = `http://localhost:3000/api/proxy/m3u8-streaming-proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent("https://reanime.to/")}`;
    console.log("Fetching local proxy URL:", localProxyUrl);
    const proxyRes = await fetch(localProxyUrl);
    console.log("Local Proxy Status:", proxyRes.status);
    console.log("Local Proxy Headers:", Object.fromEntries(proxyRes.headers.entries()));
    const body = await proxyRes.text();
    console.log("Local Proxy Body preview:\n", body.slice(0, 500));
  } catch (e) {
    console.error("Execution failed:", e);
  }
}

main();
