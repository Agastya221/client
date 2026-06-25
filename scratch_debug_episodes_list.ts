import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getQuickWatchSession } from "./lib/anime/api";

async function main() {
  const animeId = "anilist~180745";
  const episodeNumber = 15;
  
  console.log("ANIVEXA WORKER URL IN DEVSERVER:", process.env.NEXT_PUBLIC_ANIVEXA_WORKER_URL);
  console.log("Fetching watch session for:", animeId, "Ep:", episodeNumber);
  try {
    const session = await getQuickWatchSession({
      animeId,
      episodeNumber,
      provider: "animekai",
    });
    
    console.log("Active Provider:", session.provider);
    console.log("Available Providers:", session.availableProviders);
    console.log("Episode availableProviders:", session.episode.availableProviders);
    console.log("idByProvider:", session.episode.idByProvider);
    console.log("Server Options:", session.serverOptions.map(o => ({ id: o.id, label: o.label, provider: o.provider })));
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
