/**
 * Static checks: missing script/link/img targets referenced from HTML pages.
 */
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".audit");
mkdirSync(OUT, { recursive: true });

function walkHtml(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".audit") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, acc);
    else if (name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

function extractRefs(html) {
  const refs = [];
  const re = /\b(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("http") || raw.startsWith("//") || raw.startsWith("data:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    refs.push(raw);
  }
  return refs;
}

function resolveRef(htmlPath, ref) {
  if (ref.startsWith("/")) return join(ROOT, ref.replace(/^\//, ""));
  return resolve(dirname(htmlPath), ref);
}

const pages = walkHtml(ROOT);
const missing = [];
for (const htmlPath of pages) {
  const html = readFileSync(htmlPath, "utf8");
  for (const ref of extractRefs(html)) {
    const fp = resolveRef(htmlPath, ref);
    if (!existsSync(fp)) {
      missing.push({ page: relative(ROOT, htmlPath).replace(/\\/g, "/"), ref, resolved: relative(ROOT, fp).replace(/\\/g, "/") });
    }
  }
}

const uniq = [];
const seen = new Set();
for (const m of missing) {
  const k = `${m.page}|${m.ref}`;
  if (seen.has(k)) continue;
  seen.add(k);
  uniq.push(m);
}

writeFileSync(join(OUT, "missing-assets.json"), JSON.stringify({ count: uniq.length, missing: uniq }, null, 2));
console.log(`Missing asset refs: ${uniq.length}`);
for (const m of uniq.slice(0, 60)) console.log(`- ${m.page} -> ${m.ref}`);
if (uniq.length > 60) console.log(`... +${uniq.length - 60}`);
