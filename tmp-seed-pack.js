try {
  require("dotenv").config({ path: "/opt/bot/bots-ts/.env" });
} catch (_) {}
try {
  require("dotenv").config({ path: "/opt/bot/.env" });
} catch (_) {}

const mongoose = require("mongoose");
const uri =
  process.env.MONGO_URL ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "";
if (!uri) {
  console.error("no mongo uri keys", Object.keys(process.env).filter((k) => /MONGO|DATABASE/i.test(k)));
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
      const n = pack && pack.payload && pack.payload.tracks ? pack.payload.tracks.length : 0;
      console.log("pack", a.id, a.name, pack ? pack.boardSlug : "NULL", n);
    } catch (e) {
      console.error("fail", a.id, a.name, e && e.message ? e.message : e);
    }
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
