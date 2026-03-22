/**
 * Migra in `globalsettings` (Mongoose GlobalSettings + doc bucket _counterKey):
 * - mod_config → campo modConfig per guildId
 * - personalitypanels → personalityPanels[]
 * - channelsnapshots → channelSnapshots[]
 * - skullboardposts → skullboardPosts[]
 * - partnershipblacklistguilds → bucket.partnershipBlacklistGuilds[]
 *
 * Uso:
 *   node scripts/migrate-legacy-collections-into-globalsettings.js
 *   node scripts/migrate-legacy-collections-into-globalsettings.js --apply
 */
const path = require("path");
const mongoose = require("mongoose");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const APP_ROOT = path.join(__dirname, "..");
loadEnvFiles(APP_ROOT);

const { GlobalSettings } = require("../Vinyls/Schemas/Community/communitySchemas");
const {
  TICKET_COUNTER_KEY,
  ensureBucketArrays,
  setPartnershipBlacklistEntries,
  getPartnershipBlacklistEntries,
} = require("../Vinyls/Utils/Global/globalSettingsBucket");

const APPLY = process.argv.includes("--apply");

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

async function migrateModConfigs(db) {
  const coll = db.collection("mod_config");
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "mod_config", count: 0 };
  const rows = await coll.find({}).toArray();
  let merged = 0;
  for (const r of rows) {
    const guildId = String(r.guildId || "");
    if (!guildId) continue;
    const modConfig = pick(r, ["logChannelId", "dmOnAction", "caseCounter", "exemptRoles", "exemptChannels"]);
    if (!APPLY) {
      merged += 1;
      continue;
    }
    await GlobalSettings.updateOne(
      { guildId },
      {
        $set: { modConfig },
        $setOnInsert: { guildId },
      },
      { upsert: true },
    ).catch(() => null);
    merged += 1;
  }
  return { name: "mod_config", count: merged };
}

async function migratePersonalityPanels(db) {
  const coll = db.collection("personalitypanels");
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "personalitypanels", count: 0 };
  const rows = await coll.find({}).toArray();
  const byGuild = new Map();
  for (const r of rows) {
    const gid = String(r.guildId || "");
    if (!gid) continue;
    const entry = pick(r, [
      "channelId",
      "personalityMessageId",
      "mentionsMessageId",
      "colorsMessageId",
      "plusColorsMessageId",
      "infoMessageId1",
      "infoMessageId2",
      "verifyInfoMessageId",
      "verifyPanelMessageId",
      "ticketInfoMessageId",
      "ticketPanelMessageId",
      "sponsorTicketPanelMessageId",
    ]);
    if (!entry.channelId) continue;
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid).push(entry);
  }
  let merged = 0;
  for (const [guildId, personalityPanels] of byGuild) {
    if (!APPLY) {
      merged += personalityPanels.length;
      continue;
    }
    await GlobalSettings.updateOne(
      { guildId },
      { $set: { personalityPanels }, $setOnInsert: { guildId } },
      { upsert: true },
    ).catch(() => null);
    merged += personalityPanels.length;
  }
  return { name: "personalitypanels", count: merged };
}

async function migrateChannelSnapshots(db) {
  const coll = db.collection("channelsnapshots");
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "channelsnapshots", count: 0 };
  const rows = await coll.find({}).toArray();
  const byGuild = new Map();
  for (const r of rows) {
    const gid = String(r.guildId || "");
    const cid = String(r.channelId || "");
    if (!gid || !cid) continue;
    const entry = pick(r, ["channelId", "name", "type", "parentId", "deletedAt"]);
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid).push(entry);
  }
  let merged = 0;
  for (const [guildId, channelSnapshots] of byGuild) {
    if (!APPLY) {
      merged += channelSnapshots.length;
      continue;
    }
    await GlobalSettings.updateOne(
      { guildId },
      { $set: { channelSnapshots }, $setOnInsert: { guildId } },
      { upsert: true },
    ).catch(() => null);
    merged += channelSnapshots.length;
  }
  return { name: "channelsnapshots", count: merged };
}

async function migrateSkullboardPosts(db) {
  const coll = db.collection("skullboardposts");
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "skullboardposts", count: 0 };
  const rows = await coll.find({}).toArray();
  const byGuild = new Map();
  for (const r of rows) {
    const gid = String(r.guildId || "");
    const mid = String(r.messageId || "");
    if (!gid || !mid) continue;
    const entry = { messageId: mid, postMessageId: r.postMessageId != null ? String(r.postMessageId) : null };
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid).push(entry);
  }
  let merged = 0;
  for (const [guildId, skullboardPosts] of byGuild) {
    if (!APPLY) {
      merged += skullboardPosts.length;
      continue;
    }
    await GlobalSettings.updateOne(
      { guildId },
      { $set: { skullboardPosts }, $setOnInsert: { guildId } },
      { upsert: true },
    ).catch(() => null);
    merged += skullboardPosts.length;
  }
  return { name: "skullboardposts", count: merged };
}

async function migratePartnershipBlacklist(db) {
  const coll = db.collection("partnershipblacklistguilds");
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "partnershipblacklistguilds", count: 0 };
  const rows = await coll.find({}).toArray();
  const next = rows.map((r) => ({
    guildId: String(r.guildId || ""),
    addedBy: r.addedBy != null ? String(r.addedBy) : null,
    note: String(r.note || "").slice(0, 500),
    addedAt: r.addedAt ? new Date(r.addedAt) : new Date(),
  })).filter((x) => /^\d{16,20}$/.test(x.guildId));
  if (!APPLY) return { name: "partnershipblacklistguilds", count: next.length };
  const gcoll = db.collection("globalsettings");
  await gcoll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    {
      $setOnInsert: {
        _counterKey: TICKET_COUNTER_KEY,
        _counterValue: 0,
        countschemas: [],
        quotecounts: [],
        partnershipBlacklistGuilds: [],
      },
    },
    { upsert: true },
  );
  await ensureBucketArrays();
  const existing = await getPartnershipBlacklistEntries();
  const map = new Map();
  for (const x of existing) map.set(String(x.guildId), x);
  for (const x of next) map.set(x.guildId, x);
  await setPartnershipBlacklistEntries([...map.values()]);
  return { name: "partnershipblacklistguilds", count: next.length };
}

async function main() {
  const uri =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGO_URL / MONGODB_URI");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const report = [];
  report.push(await migrateModConfigs(db));
  report.push(await migratePersonalityPanels(db));
  report.push(await migrateChannelSnapshots(db));
  report.push(await migrateSkullboardPosts(db));
  report.push(await migratePartnershipBlacklist(db));
  console.log(APPLY ? "APPLY — risultato:" : "DRY-RUN (nessuna scrittura):");
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) {
    console.log("\nAggiungi --apply per scrivere nel database.");
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});