import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const roots = [
  path.join(__dirname, "..", "src", "Vinili"),
  path.join(__dirname, "..", "src", "Caffè"),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|js)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function checkFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const re = /(?:require|typeof import)\((['"])(\.\.?\/[^'"]+)\1\)/g;
  let m;
  const bad = [];
  while ((m = re.exec(text))) {
    const rel = m[2];
    if (!rel.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), rel);
    const candidates = [
      resolved,
      resolved + ".ts",
      resolved + ".js",
      path.join(resolved, "index.ts"),
      path.join(resolved, "index.js"),
    ];
    if (!candidates.some((c) => fs.existsSync(c))) bad.push(rel);
  }
  return bad;
}

for (const root of roots) {
  const eventFiles = walk(root).filter(
    (f) =>
      /[\\/]events[\\/]/i.test(f) ||
      /[\\/]Handlers[\\/]/.test(f) ||
      /[\\/]core[\\/]handlers[\\/]/.test(f),
  );
  let fails = 0;
  for (const f of eventFiles) {
    const bad = checkFile(f);
    if (bad.length) {
      fails += 1;
      console.log("BAD", path.relative(root, f));
      for (const b of bad.slice(0, 12)) console.log("   ", b);
    }
  }
  console.log(path.basename(root), "checked", eventFiles.length, "broken-files", fails);
}
