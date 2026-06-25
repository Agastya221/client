async function testReferer(refererHeader: string | null) {
  const target = "https://fetch6.flixcloud.cc/_v7/3fac491c-beca-45ca-b179-a967eebf44cc/master.m3u8?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2aWRlb19pZCI6IjNmYWM0OTFjLWJlY2EtNDVjYS1iMTc5LWE5NjdlZWJmNDRjYyIsImNsaWVudF9pcCI6IjJhMDY6OThjMDozNjAwOjoxMDMiLCJleHAiOjE3ODIzMDM4NjksImlhdCI6MTc4MjI4MjI2OSwiaXNzIjoidmlkZW8taG9zdGluZy1wbGF0Zm9ybSJ9.NMCyx6f8JVXGMlxtKp2wu8Xr-hBUN7fCet6HI8YOvj8&referer=https%3A%2F%2Ftatakai-anivexa.tatakai-anime.workers.dev%2F";
  
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
  if (refererHeader) {
    headers["Referer"] = refererHeader;
  }
  
  console.log(`Fetching with Referer header: "${refererHeader}"`);
  try {
    const res = await fetch(target, { headers });
    console.log("Status:", res.status);
    if (res.ok) {
      const text = await res.text();
      console.log("Response starts with:", text.slice(0, 100));
    } else {
      const text = await res.text().catch(() => "");
      console.log("Response error body:", text.slice(0, 200));
    }
  } catch (e) {
    console.error("Fetch failed:", e);
  }
  console.log("---");
}

async function main() {
  await testReferer("https://reanime.to/");
  await testReferer("https://tatakai-anivexa.tatakai-anime.workers.dev/");
  await testReferer(null);
}

main();
