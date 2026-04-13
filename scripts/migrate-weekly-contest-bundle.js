/**
 * Migrazione one-shot: weeklycontestsubmissions + weeklycontestvoters → weeklycontestbundles
 * (un documento per guildId + eventKey).
 *
 * Uso (da root repo, bot fermo consigliato):
 *   node scripts/migrate-weekly-contest-bundle.js
 *
 * Dopo verifica in Compass, puoi eliminare le vecchie collection:
 *   weeklycontestsubmissions, weeklycontestvoters
 */

const path = require("path");
const mongoose = require("mongoose");

const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const ROOT = path.join(__dirname, "..");
loadEnvFiles(ROOT);
loadEnvFiles(path.join(ROOT, "Vinyls"));

const { WeeklyContestBundle } = require("../Vinyls/Schemas/Community/weeklyContestSchemas");

function mongoUrlFromEnv() {
  return (
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    ""
  ).trim();
}

function voterRowToLeaf(row) {
  if (!row || typeof row !== "object") return {};
  const o = { ...row };
  delete o._id;
  delete o.__v;
  delete o.guildId;
  delete o.eventKey;
  delete o.voterId;
  delete o.createdAt;
  delete o.updatedAt;
  return o;
}

function plainMap(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  return { ...o };
}

function rebuildSubmissionIndex(submissions) {
  const submissionMessageIndex = {};
  for (const cat of ["mobile", "pc"]) {
    for (const [uid, mid] of Object.entries(plainMap(submissions[cat]))) {
      submissionMessageIndex[String(mid)] = { category: cat, userId: String(uid) };
    }
  }
  return submissionMessageIndex;
}

async function main() {
  const url = mongoUrlFromEnv();
  if (!url) {
    console.error("Imposta MONGO_URL o MONGODB_URI (o *_LOCAL) in .env.");
    process.exit(1);
  }

  mongoose.set("strictQuery", false);
  await mongoose.connect(url);
  const db = mongoose.connection.db;

  const subCol = db.collection("weeklycontestsubmissions");
  const voterCol = db.collection("weeklycontestvoters");

  const [subs, voters] = await Promise.all([subCol.find({}).toArray(), voterCol.find({}).toArray()]);

  const pairSet = new Map();
  for (const s of subs) {
    const g = String(s.guildId || "");
    const e = String(s.eventKey || "");
    if (g && e) pairSet.set(`${g}\x00${e}`, { guildId: g, eventKey: e });
  }
  for (const v of voters) {
    const g = String(v.guildId || "");
    const e = String(v.eventKey || "");
    if (g && e) pairSet.set(`${g}\x00${e}`, { guildId: g, eventKey: e });
  }

  if (!pairSet.size) {
    console.log("Nessun dato in weeklycontestsubmissions / weeklycontestvoters: nulla da migrare.");
    await mongoose.disconnect();
    return;
  }

  let n = 0;
  for (const { guildId, eventKey } of pairSet.values()) {
    const subsRows = subs.filter((s) => String(s.guildId) === guildId && String(s.eventKey) === eventKey);
    const voterRows = voters.filter((v) => String(v.guildId) === guildId && String(v.eventKey) === eventKey);

    const existing = await WeeklyContestBundle.findOne({ guildId, eventKey }).lean();
    const submissions = {
      mobile: { ...plainMap(existing?.submissions?.mobile) },
      pc: { ...plainMap(existing?.submissions?.pc) },
    };

    for (const s of subsRows) {
      const cat = s.category === "pc" ? "pc" : "mobile";
      const uid = String(s.userId || "");
      const mid = String(s.messageId || "");
      if (!uid || !mid) continue;
      submissions[cat][uid] = mid;
    }

    const submissionMessageIndex = rebuildSubmissionIndex(submissions);

    const votersMap = { ...plainMap(existing?.voters) };
    for (const vr of voterRows) {
      const vid = String(vr.voterId || "");
      if (!vid) continue;
      votersMap[vid] = voterRowToLeaf(vr);
    }

    await WeeklyContestBundle.replaceOne(
      { guildId, eventKey },
      {
        guildId,
        eventKey,
        submissions,
        submissionMessageIndex,
        voters: votersMap,
      },
      { upsert: true },
    );
    n += 1;
    console.log(`OK bundle ${guildId} / ${eventKey} (submission rows=${subsRows.length}, voters=${voterRows.length})`);
  }

  console.log(`Fatto: ${n} documenti in weeklycontestbundles. Verifica e poi rimuovi le vecchie collection se tutto ok.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});