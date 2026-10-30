#!/usr/bin/env node
/**
 * Sincronizza media pubblici → Cloudflare R2 (cdn.viniliecaffe.it).
 *
 * Uso (da cartella Bots):
 *   node tools/cdn-sync-media.mjs                  # statici locali + (opz.) VPS via SSH
 *   node tools/cdn-sync-media.mjs --vps             # include immagini/audio/Photos dalla VPS
 *   node tools/cdn-sync-media.mjs --uploads         # anche contest/boards già su disco
 *   PROVA=1 node tools/cdn-sync-media.mjs --vps     # elenca, non carica
 *
 * Credenziali (env o file .env.r2 nella root repo / Bots / /opt/bot/.env):
 *   VC_R2_ACCOUNT_ID  VC_R2_ACCESS_KEY_ID  VC_R2_SECRET_ACCESS_KEY
 *   VC_R2_BUCKET=vc-media  VC_PHOTOS_CDN_ORIGIN=https://cdn.viniliecaffe.it
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS = path.resolve(__dirname, "..");
const REPO = path.resolve(BOTS, "..");
const DRY = String(process.env.PROVA || "").trim() === "1";
const WANT_VPS = process.argv.includes("--vps");
const WANT_UPLOADS = process.argv.includes("--uploads");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const k = m[1];
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

for (const f of [
  path.join(REPO, ".env.r2"),
  path.join(BOTS, ".env.r2"),
  path.join(REPO, ".env"),
  path.join(BOTS, ".env"),
]) {
  loadEnvFile(f);
}

// Compila siteCdnMedia se manca in build
const srcMedia = path.join(BOTS, "src/Vinili/Web/siteCdnMedia.ts");
const builtMedia = path.join(BOTS, "build/js/Vinili/Web/siteCdnMedia.js");
if (!fs.existsSync(builtMedia) || fs.statSync(srcMedia).mtimeMs > fs.statSync(builtMedia).mtimeMs) {
  const r = spawnSync(process.execPath, [path.join(BOTS, "tools/compila.mjs"), "Vinili/Web/siteCdnMedia.ts"], {
    cwd: BOTS,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

const cdn = require(builtMedia);
if (!cdn.isSiteCdnConfigured()) {
  console.error(
    "Mancano le chiavi R2. Metti in .env.r2 (o /opt/bot/.env):\n" +
      "  VC_R2_ACCOUNT_ID=...\n" +
      "  VC_R2_ACCESS_KEY_ID=...\n" +
      "  VC_R2_SECRET_ACCESS_KEY=...\n" +
      "  VC_R2_BUCKET=vc-media\n" +
      "  VC_PHOTOS_CDN_ORIGIN=https://cdn.viniliecaffe.it",
  );
  process.exit(2);
}

const MEDIA_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".mp3",
  ".mp4",
  ".webm",
  ".wav",
  ".ogg",
  ".json",
]);

function walkFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && MEDIA_EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

async function uploadTree(localRoot, keyPrefix) {
  const files = walkFiles(localRoot);
  let ok = 0;
  let fail = 0;
  let skip = 0;
  for (const full of files) {
    const rel = path.relative(localRoot, full).replace(/\\/g, "/");
    const key = `${keyPrefix.replace(/\/+$/, "")}/${rel}`.replace(/\/+/g, "/");
    if (DRY) {
      console.log(`  (prova) ${key}`);
      skip += 1;
      continue;
    }
    const res = await cdn.putSiteCdnFile(full, key);
    if (res.ok) {
      ok += 1;
      if (ok <= 8 || ok % 25 === 0) console.log(`  ok ${key}`);
    } else {
      fail += 1;
      console.warn(`  FAIL ${key}: ${res.reason || res.error || res.status}`);
    }
  }
  return { ok, fail, skip, total: files.length };
}

function stageFromVps(remotePath, localStage) {
  fs.rmSync(localStage, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(localStage), { recursive: true });
  const r = spawnSync("scp", ["-r", "-q", `vinili:${remotePath}`, localStage], { stdio: "inherit" });
  return r.status === 0 && fs.existsSync(localStage);
}

const jobs = [];

// Locali (se presenti in repo)
const localImages = path.join(REPO, "WebSite/public/images");
const localAudio = path.join(REPO, "WebSite/public/audio");
const localPhotos = path.join(BOTS, "src/Vinili/Photos");
if (fs.existsSync(localImages)) jobs.push(["locale images", localImages, "images"]);
if (fs.existsSync(localAudio)) jobs.push(["locale audio", localAudio, "audio"]);
if (fs.existsSync(localPhotos)) jobs.push(["locale Photos", localPhotos, "Photos"]);

const stageRoot = path.join(BOTS, "build/cdn-stage");

if (WANT_VPS) {
  const pairs = [
    ["/var/www/viniliecaffe-react/images", "images"],
    ["/var/www/viniliecaffe-react/audio", "audio"],
    ["/opt/bot/Vinyls/Photos", "Photos"],
  ];
  for (const [remote, prefix] of pairs) {
    const stage = path.join(stageRoot, prefix);
    console.log(`scarico VPS ${remote} …`);
    if (!stageFromVps(remote, stage)) {
      console.warn(`  skip ${remote} (scp fallito o assente)`);
      continue;
    }
    // scp -r remote dir → stage può diventare stage/basename
    const nested = path.join(stage, path.basename(remote));
    const root = fs.existsSync(nested) ? nested : stage;
    jobs.push([`vps ${prefix}`, root, prefix]);
  }
}

if (WANT_UPLOADS) {
  const uploadPairs = [
    ["/opt/bot/Data/uploads/site-contests", "uploads/site-contests"],
    ["/opt/bot/Data/uploads/site-boards", "uploads/site-boards"],
    ["/opt/bot/Vinyls/Data/uploads/site-contests", "uploads/site-contests"],
    ["/opt/bot/Vinyls/Data/uploads/site-boards", "uploads/site-boards"],
  ];
  for (const [remote, prefix] of uploadPairs) {
    const stage = path.join(stageRoot, prefix.replace(/\//g, "_"));
    console.log(`scarico VPS ${remote} …`);
    if (!stageFromVps(remote, stage)) continue;
    const nested = path.join(stage, path.basename(remote));
    const root = fs.existsSync(nested) ? nested : stage;
    jobs.push([`vps ${prefix}`, root, prefix]);
  }
}

if (!jobs.length) {
  console.log("Niente da sincronizzare (aggiungi --vps e/o file in WebSite/public/images).");
  process.exit(0);
}

let totalOk = 0;
let totalFail = 0;
for (const [label, root, prefix] of jobs) {
  console.log(`→ ${label} (${root} → ${prefix}/)`);
  const r = await uploadTree(root, prefix);
  console.log(`  ${r.total} file: ok=${r.ok} fail=${r.fail} prova=${r.skip}`);
  totalOk += r.ok;
  totalFail += r.fail;
}

console.log(DRY ? `prova finita (${totalOk + totalFail} elencati)` : `fatto: ok=${totalOk} fail=${totalFail}`);
process.exit(totalFail ? 1 : 0);
