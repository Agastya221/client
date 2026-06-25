import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const workerBase = process.env.NEXT_PUBLIC_ANIVEXA_WORKER_URL || "https://tatakai-anivexa.tatakai-anime.workers.dev";
  const url = `${workerBase}/episodes/180745`;
  console.log("Fetching raw episodes from:", url);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AnimeKAI-Frontend/1.0" }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Raw Response Keys:", Object.keys(data));
    for (const key of Object.keys(data)) {
      if (data[key]?.error) {
        console.log(`- ${key}: error - ${data[key].error}`);
      } else {
        console.log(`- ${key}: episodes count = ${data[key]?.episodes?.sub?.length || 0} sub, ${data[key]?.episodes?.dub?.length || 0} dub`);
        if (data[key]?.episodes?.sub?.length > 0) {
          console.log(`  First sub ep:`, data[key].episodes.sub[0]);
          console.log(`  Last sub ep:`, data[key].episodes.sub[data[key].episodes.sub.length - 1]);
        }
      }
    }
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

main();
