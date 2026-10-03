/**
 * Deletes pages cached by earlier deploys from the Next.js page cache (KV NEXT_INC_CACHE_KV).
 *
 * Every deploy gets a new build id, and the page cache keys live under it
 * (incremental-cache/<buildId>/...), so each deploy leaves its old pages behind for good: on
 * 2026-10-03 the namespace held 941 keys from 45 deploys, 16 of them live, ~206 MB of the free 1 GB.
 * Run after a deploy, from the project root: `node scripts/cleanup-page-cache.mjs [--dry-run]`.
 * It reads the live build id from .open-next/assets/BUILD_ID, so run it with the build you just
 * deployed still in .open-next.
 *
 * Free plan: 1,000 KV deletes a day, so one run deletes at most MAX_DELETES (the rest next time).
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NAMESPACE_ID = "cbea7bdc142b440383b615d7255bb256";
const MAX_DELETES = 900;
const dryRun = process.argv.includes("--dry-run");

const current = readFileSync(".open-next/assets/BUILD_ID", "utf8").trim();
if (!current) throw new Error("No build id in .open-next/assets/BUILD_ID");

const listed = execSync(`npx wrangler kv key list --namespace-id ${NAMESPACE_ID} --remote`, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});
const keys = JSON.parse(listed.slice(listed.indexOf("["))).map((entry) => entry.name);
const old = keys.filter((name) => name.startsWith("incremental-cache/") && !name.startsWith(`incremental-cache/${current}/`));
const batch = old.slice(0, MAX_DELETES);

console.log(`live build ${current}: ${keys.length - old.length} keys kept, ${old.length} from older deploys`);
if (batch.length === 0 || dryRun) {
  console.log(dryRun ? `dry run: would delete ${batch.length}` : "nothing to delete");
  process.exit(0);
}

const file = join(mkdtempSync(join(tmpdir(), "page-cache-")), "old-keys.json");
writeFileSync(file, JSON.stringify(batch));
execSync(`npx wrangler kv bulk delete "${file}" --namespace-id ${NAMESPACE_ID} --remote --force`, { stdio: "inherit" });
console.log(`deleted ${batch.length}${old.length > batch.length ? `; ${old.length - batch.length} left for the next run` : ""}`);
