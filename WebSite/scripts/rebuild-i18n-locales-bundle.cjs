const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "js", "i18n", "locales");
const ORDER = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "ru",
  "zh",
  "ja",
  "ko",
  "ar",
  "nl",
  "pl",
  "tr",
  "hi",
  "id",
  "uk",
  "vi",
  "ro",
  "sv",
];

const partial = {};
for (const code of ORDER) {
  const p = path.join(DIR, code + ".json");
  if (!fs.existsSync(p)) {
    console.warn("skip missing", code);
    continue;
  }
  const pack = JSON.parse(fs.readFileSync(p, "utf8"));
  partial[code] = pack;
  console.log(code, Object.keys(pack).length);
}

if (!partial.en) throw new Error("missing en.json");

const out = path.join(ROOT, "js", "vc-i18n-locales.js");
const js =
  "/**\n * Locale packs for VcI18n (EN curated + auto langs).\n" +
  " * Regenerate: npm run i18n:bundle\n */\n" +
  "(function () {\n" +
  '  if (!window.VcI18n || typeof window.VcI18n.extend !== "function") return;\n' +
  "  window.VcI18n.extend(" +
  JSON.stringify(partial) +
  ', { source: "auto" });\n' +
  "})();\n";
fs.writeFileSync(out, js, "utf8");
console.log("Wrote", out, fs.statSync(out).size, "langs", Object.keys(partial).join(","));
