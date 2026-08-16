/* one-shot: clear hogwarts duel cooldown (acceptors wrongly locked) */
const fs = require("fs");
const mongoose = require("/opt/bot/node_modules/mongoose");

const ONLY_USER_ID = String(process.env.TARGET_USER_ID || "").trim();

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
  if (!uri) throw new Error("MONGO_URL missing");
  await mongoose.connect(uri, process.env.MONGO_URL_LOCAL ? { directConnection: true } : undefined);

  const col = mongoose.connection.db.collection("activityuserprofiles");
  const now = new Date();
  const filter = {
    "profile.events.hogwarts.duel.cooldownUntil": { $gt: now },
  };
  if (ONLY_USER_ID) {
    filter.$or = [{ userId: ONLY_USER_ID }, { userId: Number(ONLY_USER_ID) }];
  }

  const before = await col
    .find(filter)
    .project({ guildId: 1, userId: 1, "profile.events.hogwarts.duel.cooldownUntil": 1 })
    .limit(50)
    .toArray();
  console.log(
    "activeDuelCd",
    before.map((d) => ({
      guildId: d.guildId,
      userId: d.userId,
      until: d?.profile?.events?.hogwarts?.duel?.cooldownUntil,
    })),
  );

  const res = await col.updateMany(filter, {
    $unset: { "profile.events.hogwarts.duel.cooldownUntil": "" },
  });
  console.log("cleared", { matched: res.matchedCount, modified: res.modifiedCount });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
