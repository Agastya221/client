const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function run() {
  const { getQuickWatchSession } = await import("./lib/anime/api");
  const { cacheInvalidatePrefix } = await import("./lib/cache");

  console.log("Invalidating caches for anilist~180745...");
  cacheInvalidatePrefix("detail-model:anilist~180745");
  cacheInvalidatePrefix("watch-session:anilist~180745");
  cacheInvalidatePrefix("stream:anilist~180745");

  try {
    const session = await getQuickWatchSession({
      animeId: "anilist~180745",
      episodeNumber: 15,
      provider: "animekai"
    });
    console.log("Total episodes:", session.episodes.length);
    console.log("Active provider:", session.provider);
    console.log("Available providers:", session.availableProviders);
    
    const ep15 = session.episodes.find(e => e.number === 15);
    console.log("Episode 15:", ep15);
    console.log("Session source:", session.source);
    console.log("Session activeServerId:", session.activeServerId);
    console.log("Session watchAttempts:", session.watchAttempts);
    console.log("Session fallbackHistory:", session.fallbackHistory);
  } catch (err) {
    console.error("Error:", err);
  }
}

run().then(() => process.exit(0));
