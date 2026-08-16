/**
 * Rebuild vc-i18n-locales.js — solo EN come gap-fill.
 * Picker pubblico: IT + EN (vedi vc-i18n.js). Altre lingue auto non caricate.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "js", "i18n", "locales");
const p = path.join(DIR, "en.json");
if (!fs.existsSync(p)) throw new Error("missing en.json");
const en = JSON.parse(fs.readFileSync(p, "utf8"));
console.log("en", Object.keys(en).length);
const out = path.join(ROOT, "js", "vc-i18n-locales.js");
const js =
  "/**\n * EN gap-fill for VcI18n (IT+EN curated only).\n" +
  " * Regenerate: npm run i18n:bundle\n */\n" +
  "(function () {\n" +
  '  if (!window.VcI18n || typeof window.VcI18n.extend !== "function") return;\n' +
  '  window.VcI18n.extend({ en: ' +
  JSON.stringify(en) +
  ' }, { source: "auto" });\n' +
  "})();\n";
fs.writeFileSync(out, js, "utf8");
console.log("Wrote", out, fs.statSync(out).size);
