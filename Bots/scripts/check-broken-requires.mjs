import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "src");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "archivio") continue;
      walk(full, out);
    } else if (/\.ts$/.test(ent.name) && !ent.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function existsModule(resolved) {
  const candidates = [
    resolved,
    resolved + ".ts",
    resolved + ".js",
    resolved + ".json",
    path.join(resolved, "index.ts"),
    path.join(resolved, "index.js"),
  ];
  return candidates.some((c) => fs.existsSync(c));
}

const files = walk(SRC);
const bad = [];
const re = /(?:require|typeof import)\((['"])(\.\.?\/[^'"]+)\1\)/g;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  let m;
  const seen = new Set();
  while ((m = re.exec(text))) {
    const rel = m[2];
    if (!rel.startsWith(".")) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const resolved = path.resolve(path.dirname(file), rel);
    if (!existsModule(resolved)) {
      bad.push({
        file: path.relative(SRC, file).replace(/\\/g, "/"),
        rel,
      });
    }
  }
}

console.log("broken", bad.length);
for (const row of bad.slice(0, 120)) {
  console.log(`${row.file} -> ${row.rel}`);
}
if (bad.length > 120) console.log(`... +${bad.length - 120} more`);
