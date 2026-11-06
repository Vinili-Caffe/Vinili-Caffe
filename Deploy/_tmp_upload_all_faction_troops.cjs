#!/usr/bin/env node
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv("/opt/bot/.env");
loadEnv("/opt/bot/.env.r2");

const candidates = [
  "/opt/bot/bots-ts/src/Vinili/site/http/siteCdnMedia.js",
  "/opt/bot/bots-ts/src/Vinili/Web/siteCdnMedia.js",
  "/opt/bot/bots-ts/build/js/Vinili/site/http/siteCdnMedia.js",
];
const mod = candidates.find((p) => fs.existsSync(p));
if (!mod) {
  console.error("siteCdnMedia.js non trovato");
  process.exit(1);
}
const cdn = require(mod);
if (!cdn.isSiteCdnConfigured()) {
  console.error("R2 non configurato");
  process.exit(2);
}

const root = "/var/www/viniliecaffe-react/images/starwars/truppe";
const factions = ["repubblica", "separatisti", "ribellione", "impero", "nuova_repubblica", "nuovo_ordine"];

(async () => {
  let ok = 0;
  let fail = 0;
  for (const faction of factions) {
    const dir = path.join(root, faction);
    if (!fs.existsSync(dir)) {
      console.log("skip missing", faction);
      continue;
    }
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".png"))) {
      const key = `images/starwars/truppe/${faction}/${f}`;
      const r = await cdn.putSiteCdnFile(path.join(dir, f), key);
      if (r.ok) {
        ok += 1;
        console.log("ok", `${faction}/${f}`);
      } else {
        fail += 1;
        console.log("FAIL", `${faction}/${f}`, r.reason || r.status || "");
      }
    }
  }
  console.log(`done ok=${ok} fail=${fail}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
