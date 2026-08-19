// Inject local font preloads + display=optional on public inner pages.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_PREFIXES = [
  "dist/",
  "seratafilm/",
  "evento/",
  "dashboard/",
  "staff/",
  "tickets/",
  "status/",
  "stato/",
  "supporto/",
  "unban/",
  "unmute/",
];

const FONT_LINKS = [
  '<link rel="preload" as="font" type="font/woff2" href="/fonts/cormorant/cormorant-garamond-latin.woff2" crossorigin />',
  '<link rel="preload" as="font" type="font/woff2" href="/fonts/inter/inter-latin.woff2" crossorigin />',
  '<link rel="stylesheet" href="/css/vc-fonts.css?v=siteFonts1" />',
].join("\n    ");

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.toLowerCase() === "index.html") out.push(p);
  }
}

function relPosix(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function skip(rel) {
  const n = rel.toLowerCase();
  if (n === "index.html") return true;
  return SKIP_PREFIXES.some((p) => n.startsWith(p));
}

const files = [];
walk(ROOT, files);
let patched = 0;
let skipped = 0;

for (const file of files) {
  const rel = relPosix(file);
  if (skip(rel)) {
    skipped += 1;
    continue;
  }
  let html = fs.readFileSync(file, "utf8");
  if (!/\bvc-body\b/.test(html)) {
    skipped += 1;
    continue;
  }

  let next = html.replace(/display=swap/g, "display=optional");
  if (!next.includes("cormorant-garamond-latin.woff2")) {
    const vp = next.match(/<meta name="viewport"[^>]*>/i);
    if (vp) {
      next = next.replace(vp[0], vp[0] + "\n    " + FONT_LINKS);
    } else {
      next = next.replace(/<head[^>]*>/i, (m) => m + "\n    " + FONT_LINKS);
    }
  }

  if (!/\bvc-site-polish\b/.test(next)) {
    next = next.replace(/<html(\s[^>]*)?>/i, (m, attrs) => {
      const a = attrs || "";
      if (/\bclass\s*=\s*"/i.test(a)) {
        return `<html${a.replace(/\bclass\s*=\s*"/i, 'class="vc-site-polish ')}`;
      }
      if (/\bclass\s*=\s*'/i.test(a)) {
        return `<html${a.replace(/\bclass\s*=\s*'/i, "class='vc-site-polish ")}`;
      }
      return `<html class="vc-site-polish"${a}>`;
    });
  }

  if (!next.includes('class="vc-home-cine"') && !next.includes("class='vc-home-cine'")) {
    const cine =
      '    <div class="vc-home-cine" aria-hidden="true">\n' +
      '      <canvas class="vc-home-cine__canvas"></canvas>\n' +
      '      <div class="vc-home-cine__veil"></div>\n' +
      '      <div class="vc-home-cine__grain"></div>\n' +
      "    </div>\n";
    next = next.replace(/<body([^>]*)>/i, (m) => m + "\n" + cine);
  }

  if (!/vc-home-cine(?:\.\d+)?\.js/.test(next)) {
    next = next.replace(/<\/body>/i, '    <script src="/js/vc-home-cine.js" defer></script>\n</body>');
  }

  if (next !== html) {
    fs.writeFileSync(file, next);
    patched += 1;
    console.log("patched", rel);
  }
}

console.log("done patched=" + patched + " skipped=" + skipped);
