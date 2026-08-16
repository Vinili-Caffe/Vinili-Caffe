/**
 * Extract IT/EN dictionaries from vc-i18n*.js into JSON for translation.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const jsDir = path.join(__dirname, "..", "js");
const outDir = path.join(__dirname, "..", "js", "i18n", "_extracted");

function loadPagesExtra() {
  const code = fs.readFileSync(path.join(jsDir, "vc-i18n-pages-extra.js"), "utf8");
  const sandbox = { module: { exports: {} }, exports: {}, window: undefined };
  vm.runInNewContext(code, sandbox, { filename: "vc-i18n-pages-extra.js" });
  return sandbox.module.exports;
}

function extractObjectLiteral(source, startIdx) {
  let i = source.indexOf("{", startIdx);
  if (i < 0) throw new Error("no { at " + startIdx);
  let depth = 0;
  let inStr = false;
  let quote = "";
  let escaped = false;
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  throw new Error("unclosed object");
}

function evalObjectLiteral(lit) {
  return vm.runInNewContext("(" + lit + ")", Object.create(null));
}

function extractLangFromExtendOrDicts(source, lang) {
  // Prefer "    lang: {" blocks that belong to DICTS / extend
  const needle = "\n    " + lang + ": {";
  const idx = source.indexOf(needle);
  if (idx < 0) throw new Error("lang block not found: " + lang);
  const lit = extractObjectLiteral(source, idx + needle.length - 1);
  return evalObjectLiteral(lit);
}

function extractFromMain() {
  const source = fs.readFileSync(path.join(jsDir, "vc-i18n.js"), "utf8");
  // Whole DICTS is safest
  const dictsIdx = source.indexOf("var DICTS = ");
  const lit = extractObjectLiteral(source, dictsIdx);
  return evalObjectLiteral(lit);
}

function extractFromPages() {
  const source = fs.readFileSync(path.join(jsDir, "vc-i18n-pages.js"), "utf8");
  return {
    it: extractLangFromExtendOrDicts(source, "it"),
    en: extractLangFromExtendOrDicts(source, "en"),
  };
}

function merge(...dicts) {
  const out = {};
  for (const d of dicts) Object.assign(out, d || {});
  return out;
}

fs.mkdirSync(outDir, { recursive: true });

const main = extractFromMain();
const pages = extractFromPages();
const extra = loadPagesExtra();

const it = merge(main.it, pages.it, extra.it);
const en = merge(main.en, pages.en, extra.en);

// Master = Italian only (manual). EN and others are auto-generated from IT.
const master = { ...it };
const itKeys = Object.keys(it).sort();
const enKeys = Object.keys(en).sort();
const masterKeys = Object.keys(master).sort();
const onlyIt = itKeys.filter((k) => !Object.prototype.hasOwnProperty.call(en, k));
const onlyEn = enKeys.filter((k) => !Object.prototype.hasOwnProperty.call(it, k));

fs.writeFileSync(path.join(outDir, "it.json"), JSON.stringify(it, null, 2));
fs.writeFileSync(path.join(outDir, "en.json"), JSON.stringify(en, null, 2));
fs.writeFileSync(path.join(outDir, "master.json"), JSON.stringify(master, null, 2));
fs.writeFileSync(
  path.join(outDir, "meta.json"),
  JSON.stringify(
    {
      masterLang: "it",
      itKeyCount: itKeys.length,
      enKeyCount: enKeys.length,
      masterKeyCount: masterKeys.length,
      onlyItCount: onlyIt.length,
      onlyEnCount: onlyEn.length,
      onlyIt,
      onlyEn,
      note: "Edit only IT in vc-i18n*.js; run npm run i18n:sync to refresh en+18.",
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      master: "it",
      it: itKeys.length,
      enManualLegacy: enKeys.length,
      masterKeys: masterKeys.length,
      onlyIt: onlyIt.length,
      onlyEn: onlyEn.length,
    },
    null,
    2
  )
);
