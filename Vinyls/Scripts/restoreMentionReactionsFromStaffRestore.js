/**
 * Restore profile.mentionReaction.reactions from staff_restore_20260716 → live `test`
 * when live is empty and backup has reactions.
 *
 * Usage:
 *   node Vinyls/Scripts/restoreMentionReactionsFromStaffRestore.js [--apply] [userId]
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

function loadEnv() {
  const file = ["/opt/bot/.env", path.resolve(__dirname, "../../.env")].find((p) => fs.existsSync(p));
  if (!file) throw new Error("missing .env");
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const env = loadEnv();
const APPLY = process.argv.includes("--apply");
const ONLY_USER = process.argv.find((a) => /^\d{17,22}$/.test(a)) || null;
const gid = "1329080093599076474";
const SOURCE_DB = "staff_restore_20260716";
const LIVE_DB = "test";

function reactionsOf(doc) {
  const arr = doc?.profile?.mentionReaction?.reactions;
  return Array.isArray(arr) ? arr.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

(async () => {
  const mongo = new MongoClient(env.MONGO_URL_LOCAL);
  await mongo.connect();
  const source = mongo.db(SOURCE_DB).collection("activityuserprofiles");
  const live = mongo.db(LIVE_DB).collection("activityuserprofiles");

  const sourceFilter = {
    guildId: gid,
    "profile.mentionReaction.reactions.0": { $exists: true },
    ...(ONLY_USER ? { userId: ONLY_USER } : {}),
  };
  const srcDocs = await source
    .find(sourceFilter, { projection: { userId: 1, "profile.mentionReaction.reactions": 1 } })
    .toArray();

  const report = [];
  for (const src of srcDocs) {
    const userId = String(src.userId || "");
    const reactions = reactionsOf(src);
    if (!userId || !reactions.length) continue;
    const liveDoc = await live.findOne(
      { guildId: gid, userId },
      { projection: { "profile.mentionReaction.reactions": 1 } },
    );
    const liveRx = reactionsOf(liveDoc);
    // Only restore when live is empty — never overwrite intentional edits.
    if (liveRx.length) continue;
    report.push({ userId, action: "restore", reactions });
    if (APPLY) {
      await live.updateOne(
        { guildId: gid, userId },
        {
          $set: { "profile.mentionReaction.reactions": reactions },
          $setOnInsert: { guildId: gid, userId },
        },
        { upsert: true },
      );
    }
  }

  console.log(JSON.stringify({ apply: APPLY, fixed: report.length, report }, null, 2));
  await mongo.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
