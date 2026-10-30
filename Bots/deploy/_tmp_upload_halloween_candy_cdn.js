#!/usr/bin/env node
/**
 * Copia caramelle Halloween su CDN con path neutrale images/halloween-candy/*
 * (evita adblock su "porco_dio").
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const raw = fs.readFileSync("/opt/bot/.env", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnv();
  process.chdir("/opt/bot");
  const { putSiteCdnFile, isSiteCdnConfigured, cdnUrlForKey } = require("/opt/bot/bots-ts/src/Vinili/Web/siteCdnMedia.js");
  if (!isSiteCdnConfigured()) {
    console.error("CDN not configured");
    process.exit(1);
  }
  const SRC =
    "/root/vc_bot_bak_20261030-192658-cdn-purge2/var/www/viniliecaffe-beta/images/caramelle_del_porco_dio";
  if (!fs.existsSync(SRC)) {
    console.error("missing src", SRC);
    process.exit(1);
  }

  const files = [];
  function walk(dir, rel = "") {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else files.push({ full, r });
    }
  }
  walk(SRC);
  console.log("files", files.length);

  let ok = 0;
  let fail = 0;
  for (const f of files) {
    const key = `images/halloween-candy/${f.r.replace(/\\/g, "/")}`;
    const res = await putSiteCdnFile(f.full, key);
    if (res.ok) {
      ok += 1;
      if (ok <= 3 || f.r.includes("thumbs/7.webp")) console.log("ok", key, cdnUrlForKey(key));
    } else {
      fail += 1;
      console.error("fail", key, res);
    }
  }
  console.log("done", { ok, fail });
  // smoke
  const probe = await fetch(cdnUrlForKey("images/halloween-candy/thumbs/7.webp"));
  console.log("probe", probe.status, probe.headers.get("content-type"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
