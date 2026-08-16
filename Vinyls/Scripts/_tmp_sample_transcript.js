const fs = require("fs");
for (const p of ["/opt/bot/.env"]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const msg = await db.collection("sitewebticketmessages").findOne({ content: /Transcript/i });
  console.log("---WEB MSG---");
  console.log(String(msg?.content || "").slice(0, 1200));
  const bucket = await db.collection("guildfeaturebuckets").findOne({ guildId: "1329080093599076474" }, { projection: { tickets: 1 } });
  const withT = (bucket?.tickets || []).find((t) => String(t.transcript || "").length > 200 && Number(t.ticketNumber) === 1351)
    || (bucket?.tickets || []).find((t) => String(t.transcript || "").length > 400);
  console.log("---DISCORD TRANSCRIPT sample ticket", withT?.ticketNumber, "len", String(withT?.transcript||"").length);
  console.log(String(withT?.transcript || "").slice(0, 1500));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
