/* one-shot: reset Galeoni to 5k rimborso + earned/spent = 0 */
const fs = require("fs");
const mongoose = require("/opt/bot/node_modules/mongoose");

const RIMBORSO = Math.max(0, Math.floor(Number(process.env.RIMBORSO_AMOUNT || 5000)));
const DRY_RUN = String(process.env.DRY_RUN || "").trim() === "1";

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

function hasGaleoniFilter() {
  return {
    $or: [
      { "profile.events.hogwarts.gringott.balance": { $gt: 0 } },
      { "profile.events.hogwarts.gringott.earned": { $gt: 0 } },
      { "profile.events.hogwarts.gringott.spent": { $gt: 0 } },
      { "profile.events.hogwarts.balance": { $gt: 0 } },
      { "profile.events.hogwarts.earned": { $gt: 0 } },
      { "profile.events.hogwarts.spent": { $gt: 0 } },
    ],
  };
}

async function main() {
  loadEnv("/opt/bot/.env");
  const uri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URL missing");
  await mongoose.connect(uri, process.env.MONGO_URL_LOCAL ? { directConnection: true } : undefined);

  const col = mongoose.connection.db.collection("activityuserprofiles");
  const filter = hasGaleoniFilter();
  const matched = await col.countDocuments(filter);
  const sample = await col
    .find(filter)
    .project({
      guildId: 1,
      userId: 1,
      "profile.events.hogwarts.gringott.balance": 1,
      "profile.events.hogwarts.gringott.earned": 1,
      "profile.events.hogwarts.gringott.spent": 1,
      "profile.events.hogwarts.balance": 1,
      "profile.events.hogwarts.earned": 1,
      "profile.events.hogwarts.spent": 1,
    })
    .limit(8)
    .toArray();

  console.log(JSON.stringify({ dryRun: DRY_RUN, rimborso: RIMBORSO, matched, sample }, null, 2));

  if (DRY_RUN) {
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const ledgerEntry = {
    type: "credit",
    amount: RIMBORSO,
    balanceAfter: RIMBORSO,
    reason: "Rimborso reset economia Galeoni",
    actorId: null,
    source: "admin_reset_rimborso",
    rewardKey: "",
    createdAt: now,
  };

  const res = await col.updateMany(filter, {
    $set: {
      "profile.events.hogwarts.gringott.balance": RIMBORSO,
      "profile.events.hogwarts.gringott.earned": 0,
      "profile.events.hogwarts.gringott.spent": 0,
      "profile.events.hogwarts.gringott.ledger": [ledgerEntry],
      "profile.events.hogwarts.balance": RIMBORSO,
      "profile.events.hogwarts.earned": 0,
      "profile.events.hogwarts.spent": 0,
      "profile.events.hogwarts.ledger": [ledgerEntry],
    },
  });

  console.log(JSON.stringify({ matched: res.matchedCount, modified: res.modifiedCount }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
