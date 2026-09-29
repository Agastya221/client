// Patches a bug in @opennextjs/aws's cache interceptor before the Cloudflare build.
//
// cacheInterceptor.js strips the trailing slash from the request path, which turns the
// homepage "/" into "". It then falls back with `localizedPath ?? "/"`, but `??` only
// replaces null/undefined, not "". So "/" is never matched against the prerender
// manifest and the cached homepage is served by booting the whole Next.js server
// (~300 ms CPU) instead of straight from the cache (~10 ms). `||` is the intended check.
//
// Idempotent. Fails the build if the target code is not found, so an adapter upgrade
// that changes this file is noticed instead of silently losing the fix.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// The package's exports map hides its files from require.resolve, so look on disk: npm
// may hoist it to the top level or nest it under @opennextjs/cloudflare.
const relative = "@opennextjs/aws/dist/core/routing/cacheInterceptor.js";
const file = [
  path.join("node_modules", relative),
  path.join("node_modules/@opennextjs/cloudflare/node_modules", relative),
].find((candidate) => existsSync(candidate));
if (!file) {
  console.error(`patch-opennext: ${relative} not found; run this from the project root after npm install.`);
  process.exit(1);
}

const replacements = [
  ['.includes(localizedPath ?? "/")', '.includes(localizedPath || "/")'],
  ['incrementalCache.get(localizedPath ?? "/index")', 'incrementalCache.get(localizedPath || "/index")'],
];

let source = readFileSync(file, "utf8");
let changed = 0;
for (const [from, to] of replacements) {
  if (source.includes(to)) continue;
  if (!source.includes(from)) {
    console.error(`patch-opennext: expected code not found in ${file}:\n  ${from}\nThe adapter changed; re-check the homepage cache interception fix.`);
    process.exit(1);
  }
  source = source.replace(from, to);
  changed += 1;
}
if (changed) writeFileSync(file, source);
console.log(`patch-opennext: cacheInterceptor ${changed ? `patched (${changed} change${changed > 1 ? "s" : ""})` : "already patched"}`);
