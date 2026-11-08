const fs = require("fs");
process.chdir("/opt/bot");
for (const line of fs.readFileSync("/opt/bot/.env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && process.env[k] == null) process.env[k] = v;
}
const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 2 });
  const col = mongoose.connection.db.collection("activityuserprofiles");
  const bak = mongoose.connection.db.collection("userleavebackups");
  const gid = "1329080093599076474";
  const withCases = await col.countDocuments({ guildId: gid, "moderation.modCases.0": { $exists: true } });
  const emptyCases = await col.countDocuments({ guildId: gid, "moderation.modCases": { $size: 0 } });
  const noMod = await col.countDocuments({ guildId: gid, moderation: { $exists: false } });
  const recent = await bak
    .find({ guildId: gid })
    .sort({ createdAt: -1 })
    .limit(40)
    .project({ userId: 1, createdAt: 1, "backupDoc.moderation.modCases": 1 })
    .toArray();
  const checks = [];
  let lost = 0;
  let kept = 0;
  let noCases = 0;
  for (const b of recent) {
    const bakN = Array.isArray(b.backupDoc?.moderation?.modCases) ? b.backupDoc.moderation.modCases.length : 0;
    if (bakN <= 0) {
      noCases += 1;
      continue;
    }
    const p = await col.findOne(
      { guildId: gid, userId: String(b.userId) },
      { projection: { userId: 1, "moderation.modCases": 1 } },
    );
    const nowN = Array.isArray(p?.moderation?.modCases) ? p.moderation.modCases.length : 0;
    const row = {
      userId: b.userId,
      leftAt: b.createdAt,
      bakCases: bakN,
      profileExists: Boolean(p),
      profileCases: nowN,
      lost: !p || nowN === 0,
    };
    if (row.lost) lost += 1;
    else kept += 1;
    if (checks.length < 12) checks.push(row);
  }
  console.log(JSON.stringify({ withCases, emptyCases, noMod, recentLeaveBackups: recent.length, leaveWithCases: kept + lost, kept, lost, noCasesAtLeave: noCases, samples: checks }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
