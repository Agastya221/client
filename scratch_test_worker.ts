async function main() {
  const workerBase = "https://tatakai-anivexa.tatakai-anime.workers.dev";
  const watchUrl = `${workerBase}/watch/reanime/180745/sub/reanime-15`;
  
  console.log("1. Fetching watch session from Worker:", watchUrl);
  let freshStreamUrl = "";
  try {
    const res = await fetch(watchUrl, {
      headers: { "User-Agent": "AnimeKAI-Frontend/1.0" }
    });
    console.log("Watch status:", res.status);
    const data = await res.json() as any;
    freshStreamUrl = data.stream_url;
    console.log("Resolved Stream URL:", freshStreamUrl);
  } catch (e) {
    console.error("Watch fetch failed:", e);
    return;
  }
  
  if (!freshStreamUrl) {
    console.error("No stream URL resolved!");
    return;
  }
  
  // Test 1: Fetch via Worker Proxy
  const workerProxyUrl = `${workerBase}/proxy?url=${encodeURIComponent(freshStreamUrl)}&referer=${encodeURIComponent("https://reanime.to/")}`;
  console.log("\n2. Fetching via Worker Proxy:", workerProxyUrl);
  try {
    const res = await fetch(workerProxyUrl);
    console.log("Worker Proxy Status:", res.status);
    console.log("Worker Proxy Headers:", Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log("Worker Proxy Body preview:", text.slice(0, 500));
  } catch (e) {
    console.error("Worker Proxy fetch failed:", e);
  }

  // Test 2: Fetch via Local Next.js Proxy
  const localProxyUrl = `http://localhost:3000/api/proxy/m3u8-streaming-proxy?url=${encodeURIComponent(freshStreamUrl)}&referer=${encodeURIComponent("https://reanime.to/")}`;
  console.log("\n3. Fetching via Local Next.js Proxy:", localProxyUrl);
  try {
    const res = await fetch(localProxyUrl);
    console.log("Local Proxy Status:", res.status);
    console.log("Local Proxy Headers:", Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log("Local Proxy Body preview:", text.slice(0, 500));
  } catch (e) {
    console.error("Local Proxy fetch failed:", e);
  }
}

main();
