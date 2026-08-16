/* check tris refund ledger entries after disable */
const fs = require("fs");
const mongoose = require("/opt/bot/node_modules/mongoose");

function loadEnv(file) {
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

async function main() {
  loadEnv("/opt/bot/.env");
  const uri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI;
  await mongoose.connect(uri, process.env.MONGO_URL_LOCAL ? { directConnection: true } : undefined);
  const col = mongoose.connection.db.collection("activityuserprofiles");

  // Since reset, ledger was replaced with rimborso entry; any later credits are in ledger.
  // Find users whose ledger mentions tris refund / economy_tris_refund / chiusura.
  const docs = await col
    .find({
      $or: [
        { "profile.events.hogwarts.gringott.ledger.source": { $in: ["economy_tris_refund", "economy_tris_pvp", "economy_refund"] } },
        { "profile.events.hogwarts.gringott.ledger.reason": /tris.*(rimborso|chiusura|disattiv)/i },
        { "profile.events.hogwarts.gringott.ledger.reason": /rimborso.*tris/i },
      ],
    })
    .project({
      userId: 1,
      guildId: 1,
      "profile.events.hogwarts.gringott.balance": 1,
      "profile.events.hogwarts.gringott.earned": 1,
      "profile.events.hogwarts.gringott.spent": 1,
      "profile.events.hogwarts.gringott.ledger": 1,
    })
    .limit(200)
    .toArray();

  const hits = [];
  for (const d of docs) {
    const ledger = Array.isArray(d.profile?.events?.hogwarts?.gringott?.ledger)
      ? d.profile.events.hogwarts.gringott.ledger
      : [];
    const relevant = ledger.filter((e) => {
      const src = String(e?.source || "");
      const reason = String(e?.reason || "");
      if (src === "economy_tris_refund") return true;
      if (/tris.*(rimborso|chiusura|disattiv)/i.test(reason)) return true;
      if (/rimborso.*tris/i.test(reason)) return true;
      // pvp refunds after disable use source economy_tris_pvp + rimborso reason
      if (src === "economy_tris_pvp" && /rimborso/i.test(reason)) return true;
      return false;
    });
    if (!relevant.length) continue;
    hits.push({
      userId: d.userId,
      balance: d.profile?.events?.hogwarts?.gringott?.balance,
      earned: d.profile?.events?.hogwarts?.gringott?.earned,
      spent: d.profile?.events?.hogwarts?.gringott?.spent,
      refundEntries: relevant.map((e) => ({
        type: e.type,
        amount: e.amount,
        reason: e.reason,
        source: e.source,
        createdAt: e.createdAt,
        balanceAfter: e.balanceAfter,
      })),
    });
  }

  // Also: anyone over 5000 with recent credit that isn't work/daily etc.
  const over = await col.countDocuments({ "profile.events.hogwarts.gringott.balance": { $gt: 5000 } });
  const not5k = await col
    .find({
      "profile.events.hogwarts.gringott.balance": { $exists: true, $ne: 5000 },
      $or: [
        { "profile.events.hogwarts.gringott.balance": { $gt: 0 } },
        { "profile.events.hogwarts.gringott.earned": { $gt: 0 } },
        { "profile.events.hogwarts.gringott.spent": { $gt: 0 } },
      ],
    })
    .project({
      userId: 1,
      "profile.events.hogwarts.gringott.balance": 1,
      "profile.events.hogwarts.gringott.earned": 1,
      "profile.events.hogwarts.gringott.spent": 1,
      "profile.events.hogwarts.gringott.ledger": { $slice: -5 },
    })
    .limit(30)
    .toArray();

  console.log(
    JSON.stringify(
      {
        trisRefundHitUsers: hits.length,
        hits,
        over5000: over,
        notExactly5kSample: not5k.map((d) => ({
          userId: d.userId,
          bal: d.profile?.events?.hogwarts?.gringott?.balance,
          earned: d.profile?.events?.hogwarts?.gringott?.earned,
          spent: d.profile?.events?.hogwarts?.gringott?.spent,
          lastLedger: d.profile?.events?.hogwarts?.gringott?.ledger,
        })),
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
