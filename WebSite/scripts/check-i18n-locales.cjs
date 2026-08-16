const fs = require("fs");
const path = require("path");
const files = [
  path.join(__dirname, "..", "js", "vc-i18n-locales.js"),
  path.join(__dirname, "..", "dist", "js", "vc-i18n-locales.js"),
];
const codes = ["es","fr","de","pt","ru","zh","ja","ko","ar","nl","pl","tr","hi","id","uk","vi","ro","sv"];
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log("missing", f);
    continue;
  }
  const s = fs.readFileSync(f, "utf8");
  console.log("\n==", path.relative(path.join(__dirname, ".."), f), s.length);
  for (const c of codes) {
    const ok = s.includes('"' + c + '":{') || s.includes('"' + c + '": {');
    if (!ok) console.log("  MISSING", c);
  }
  console.log("  Idioma", s.includes("Idioma"), "Langue", s.includes("Langue"), "Sprache", s.includes("Sprache"));
}
