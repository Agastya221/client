const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const ANIVEXA_WORKER_URL = process.env.NEXT_PUBLIC_ANIVEXA_WORKER_URL || "";

function ensureArray(val) {
  if (Array.isArray(val)) return val;
  return [];
}

async function fetchAniviexaEpisodes(anilistId) {
  const base = ANIVEXA_WORKER_URL;
  if (!base) {
    console.log("ANIVEXA_WORKER_URL is empty!");
    return [];
  }

  let response = null;
  try {
    const url = `${base}/episodes/${anilistId}`;
    console.log("Fetching from worker:", url);
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "AnimeKAI-Frontend/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    console.error("fetchAniviexaEpisodes failed for ID:", anilistId, err);
    return [];
  }

  if (!response.ok) {
    console.error("fetchAniviexaEpisodes response was not ok for ID:", anilistId, response.status, response.statusText);
    return [];
  }

  const data = await response.json();
  console.log("Worker returned keys:", Object.keys(data));

  const aniviexaProviders = ["reanime", "allmanga", "anikoto", "animegg", "anineko"];
  const episodeMap = new Map();

  for (const provider of aniviexaProviders) {
    const providerData = data[provider];
    if (!providerData || providerData.error) {
      console.log(`Provider ${provider} has error/no data:`, providerData?.error);
      continue;
    }

    const subEps = ensureArray(providerData?.episodes?.sub);
    const dubEps = ensureArray(providerData?.episodes?.dub);
    const allEps = [...subEps, ...dubEps];
    console.log(`Provider ${provider} has ${allEps.length} episodes`);

    for (const ep of allEps) {
      const num = Number(ep.number);
      if (!Number.isFinite(num) || num <= 0) continue;

      const existing = episodeMap.get(num) ?? {
        number: num,
        title: ep.title || `Episode ${num}`,
        image: ep.image || null,
        isFiller: Boolean(ep.filler),
        idByProvider: {},
        availableProviders: [],
      };

      const key = `${anilistId}::${num}`;
      if (!existing.idByProvider[provider]) {
        existing.idByProvider[provider] = key;
        if (!existing.availableProviders.includes(provider)) {
          existing.availableProviders.push(provider);
        }
      }
      episodeMap.set(num, existing);
    }
  }

  return Array.from(episodeMap.values()).sort((a, b) => a.number - b.number);
}

async function run() {
  console.log("ANIVEXA WORKER URL:", ANIVEXA_WORKER_URL);
  const eps = await fetchAniviexaEpisodes(21);
  console.log("Result length:", eps.length);
  if (eps.length > 0) {
    console.log("Sample episode 75:", eps.find(e => e.number === 75));
  }
}

run().then(() => process.exit(0));
