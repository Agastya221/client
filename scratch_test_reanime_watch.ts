/**
 * Debug: trace fetchReanimeDirectWatchSession step by step
 * Run: npx tsx --env-file=.env.local scratch_test_reanime_watch.ts
 */
import { decryptEmbed } from "./lib/anime/reanime-decrypt";

const ANIVEXA_WORKER_URL = process.env.NEXT_PUBLIC_ANIVEXA_WORKER_URL || process.env.ANIVEXA_WORKER_URL || "";
const ANILIST_ID = "180745";
const EP_NUM = 1;
const DUBBED = false;

async function main() {
  console.log("Worker URL:", ANIVEXA_WORKER_URL);
  if (!ANIVEXA_WORKER_URL) {
    console.error("No worker URL configured!");
    process.exit(1);
  }

  const audio = DUBBED ? "dub" : "sub";
  const workerUrl = `${ANIVEXA_WORKER_URL}/watch/reanime/${ANILIST_ID}/${audio}/reanime-${EP_NUM}`;
  console.log("\n1. Fetching worker URL:", workerUrl);

  let data: any;
  try {
    const res = await fetch(workerUrl, {
      headers: { Accept: "application/json", "User-Agent": "AnimeKAI-Frontend/1.0" },
      signal: AbortSignal.timeout(25_000),
    });
    console.log("   Status:", res.status);
    if (!res.ok) {
      const body = await res.text();
      console.error("   Error body:", body.slice(0, 300));
      return;
    }
    data = await res.json();
    console.log("   Response keys:", Object.keys(data));
    console.log("   allServers count:", Array.isArray(data.allServers) ? data.allServers.length : "N/A (not array)");
    console.log("   allServers:", JSON.stringify(data.allServers?.slice(0, 3), null, 2));
    console.log("   stream_url:", data.stream_url || "MISSING");
    console.log("   redirect_url:", data.redirect_url || "MISSING");
    console.log("   streams (first 2):", JSON.stringify((data.streams || []).slice(0, 2), null, 2));
  } catch (err) {
    console.error("   FETCH FAILED:", err);
    return;
  }

  const allServers: any[] = Array.isArray(data.allServers) ? data.allServers :
    Array.isArray(data.data?.allServers) ? data.data.allServers : [];

  const relevantServers = allServers.filter((s: any) => {
    const typeStr = (s.type || "sub").toLowerCase();
    const isDub = typeStr.includes("dub");
    return DUBBED === isDub;
  });

  console.log("\n2. Relevant servers for", audio, ":", relevantServers.length);
  relevantServers.forEach((s, i) => {
    console.log(`   [${i}] name=${s.name} type=${s.type} embed=${s.embed?.slice(0, 60)}...`);
  });

  const targetServer = relevantServers[0] ?? null;
  const embedUrl: string | undefined = targetServer?.embed;
  console.log("\n3. Target server:", targetServer ? `name=${targetServer.name} type=${targetServer.type}` : "NONE");
  console.log("   Embed URL:", embedUrl || "MISSING");

  if (!embedUrl) {
    console.error("   ❌ No embed URL — fetchReanimeDirectWatchSession will return source: null");
    return;
  }

  console.log("\n4. Fetching embed HTML from Flixcloud...");
  let embedHtml: string;
  try {
    const embedRes = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://reanime.to/",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12_000),
    });
    console.log("   Status:", embedRes.status);
    if (!embedRes.ok) {
      console.error("   ❌ Embed fetch failed with status", embedRes.status);
      return;
    }
    embedHtml = await embedRes.text();
    console.log("   HTML length:", embedHtml.length, "bytes");
    // Show relevant snippet around 'eval' or 'jwplayer'
    const evalIdx = embedHtml.indexOf("eval(");
    const packed = embedHtml.indexOf("p,a,c,k,e,d");
    console.log("   Has eval():", evalIdx >= 0, "at pos", evalIdx);
    console.log("   Has p,a,c,k,e,d:", packed >= 0, "at pos", packed);
  } catch (err) {
    console.error("   ❌ Embed HTML fetch FAILED:", err);
    return;
  }

  console.log("\n5. Decrypting embed...");
  try {
    const { url, subtitles } = await decryptEmbed(embedHtml);
    console.log("   ✅ HLS URL:", url.slice(0, 100));
    console.log("   Subtitles:", subtitles?.length || 0, "tracks");
    
    // Try the M3U8 proxy
    const proxyUrl = `http://localhost:3000/api/proxy/m3u8-streaming-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent("https://flixcloud.cc/")}`;
    console.log("6. Testing M3U8 proxy:", proxyUrl.slice(0, 120));
    const proxyRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(15_000) });
    console.log("   Proxy status:", proxyRes.status);
    if (proxyRes.ok) {
      const body = await proxyRes.text();
      console.log("   ✅ M3U8 response (first 300 chars):", body.slice(0, 300));
    } else {
      console.error("   ❌ Proxy returned error:", proxyRes.status);
    }

    // Test 6b: fetch M3U8 directly (no proxy) to see if IP binding works
    console.log("\n6b. Testing DIRECT fetch (no proxy):", url.slice(0, 100));
    const directRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://flixcloud.cc/",
        Origin: "https://flixcloud.cc",
      },
      signal: AbortSignal.timeout(10_000),
    });
    console.log("   Direct status:", directRes.status);
    if (directRes.ok) {
      const body = await directRes.text();
      console.log("   ✅ Direct M3U8 (first 200 chars):", body.slice(0, 200));
    } else {
      console.error("   ❌ Direct also 403 — Flixcloud blocks server IPs entirely");
    }
  } catch (err) {
    console.error("   ❌ Decrypt FAILED:", err);
  }
}

main().catch(console.error);
