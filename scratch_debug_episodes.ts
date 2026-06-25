// Load dotenv BEFORE importing any modules so process.env is populated when they are initialized
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function run() {
  const { getQuickWatchSession } = await import("./lib/anime/api");
  const { cacheInvalidatePrefix } = await import("./lib/cache");

  console.log("Invalidating caches for anilist~21...");
  cacheInvalidatePrefix("detail-model:anilist~21");
  cacheInvalidatePrefix("watch-session:anilist~21");
  cacheInvalidatePrefix("stream:anilist~21");

  try {
    const session = await getQuickWatchSession({
      animeId: "anilist~21",
      episodeNumber: 75,
      provider: null // Let it resolve dynamically!
    });
    console.log("Total episodes:", session.episodes.length);
    console.log("Available providers:", session.availableProviders);
    
    const ep75 = session.episodes.find(e => e.number === 75);
    console.log("Episode 75:", ep75);
    console.log("Session source:", session.source);
    console.log("Session activeServerId:", session.activeServerId);
    console.log("Session watchAttempts:", session.watchAttempts);
    console.log("Session fallbackHistory:", session.fallbackHistory);
  } catch (err) {
    console.error("Error:", err);
  }
}

run().then(() => process.exit(0));
