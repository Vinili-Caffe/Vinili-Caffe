/** Compila un singolo .ts archivio → .js (esbuild CJS) sulla VPS. */
"use strict";

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const esbuildRequire = createRequire("/opt/bot/bots-ts/package.json");
const esbuild = esbuildRequire("esbuild");

const src = process.argv[2];
const dest = process.argv[3];
if (!src || !dest) {
  console.error("usage: node _compile_one_archivio.cjs <src.ts> <dest.js>");
  process.exit(1);
}

async function main() {
  const code = fs.readFileSync(src, "utf8");
  const out = await esbuild.build({
    stdin: {
      contents: code,
      loader: "ts",
      resolveDir: path.dirname(src),
      sourcefile: path.basename(src),
    },
    write: false,
    format: "cjs",
    platform: "node",
    target: "node20",
    keepNames: true,
  });
  const js = out.outputFiles?.[0]?.text;
  if (!js) throw new Error("esbuild produced no output");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
  console.log("ok", dest);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
