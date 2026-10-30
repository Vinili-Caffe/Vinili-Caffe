#!/usr/bin/env node
/**
 * Da eseguire SULLA VPS (o via: bash tools/cdn-push-vps.sh).
 * Carica su R2: images/audio React, Photos bot, upload pubblici contest/boards.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = String(process.env.PROVA || "").trim() === "1";

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
loadEnvFile("/opt/bot/.env");
loadEnvFile("/opt/bot/.env.r2");

const mediaPath = process.env.VC_CDN_MEDIA_JS || path.resolve(__dirname, "../Vinili/Web/siteCdnMedia.js");
const alt = path.resolve(__dirname, "../build/js/Vinili/Web/siteCdnMedia.js");
const modPath = fs.existsSync(mediaPath) ? mediaPath : alt;
if (!fs.existsSync(modPath)) {
  console.error("manca siteCdnMedia.js (pubblica Vinili/Web/siteCdnMedia.ts prima)");
  process.exit(1);
}
const cdn = require(modPath);
if (!cdn.isSiteCdnConfigured()) {
  console.error("R2 non configurato in /opt/bot/.env (VC_R2_*)");
  process.exit(2);
}

const EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".mp3", ".mp4", ".webm", ".wav", ".ogg", ".json"]);

function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

const trees = [
  ["/var/www/viniliecaffe-react/images", "images"],
  ["/var/www/viniliecaffe-react/audio", "audio"],
  ["/opt/bot/Vinyls/Photos", "Photos"],
  ["/opt/bot/Data/uploads/site-contests", "uploads/site-contests"],
  ["/opt/bot/Data/uploads/site-boards", "uploads/site-boards"],
  ["/opt/bot/Vinyls/Data/uploads/site-contests", "uploads/site-contests"],
  ["/opt/bot/Vinyls/Data/uploads/site-boards", "uploads/site-boards"],
];

let ok = 0;
let fail = 0;
for (const [root, prefix] of trees) {
  const files = walk(root);
  if (!files.length) continue;
  console.log(`→ ${root} (${files.length})`);
  for (const full of files) {
    const rel = path.relative(root, full).replace(/\\/g, "/");
    const key = `${prefix}/${rel}`.replace(/\/+/g, "/");
    if (DRY) {
      console.log(`  (prova) ${key}`);
      continue;
    }
    const res = await cdn.putSiteCdnFile(full, key);
    if (res.ok) {
      ok += 1;
      if (ok <= 10 || ok % 50 === 0) console.log(`  ok ${key}`);
    } else {
      fail += 1;
      console.warn(`  FAIL ${key}: ${res.reason || res.status || res.error}`);
    }
  }
}
console.log(DRY ? "prova ok" : `fatto ok=${ok} fail=${fail}`);
process.exit(fail ? 1 : 0);
