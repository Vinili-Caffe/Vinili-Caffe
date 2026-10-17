#!/usr/bin/env node
/**
 * fix-mojibake6: UTF-8-as-Latin1 cleanup. All pairs via \\u escapes (ASCII-safe source).
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const EXTS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".md",
  ".txt",
  ".webmanifest",
  ".xml",
  ".svg",
  ".mjs",
  ".cjs",
]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "backup", "_archive"]);

const CP1252 = {
  0x80: "\u20ac",
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
};

function moj(correct) {
  /* UTF-8 bytes misread as Windows-1252 (0x80→€, not C1). */
  const buf = Buffer.from(correct, "utf8");
  let out = "";
  for (const b of buf) {
    if (b < 0x80) out += String.fromCharCode(b);
    else if (CP1252[b]) out += CP1252[b];
    else out += String.fromCharCode(b);
  }
  return out;
}

const CORRECT = [
  "è",
  "é",
  "à",
  "ù",
  "ò",
  "ì",
  "ç",
  "ñ",
  "É",
  "À",
  "Ó",
  "Ú",
  "Ô",
  "ô",
  "ê",
  "ë",
  "ï",
  "ü",
  "ö",
  "ä",
  "ß",
  "œ",
  "æ",
  "—",
  "–",
  "…",
  "•",
  "’",
  "‘",
  "“",
  "”",
  "→",
  "↓",
  "←",
  "⇒",
  "≥",
  "≈",
  "©",
  "·",
  "«",
  "»",
  "°",
  "🎃",
  "🍂",
  "📖",
  "📘",
  "📚",
  "🎙️",
  "🔔",
  "💬",
  "✅",
  "❌",
  "⚠️",
  "⚡",
  "༄",
  "Caffè",
  "caffè",
  "Perché",
  "perché",
  "più",
  "Più",
  "può",
  "Può",
  "ciò",
  "Ciò",
  "già",
  "Già",
  "così",
  "Così",
  "Vinili & Caffè",
];

const pairs = [];
const seen = new Set();
function add(from, to) {
  if (!from || from === to || seen.has(from)) return;
  seen.add(from);
  pairs.push([from, to]);
}

for (const c of CORRECT) {
  const once = moj(c);
  add(once, c);
  const twice = moj(once);
  add(twice, c);
}
add(" ", " ");
add("\u00c3\u02c6", "È");
add(moj("⚠") + "ï¸", "⚠️");
add(moj("⚠") + "ï¸", "⚠️");

pairs.sort((a, b) => b[0].length - a[0].length);

const MARKER_SEED = [
  "è",
  "é",
  "à",
  "ù",
  "ò",
  "ì",
  "ç",
  "ñ",
  "É",
  "À",
  "—",
  "–",
  "…",
  "•",
  "’",
  "“",
  "”",
  "→",
  "↓",
  "←",
  "©",
  "·",
  "«",
  "»",
  "🎃",
  "🍂",
  "≥",
  "≈",
  "✅",
  "❌",
  "⚠",
  "⚡",
];
const MARKERS = new Set();
for (const c of MARKER_SEED) {
  const m = moj(c);
  MARKERS.add(m.length > 2 ? m.slice(0, 2) : m);
  MARKERS.add(m.slice(0, Math.min(2, m.length)));
}
MARKERS.add(moj("è").slice(0, 2)); // è family
MARKERS.add(" ");
MARKERS.add("");
MARKERS.add("Ç€");

function hasMoj(t) {
  for (const m of MARKERS) {
    if (m && t.includes(m)) return true;
  }
  return false;
}

function fixText(raw) {
  let out = raw;
  for (const [a, b] of pairs) {
    if (out.includes(a)) out = out.split(a).join(b);
  }
  out = out.replace(/(?=[^\w])/g, "");
  return out;
}

function shouldSkipDir(name) {
  return SKIP_DIR.has(name);
}

function shouldSkipFile(file, root) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  if (rel.includes("i18n/locales/")) return true;
  if (rel.includes("i18n/_extracted/")) return true;
  if (rel.includes("scripts/")) return true;
  if (rel.includes("/_pack_") || rel.includes("/_stage_")) return true;
  if (/\.\d{8}[A-Za-z0-9]+\.(js|css)$/.test(path.basename(file))) return true;
  if (file.endsWith(".min.js") || file.endsWith(".map")) return true;
  return false;
}

function walk(dir, root, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      walk(path.join(dir, ent.name), root, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!EXTS.has(ext)) continue;
    const full = path.join(dir, ent.name);
    if (shouldSkipFile(full, root)) continue;
    out.push(full);
  }
  return out;
}

function writeGz(file, data) {
  const gz = file + ".gz";
  if (!fs.existsSync(gz)) return;
  try {
    fs.writeFileSync(gz, zlib.gzipSync(Buffer.from(data, "utf8"), { level: 9 }));
  } catch (_) {}
}

function main() {
  const roots = process.argv.slice(2).map((p) => path.resolve(p));
  const targets = roots.length ? roots : [ROOT];
  const changed = [];
  const still = [];
  let scanned = 0;
  console.log("pairs", pairs.length);
  for (const root of targets) {
    for (const file of walk(root, root)) {
      scanned += 1;
      let raw;
      try {
        raw = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (!hasMoj(raw)) continue;
      const next = fixText(raw);
      if (next !== raw) {
        fs.writeFileSync(file, next, "utf8");
        writeGz(file, next);
        changed.push(path.relative(root, file).replace(/\\/g, "/"));
      }
      const after = next !== raw ? next : raw;
      if (hasMoj(after)) {
        still.push(path.relative(root, file).replace(/\\/g, "/"));
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        scanned,
        changed: changed.length,
        still: still.length,
        files: changed,
        stillFiles: still.slice(0, 80),
      },
      null,
      2,
    ),
  );
  if (still.length) process.exitCode = 1;
  else console.log("PASS");
}

main();
