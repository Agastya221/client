// Makes Prisma work on the Cloudflare Worker. Runs after `opennextjs-cloudflare build`.
//
// The server bundle includes Prisma's Node client, which turns its query compiler from a
// base64 string into WebAssembly at request time (`new WebAssembly.Module(bytes)`). Workers
// forbid compiling WebAssembly at runtime ("Wasm code generation disallowed by embedder"), so
// every database call failed on the live site. Workers do allow importing a .wasm file, which
// wrangler compiles at deploy time. This swaps the runtime compile for such an import.
//
// Only the Worker bundle is changed; `next dev` / `next start` keep using Prisma unmodified.
// Idempotent, and fails the build if the expected code is not found, so a Prisma or adapter
// upgrade that changes it is noticed instead of silently breaking the database again.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = ".open-next/server-functions/default";
const handler = path.join(dir, "handler.mjs");
if (!existsSync(handler)) {
  console.error(`patch-prisma-wasm: ${handler} not found; run after opennextjs-cloudflare build.`);
  process.exit(1);
}

const IMPORT_NAME = "__prismaQueryCompilerWasm";
let source = readFileSync(handler, "utf8");
if (source.includes(IMPORT_NAME)) {
  console.log("patch-prisma-wasm: already patched");
  process.exit(0);
}

const pattern =
  /getQueryCompilerWasmModule:\s*async\s*\(\)\s*=>\s*\{\s*let\s*\{\s*Buffer:\s*\w+\s*\}\s*=\s*require\("node:buffer"\),\s*\{\s*wasm\s*\}\s*=\s*require_query_compiler_(\w+)_bg_wasm_base64\(\),\s*(\w+)\s*=\s*\w+\.from\(wasm,\s*"base64"\);\s*return new WebAssembly\.Module\(\2\)\s*\}/g;
const matches = [...source.matchAll(pattern)];
const compilesAtRuntime = /new WebAssembly\.Module\(/.test(source);
if (matches.length === 0 && !compilesAtRuntime) {
  // The bundle already uses Prisma's Workers client, which imports the .wasm file. The
  // bundler writes that import as an absolute path on the build machine (WSL), which does
  // not exist where `wrangler deploy` runs; make it relative to this file.
  const absolute = /import\("(?:\/[^"]*)?\/\.open-next\/server-functions\/default\/(node_modules\/[^"]+\.wasm)"\)/g;
  const fixed = source.replace(absolute, 'import("./$1")');
  const count = (source.match(absolute) || []).length;
  if (count) writeFileSync(handler, fixed);
  console.log(`patch-prisma-wasm: bundle already imports the .wasm; ${count ? `made ${count} import path(s) relative` : "paths already relative"}`);
  process.exit(0);
}
if (matches.length === 0) {
  console.error("patch-prisma-wasm: Prisma's runtime wasm compile was not found in the bundle. Prisma or the adapter changed; re-check this patch.");
  process.exit(1);
}
const flavours = new Set(matches.map((m) => m[1]));
if (flavours.size !== 1) {
  console.error(`patch-prisma-wasm: expected one query compiler build, found ${[...flavours].join(", ")}.`);
  process.exit(1);
}
const [flavour] = flavours;
const wasmName = `query_compiler_${flavour}_bg.wasm`;
const wasmSource = [
  path.join(dir, "node_modules/.prisma/client", wasmName),
  path.join("node_modules/.prisma/client", wasmName),
].find((candidate) => existsSync(candidate));
if (!wasmSource) {
  console.error(`patch-prisma-wasm: ${wasmName} not found; run prisma generate first.`);
  process.exit(1);
}
copyFileSync(wasmSource, path.join(dir, wasmName));

source = source.replace(pattern, `getQueryCompilerWasmModule:async()=>${IMPORT_NAME}`);
source = `import ${IMPORT_NAME} from "./${wasmName}";\n${source}`;
writeFileSync(handler, source);
console.log(`patch-prisma-wasm: patched ${matches.length} runtime compile(s) to import ${wasmName}`);
