import { GET } from "./app/api/anilist/user-list/route";

async function testHrefs() {
  const req = new Request("http://localhost:3000/api/anilist/user-list?userName=agastya221");
  const res = await GET(req);
  const json = await res.json();
  console.log("Status:", res.status);
  if (json.entries) {
    json.entries.forEach((e: any) => {
      console.log(`Title: ${e.title}`);
      console.log(`   Progress: ${e.progress}`);
      console.log(`   Direct Watch Href: ${e.href}`);
    });
  }
}
testHrefs();
