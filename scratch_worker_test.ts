const base = "https://tatakai-anivexa.tatakai-anime.workers.dev";
const anilistId = 21;

async function run() {
  const url = `${base}/episodes/${anilistId}`;
  console.log("Fetching worker url:", url);
  try {
    const res = await fetch(url);
    console.log("Status:", res.status);
    const json = await res.json();
    console.log("Provider keys in response:", Object.keys(json));
    for (const key of Object.keys(json)) {
      const providerData = json[key];
      if (providerData && !providerData.error) {
        const subCount = providerData.episodes?.sub?.length || 0;
        const dubCount = providerData.episodes?.dub?.length || 0;
        console.log(`Provider: ${key}, sub episodes count: ${subCount}, dub episodes count: ${dubCount}`);
        if (subCount > 0) {
          console.log(`First sub ep sample:`, providerData.episodes.sub[0]);
        }
      } else {
        console.log(`Provider: ${key} has error:`, providerData?.error);
      }
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

run();
