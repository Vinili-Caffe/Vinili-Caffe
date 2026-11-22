#!/bin/bash
set -euo pipefail
ssh vinili-ca 'cd /opt/bot/bots-ts && node <<'"'"'NODE'"'"'
const path = require("path");
// Load env like site-api
try { require("dotenv").config({ path: "/opt/bot/bots-ts/.env" }); } catch {}
try { require("dotenv").config({ path: "/opt/bot/.env" }); } catch {}

const mongoose = require("mongoose");
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL || "";
if (!uri) {
  console.error("no mongo uri");
  process.exit(1);
}

(async () => {
  await mongoose.connect(uri);
  const { ensureDeezerPack } = require("./src/Vinili/site/http/siteMusicQuizApi.js");
  const deezer = require("./src/Vinili/site/http/siteMusicQuizDeezer.js");
  const arts = await deezer.chartArtists(3);
  for (const a of arts) {
    try {
      const pack = await ensureDeezerPack("artist", String(a.id));
      console.log("pack", a.id, a.name, pack ? pack.boardSlug : "NULL", pack ? (pack.payload?.tracks?.length || 0) : 0);
    } catch (e) {
      console.error("fail", a.id, a.name, e && e.message ? e.message : e);
    }
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
NODE'
