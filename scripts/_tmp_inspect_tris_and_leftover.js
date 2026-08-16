/* list leftover galeoni + open tris sessions */
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

  const leftover = await col
    .find({
      $or: [
        { "profile.events.hogwarts.gringott.earned": { $gt: 0 } },
        { "profile.events.hogwarts.gringott.spent": { $gt: 0 } },
        { "profile.events.hogwarts.gringott.balance": { $gt: 5000 } },
        { "profile.events.hogwarts.gringott.balance": { $gt: 0, $ne: 5000 } },
      ],
    })
    .project({
      userId: 1,
      guildId: 1,
      "profile.events.hogwarts.gringott.balance": 1,
      "profile.events.hogwarts.gringott.earned": 1,
      "profile.events.hogwarts.gringott.spent": 1,
      "profile.events.hogwarts.gringott.ledger": { $slice: -3 },
    })
    .limit(20)
    .toArray();

  const tris = await col
    .find({ "profile.economy.server.guiSessions.tris.messageId": { $exists: true, $nin: [null, ""] } })
    .project({
      userId: 1,
      guildId: 1,
      "profile.economy.server.guiSessions.tris": 1,
    })
    .limit(50)
    .toArray();

  console.log(
    JSON.stringify(
      {
        leftoverCount: leftover.length,
        leftover: leftover.map((d) => ({
          userId: d.userId,
          bal: d.profile?.events?.hogwarts?.gringott?.balance,
          earned: d.profile?.events?.hogwarts?.gringott?.earned,
          spent: d.profile?.events?.hogwarts?.gringott?.spent,
          ledger: d.profile?.events?.hogwarts?.gringott?.ledger,
        })),
        trisCount: tris.length,
        tris: tris.map((d) => {
          const t = d.profile?.economy?.server?.guiSessions?.tris;
          const p = t?.payload || {};
          return {
            userId: d.userId,
            phase: p.phase,
            mode: p.mode,
            wager: p.wager,
            bet: p.bet,
            stakesLocked: p.stakesLocked,
            messageId: t?.messageId,
            channelId: p.channelId,
          };
        }),
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
