import { getQuickWatchSession } from "./lib/anime/api.ts";

const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function run() {
  console.log("ANIVEXA WORKER URL:", process.env.NEXT_PUBLIC_ANIVEXA_WORKER_URL);
  console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
  
  try {
    const session = await getQuickWatchSession({
      animeId: "anilist~180745",
      episodeNumber: 15,
      provider: "reanime"
    });
    console.log("SESSION OUTPUT:");
    console.log("source:", JSON.stringify(session.source, null, 2));
    console.log("activeServerId:", session.activeServerId);
    console.log("serverOptions count:", session.serverOptions.length);
    console.log("serverOptions:", JSON.stringify(session.serverOptions, null, 2));
  } catch (err) {
    console.error("Error in getQuickWatchSession:", err);
  }
}

run().then(() => process.exit(0));
