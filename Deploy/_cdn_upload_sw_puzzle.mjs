#!/usr/bin/env node
/** Upload WebSite/public/images/starwars/puzzle/*.jpg → R2. */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const BOTS = path.join(REPO, "Bots");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

for (const f of [path.join(REPO, ".env.r2"), path.join(BOTS, ".env.r2"), path.join(REPO, ".env"), path.join(BOTS, ".env")]) {
  loadEnvFile(f);
}

const srcMedia = path.join(BOTS, "src/Vinili/site/http/siteCdnMedia.ts");
const builtMedia = path.join(BOTS, "build/js/Vinili/site/http/siteCdnMedia.js");
if (!fs.existsSync(builtMedia) || fs.statSync(srcMedia).mtimeMs > fs.statSync(builtMedia).mtimeMs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "compila.mjs"), "Vinili/site/http/siteCdnMedia.ts"], {
    cwd: BOTS,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

const require = createRequire(path.join(BOTS, "package.json"));
const cdn = require(builtMedia);
if (!cdn.isSiteCdnConfigured()) {
  console.error("Mancano le chiavi R2");
  process.exit(2);
}

const dir = path.join(REPO, "WebSite/public/images/starwars/puzzle");
const files = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f));
let ok = 0;
let fail = 0;
for (const f of files) {
  const full = path.join(dir, f);
  const key = `images/starwars/puzzle/${f}`;
  const res = await cdn.putSiteCdnFile(full, key);
  if (res.ok) {
    ok += 1;
    console.log(`ok ${key}`);
  } else {
    fail += 1;
    console.warn(`FAIL ${key}: ${res.reason || res.error || res.status}`);
  }
}
console.log({ ok, fail, total: files.length });
if (fail) process.exit(1);
