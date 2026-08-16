/* eslint-disable no-console */
/**
 * Migra e droppa:
 *  - comtimeoutrolesnapshots → activityuserprofiles.profile.muteRoleSnapshot
 *  - countingrestoretokens → sitedocuments (docType counting_restore_token)
 *  - customperksdiscordcleanupqueues → activityuserprofiles.profile.customPerksDiscordCleanup
 *
 * Usage: node Vinyls/Scripts/migrateDropEphemeralCollections.js [--drop-old]
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const candidates = ["/opt/bot/.env", path.join(__dirname, "..", "..", ".env")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
    break;
  }
}

async function migrateMuteSnapshots(db) {
  const srcName = "comtimeoutrolesnapshots";
  const names = (await db.listCollections({ name: srcName }).toArray()).map((c) => c.name);
  if (!names.includes(srcName)) return { skipped: true, reason: "missing", migrated: 0 };
  const docs = await db.collection(srcName).find({}).toArray();
  let migrated = 0;
  let skippedNonEmpty = 0;
  for (const doc of docs) {
    const guildId = String(doc.guildId || "");
    const userId = String(doc.userId || "");
    const roleIds = [...new Set((doc.roleIds || []).map((x) => String(x || "").trim()).filter(Boolean))];
    if (!guildId || !userId || !roleIds.length) continue;
    const existing = await db.collection("activityuserprofiles").findOne(
      { guildId, userId },
      { projection: { "profile.muteRoleSnapshot.roleIds": 1 } },
    );
    const have = existing?.profile?.muteRoleSnapshot?.roleIds || [];
    if (Array.isArray(have) && have.length) {
      skippedNonEmpty += 1;
      continue;
    }
    await db.collection("activityuserprofiles").updateOne(
      { guildId, userId },
      {
        $set: {
          guildId,
          userId,
          "profile.muteRoleSnapshot.roleIds": roleIds,
          "profile.muteRoleSnapshot.at": doc.updatedAt || doc.createdAt || new Date(),
        },
      },
      { upsert: true },
    );
    migrated += 1;
  }
  return { sourceCount: docs.length, migrated, skippedNonEmpty };
}

async function migrateCountingTokens(db) {
  const srcName = "countingrestoretokens";
  const names = (await db.listCollections({ name: srcName }).toArray()).map((c) => c.name);
  if (!names.includes(srcName)) return { skipped: true, reason: "missing", migrated: 0 };
  const docs = await db.collection(srcName).find({}).toArray();
  let migrated = 0;
  let skipped = 0;
  for (const doc of docs) {
    const token = String(doc.token || "");
    if (!token) continue;
    const exists = await db.collection("sitedocuments").findOne({
      docType: "counting_restore_token",
      requestToken: token,
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    let status = "active";
    if (doc.used) status = "used";
    else if (doc.buttonDisabled) status = "disabled";
    await db.collection("sitedocuments").insertOne({
      docType: "counting_restore_token",
      requestToken: token,
      guildId: String(doc.guildId || ""),
      dmChannelId: String(doc.channelId || ""),
      dmMessageId: String(doc.messageId || ""),
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : new Date(),
      status,
      rawOrder: {
        lostCount: Number(doc.lostCount || 0),
        lostLastUser: String(doc.lostLastUser ?? " "),
      },
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || new Date(),
    });
    migrated += 1;
  }
  return { sourceCount: docs.length, migrated, skipped };
}

async function migrateCustomPerksCleanup(db) {
  const srcName = "customperksdiscordcleanupqueues";
  const names = (await db.listCollections({ name: srcName }).toArray()).map((c) => c.name);
  if (!names.includes(srcName)) return { skipped: true, reason: "missing", migrated: 0 };
  const docs = await db.collection(srcName).find({}).toArray();
  let migrated = 0;
  for (const doc of docs) {
    const guildId = String(doc.guildId || "");
    const userId = String(doc.userId || "");
    if (!guildId || !userId || !doc.runAt) continue;
    await db.collection("activityuserprofiles").updateOne(
      { guildId, userId },
      {
        $set: {
          guildId,
          userId,
          "profile.customPerksDiscordCleanup.runAt": new Date(doc.runAt),
          "profile.customPerksDiscordCleanup.roleId": doc.roleId || null,
          "profile.customPerksDiscordCleanup.secondaryRoleId": doc.secondaryRoleId || null,
          "profile.customPerksDiscordCleanup.customVocChannelId": doc.customVocChannelId || null,
          "profile.customPerksDiscordCleanup.customVocEmoji": doc.customVocEmoji || null,
          "profile.customPerksDiscordCleanup.clearMentionReactions": Boolean(doc.clearMentionReactions),
        },
      },
      { upsert: true },
    );
    migrated += 1;
  }
  return { sourceCount: docs.length, migrated };
}

async function main() {
  loadEnv();
  const dropOld = process.argv.includes("--drop-old");
  const mongoose = require("mongoose");
  const uri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL || process.env.MONGO_URI;
  if (!uri) {
    console.error("Missing MONGO_URL");
    process.exit(1);
  }
  console.log("db", String(uri).replace(/:[^:@/]+@/, ":***@"));
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const mute = await migrateMuteSnapshots(db);
  const counting = await migrateCountingTokens(db);
  const perks = await migrateCustomPerksCleanup(db);
  console.log(JSON.stringify({ mute, counting, perks }, null, 2));

  if (dropOld) {
    for (const name of [
      "comtimeoutrolesnapshots",
      "countingrestoretokens",
      "customperksdiscordcleanupqueues",
    ]) {
      const exists = (await db.listCollections({ name }).toArray()).length > 0;
      if (!exists) {
        console.log("already_gone", name);
        continue;
      }
      await db.collection(name).drop();
      console.log("dropped", name);
    }
  }

  const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log("remaining_target_gone", {
    comtimeout: cols.includes("comtimeoutrolesnapshots"),
    counting: cols.includes("countingrestoretokens"),
    perks: cols.includes("customperksdiscordcleanupqueues"),
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
