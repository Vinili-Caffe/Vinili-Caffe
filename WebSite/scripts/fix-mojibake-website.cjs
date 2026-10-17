#!/usr/bin/env node
/**
 * Safe mojibake fixer for WebSite (HTML/JS/CSS).
 * - Explicit Italian / punctuation replacements
 * - ༄ → ༄ (role prefix)
 * - CP1252→UTF-8 only on short islands that shrink when decoded
 * Skips i18n locales (legitimate  etc.).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXTS = new Set([".html", ".js", ".css", ".md", ".txt"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist"]);

const CP1252_REVERSE = new Map();
(function buildCp1252() {
  for (let i = 0; i < 256; i++) {
    let ch;
    if (i < 0x80 || (i >= 0xa0 && i <= 0xff)) ch = String.fromCharCode(i);
    else {
      const map = {
        0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
        0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
        0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
        0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
        0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
        0x9e: 0x017e, 0x9f: 0x0178,
      };
      ch = map[i] ? String.fromCharCode(map[i]) : String.fromCharCode(i);
    }
    CP1252_REVERSE.set(ch, i);
  }
})();

function decodeCp1252Utf8(s) {
  const bytes = [];
  for (const ch of s) {
    if (!CP1252_REVERSE.has(ch)) return null;
    bytes.push(CP1252_REVERSE.get(ch));
  }
  const out = Buffer.from(bytes).toString("utf8");
  if (!out || out.includes("\uFFFD")) return null;
  return out;
}

const REPLACEMENTS = [
  ["—", "—"],
  ["–", "–"],
  ["Ã¢â‚¬¦", "…"],
  ["’", "’"],
  ["“", "“"],
  ["Ã¢â‚¬", "”"],
  ["‘", "‘"],
  ["→", "→"],
  ["CaffÃƒ¨", "Caffè"],
  ["caffÃƒ¨", "caffè"],
  ["Ãƒ¨", "è"],
  ["Ãƒ©", "é"],
  ["Ãƒ ", "à"],
  ["ù", "ù"],
  ["ò", "ò"],
  ["Ãƒ¬", "ì"],
  ["Ãƒ§", "ç"],
  ["Ã‚©", "©"],
  ["Ã‚·", "·"],
  ["Caffè", "Caffè"],
  ["caffè", "caffè"],
  ["Perché", "Perché"],
  ["perché", "perché"],
  ["più", "più"],
  ["Più", "Più"],
  ["può", "può"],
  ["Può", "Può"],
  ["ciò", "ciò"],
  ["Ciò", "Ciò"],
  ["già", "già"],
  ["Già", "Già"],
  ["così", "così"],
  ["Così", "Così"],
  ["è", "è"],
  ["é", "é"],
  ["à", "à"],
  ["ù", "ù"],
  ["ò", "ò"],
  ["ì", "ì"],
  ["ç", "ç"],
  ["©", "©"],
  ["·", "·"],
  ["«", "«"],
  ["»", "»"],
  ["°", "°"],
  ["—", "—"],
  ["–", "–"],
  ["…", "…"],
  ["’", "’"],
  ["‘", "‘"],
  ["“", "“"],
  ["”", "”"],
  ["→", "→"],
  ["📖", "📖"],
  ["📘", "📘"],
  ["📚", "📚"],
  ["༄", "༄"],
];

const MARKER_RE = /[ðŸÃâÊêáËŒ™„¥žà¼µ´]/;

function shouldSkipDir(name) {
  if (SKIP_DIR.has(name)) return true;
  if (name.startsWith("_tmp") || name.startsWith("fix-mojibake")) return false;
  if (name.startsWith("_tmp")) return true;
  return false;
}

function shouldSkipFile(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (rel.includes("i18n/locales/")) return true;
  if (rel.includes("i18n/_extracted/")) return true;
  if (rel.includes("scripts/_tmp_")) return true;
  return false;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name) || ent.name.startsWith("_tmp")) continue;
      walk(path.join(dir, ent.name), out);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!EXTS.has(ext)) continue;
    const full = path.join(dir, ent.name);
    if (shouldSkipFile(full)) continue;
    out.push(full);
  }
  return out;
}

function fixCp1252Islands(text) {
  const chars = Array.from(text);
  let out = "";
  let i = 0;
  while (i < chars.length) {
    if (!CP1252_REVERSE.has(chars[i])) {
      out += chars[i++];
      continue;
    }
    let j = i;
    while (j < chars.length && CP1252_REVERSE.has(chars[j]) && j - i < 64) j++;
    const run = chars.slice(i, j).join("");
    if (run.length >= 2 && MARKER_RE.test(run)) {
      // Try longest-to-shortest suffix/prefix shrink from start marker region
      let best = null;
      let bestLen = 0;
      for (let a = i; a < j; a++) {
        if (!MARKER_RE.test(chars[a])) continue;
        for (let b = j; b > a + 1; b--) {
          const chunk = chars.slice(a, b).join("");
          if (!MARKER_RE.test(chunk)) continue;
          const fixed = decodeCp1252Utf8(chunk);
          if (!fixed || fixed === chunk) continue;
          if ([...fixed].length >= [...chunk].length) continue;
          if (b - a > bestLen) {
            best = { a, b, fixed };
            bestLen = b - a;
          }
          break; // longest from this start
        }
      }
      if (best) {
        out += chars.slice(i, best.a).join("");
        out += best.fixed;
        i = best.b;
        continue;
      }
    }
    out += chars[i++];
  }
  return out;
}

function fixText(raw) {
  let out = raw;
  for (const [from, to] of REPLACEMENTS) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  out = fixCp1252Islands(out);
  return out;
}

function main() {
  const files = walk(ROOT);
  const changedFiles = [];
  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const next = fixText(raw);
    if (next === raw) continue;
    fs.writeFileSync(file, next, "utf8");
    changedFiles.push(path.relative(ROOT, file).replace(/\\/g, "/"));
  }
  console.log(
    JSON.stringify({ scanned: files.length, changed: changedFiles.length, files: changedFiles }, null, 2)
  );
}

main();
