import fs from "fs";
import path from "path";

const ROOT = path.resolve("WebSite");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "dist" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(html|js)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const keys = new Set();
for (const f of walk(ROOT)) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/data-i18n(?:-html|-title)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of s.matchAll(/data-i18n(?:-html|-title)?='([^']+)'/g)) keys.add(m[1]);
  for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const part of m[1].split(/\s+/)) {
      const k = part.split(":").pop();
      if (k && k !== "key" && k !== "key2") keys.add(k);
    }
  }
  for (const m of s.matchAll(/VcI18n\.t\(\s*["']([^"']+)["']/g)) keys.add(m[1]);
}

const have = new Set();
for (const f of [
  "WebSite/js/vc-i18n.js",
  "WebSite/js/vc-i18n-pages.js",
  "WebSite/js/vc-i18n-pages-extra.js",
]) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/["']([a-zA-Z0-9_.]+)["']\s*:/g)) have.add(m[1]);
}

const missing = [...keys].filter((k) => !have.has(k)).sort();
console.log(`used=${keys.size} have≈${have.size} missing=${missing.length}`);
if (missing.length) console.log(missing.join("\n"));
