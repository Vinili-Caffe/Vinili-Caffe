"use strict";
const fs = require("fs");
const path = require("path");
const esbuild = require("/opt/bot/bots-ts/node_modules/esbuild");
const src = process.argv[2];
const dest = process.argv[3];
if (!src || !dest) {
  console.error("usage: node _compile_one_archivio.cjs <src.ts> <dest.js>");
  process.exit(1);
}
const out = esbuild.transformSync(fs.readFileSync(src, "utf8"), {
  loader: "ts",
  format: "cjs",
  platform: "node",
  target: "node20",
  keepNames: true,
  sourcefile: path.basename(src),
});
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out.code);
console.log("ok", dest, out.code.length);
