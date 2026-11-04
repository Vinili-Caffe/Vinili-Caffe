import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..");
const outJson = path.join(__dirname, "emojiCatalog.json");
const rx = /<(a)?:([A-Za-z0-9_]+):(\d+)>/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".git"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|js|tsx|jsx|json|md|cjs|mjs)$/i.test(ent.name)) out.push(p);
  }
  return out;
}

const hits = new Map();
for (const file of walk(root)) {
  let txt;
  try {
    txt = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  rx.lastIndex = 0;
  let m;
  while ((m = rx.exec(txt))) {
    const animated = m[1] === "a";
    const name = m[2];
    const id = m[3];
    const key = `${name}|${id}`;
    const cur = hits.get(key);
    if (cur) cur.count += 1;
    else hits.set(key, { name, id, animated, count: 1 });
  }
}

const byName = new Map();
for (const e of hits.values()) {
  if (!byName.has(e.name)) byName.set(e.name, []);
  byName.get(e.name).push(e);
}

const catalog = {};
const collisions = [];
for (const [name, arr] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  arr.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const primary = arr[0];
  catalog[name] = { id: primary.id, animated: !!primary.animated };
  for (let i = 1; i < arr.length; i++) {
    const extra = arr[i];
    const key = `${name}__${extra.id.slice(-6)}`;
    catalog[key] = {
      id: extra.id,
      animated: !!extra.animated,
      name,
      note: `duplicate id of ${name} (refs=${extra.count})`,
    };
    collisions.push({ name, key, primaryId: primary.id, extraId: extra.id, refs: extra.count });
  }
}

fs.writeFileSync(outJson, JSON.stringify(catalog, null, 2) + "\n", "utf8");
console.log("wrote", outJson);
console.log("keys", Object.keys(catalog).length, "collisions", collisions.length);
for (const c of collisions) console.log(`  ${c.name} -> ${c.key} (${c.extraId}) refs=${c.refs}`);
