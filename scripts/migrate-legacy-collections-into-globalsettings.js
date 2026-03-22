/**
 * Migra in `globalsettings` (Mongoose GlobalSettings + doc bucket _counterKey):
 * - mod_config → campo modConfig per guildId
 * - personalitypanels → personalityPanels[]
 * - channelsnapshots → channelSnapshots[]
 * - skullboardposts → skullboardPosts[]
 * - partnershipblacklistguilds → bucket.partnershipBlacklistGuilds[]
 *
 * **Non** è `migrate-legacy-schemas.js`: quello importa staff/event/minigame/profile verso `staffs` e
 * `activityuserprofiles`. Questo script è solo per la config globale per-guild + bucket ticket/quote.
 *
 * Di default **unisce** (merge) con i documenti GlobalSettings già presenti (stesso guildId),
 * così non perdi dati già migrati o scritti dal bot. I valori legacy hanno priorità sulle stesse chiavi.
 *
 * Con `--apply`, il report include `mongo`: `touched` = matchedCount+upsertedCount per update.
 * Un secondo run con dati già allineati può dare `modifiedCount: 0` ma `touched > 0` (match senza cambiamenti).
 *
 * Uso:
 *   node scripts/migrate-legacy-collections-into-globalsettings.js
 *   node scripts/migrate-legacy-collections-into-globalsettings.js --apply
 *   node scripts/migrate-legacy-collections-into-globalsettings.js --apply --replace-from-legacy
 *
 * `--replace-from-legacy`: comportamento vecchio — gli array legacy sostituiscono del tutto
 * personalityPanels / channelSnapshots / skullboardPosts (solo dati legacy per quella guild).
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
const REPLACE_FROM_LEGACY = process.argv.includes("--replace-from-legacy");

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

function toGuildId(r) {
  const v = r.guildId ?? r.GuildId ?? r.guild_id;
  return v != null ? String(v).trim() : "";
}

async function resolveCollection(db, candidates) {
  const all = await db.listCollections().toArray();
  const names = new Set(all.map((x) => x.name));
  for (const c of candidates) {
    if (names.has(c)) return c;
  }
  const byLower = new Map(all.map((x) => [String(x.name).toLowerCase(), x.name]));
  for (const c of candidates) {
    const f = byLower.get(String(c).toLowerCase());
    if (f) return f;
  }
  return null;
}

function normalizeModConfigShape(m) {
  if (!m || typeof m !== "object") return {};
  return {
    logChannelId: m.logChannelId ?? m.log_channel_id ?? null,
    dmOnAction: m.dmOnAction !== false,
    caseCounter: Number(m.caseCounter ?? m.case_counter ?? 0),
    exemptRoles: Array.isArray(m.exemptRoles) ? m.exemptRoles : [],
    exemptChannels: Array.isArray(m.exemptChannels) ? m.exemptChannels : [],
  };
}

/** Solo chiavi presenti nel documento legacy (flat o dentro `modConfig`), così il merge non azzera campi mancanti. */
function extractModConfigFieldsPresent(r) {
  const flat = pick(r, ["logChannelId", "dmOnAction", "caseCounter", "exemptRoles", "exemptChannels"]);
  const nested = r.modConfig && typeof r.modConfig === "object" ? r.modConfig : {};
  const raw = { ...nested, ...flat };
  if (raw.log_channel_id !== undefined && raw.logChannelId === undefined) raw.logChannelId = raw.log_channel_id;
  if (raw.case_counter !== undefined && raw.caseCounter === undefined) raw.caseCounter = raw.case_counter;
  const keys = ["logChannelId", "dmOnAction", "caseCounter", "exemptRoles", "exemptChannels"];
  const partial = {};
  for (const k of keys) {
    if (raw[k] !== undefined) partial[k] = raw[k];
  }
  return Object.keys(partial).length ? partial : null;
}

function applyPartialModConfig(base, partial) {
  const next = { ...base };
  for (const k of Object.keys(partial)) {
    if (k === "logChannelId") next.logChannelId = partial[k] ?? null;
    else if (k === "dmOnAction") next.dmOnAction = partial[k] !== false;
    else if (k === "caseCounter") next.caseCounter = Number(partial[k] ?? 0);
    else if (k === "exemptRoles") next.exemptRoles = Array.isArray(partial[k]) ? partial[k] : [];
    else if (k === "exemptChannels") next.exemptChannels = Array.isArray(partial[k]) ? partial[k] : [];
  }
  return next;
}

function personalityEntryFromLegacy(r) {
  const channelId = String(r.channelId ?? r.channel_id ?? "").trim();
  if (!channelId) return null;
  return {
    channelId,
    personalityMessageId: r.personalityMessageId ?? r.personality_message_id ?? null,
    mentionsMessageId: r.mentionsMessageId ?? null,
    colorsMessageId: r.colorsMessageId ?? null,
    plusColorsMessageId: r.plusColorsMessageId ?? null,
    infoMessageId1: r.infoMessageId1 ?? null,
    infoMessageId2: r.infoMessageId2 ?? null,
    verifyInfoMessageId: r.verifyInfoMessageId ?? null,
    verifyPanelMessageId: r.verifyPanelMessageId ?? null,
    ticketInfoMessageId: r.ticketInfoMessageId ?? null,
    ticketPanelMessageId: r.ticketPanelMessageId ?? null,
    sponsorTicketPanelMessageId: r.sponsorTicketPanelMessageId ?? null,
  };
}

function channelSnapshotFromLegacy(r) {
  const channelId = String(r.channelId ?? r.channel_id ?? "").trim();
  if (!channelId) return null;
  let deletedAt = r.deletedAt ?? r.deleted_at;
  if (deletedAt != null && !(deletedAt instanceof Date)) deletedAt = new Date(deletedAt);
  return {
    channelId,
    name: r.name != null ? String(r.name) : "",
    type: r.type != null ? Number(r.type) : null,
    parentId: r.parentId != null ? String(r.parentId) : r.parent_id != null ? String(r.parent_id) : null,
    deletedAt: deletedAt || null,
  };
}

function skullboardEntryFromLegacy(r) {
  const messageId = String(r.messageId ?? r.message_id ?? "").trim();
  if (!messageId) return null;
  const postMessageId = r.postMessageId ?? r.post_message_id;
  return {
    messageId,
    postMessageId: postMessageId != null ? String(postMessageId) : null,
  };
}

function emptyMongoStats() {
  return { matched: 0, modified: 0, upserted: 0, touched: 0 };
}

function addMongoStats(stats, res) {
  if (!stats || !res) return;
  const m = Number(res.matchedCount ?? 0);
  const mod = Number(res.modifiedCount ?? 0);
  const u = Number(res.upsertedCount ?? 0);
  stats.matched += m;
  stats.modified += mod;
  stats.upserted += u;
  stats.touched += m + u;
}

function mergeByKey(existing, incoming, keyFn) {
  const map = new Map();
  for (const x of existing || []) {
    const k = keyFn(x);
    if (k) map.set(k, { ...x });
  }
  for (const x of incoming || []) {
    const k = keyFn(x);
    if (!k) continue;
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, ...x } : { ...x });
  }
  return [...map.values()];
}

async function migrateModConfigs(db) {
  const collName = await resolveCollection(db, ["mod_config", "modconfigs", "ModConfig"]);
  if (!collName) return { name: "mod_config", collection: null, count: 0, skipped: 0 };
  const coll = db.collection(collName);
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "mod_config", collection: collName, count: 0, skipped: 0 };
  const rows = await coll.find({}).toArray();
  let merged = 0;
  let skipped = 0;
  const mongo = emptyMongoStats();
  for (const r of rows) {
    const guildId = toGuildId(r);
    if (!guildId) {
      skipped += 1;
      continue;
    }
    const partial = extractModConfigFieldsPresent(r);
    if (!partial) {
      skipped += 1;
      continue;
    }
    if (!APPLY) {
      merged += 1;
      continue;
    }
    let modConfig;
    if (REPLACE_FROM_LEGACY) {
      modConfig = normalizeModConfigShape({ ...{}, ...partial });
    } else {
      const existing = await GlobalSettings.findOne({ guildId }).select("modConfig").lean().catch(() => null);
      const base = normalizeModConfigShape(existing?.modConfig || {});
      modConfig = applyPartialModConfig(base, partial);
    }
    const ur = await GlobalSettings.updateOne(
      { guildId },
      {
        $set: { modConfig },
        $setOnInsert: { guildId },
      },
      { upsert: true },
    ).catch(() => null);
    addMongoStats(mongo, ur);
    merged += 1;
  }
  return { name: "mod_config", collection: collName, count: merged, skipped, ...(APPLY ? { mongo } : {}) };
}

async function migratePersonalityPanels(db) {
  const collName = await resolveCollection(db, ["personalitypanels", "personalityPanels", "PersonalityPanel"]);
  if (!collName) return { name: "personalitypanels", collection: null, count: 0, skipped: 0 };
  const coll = db.collection(collName);
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "personalitypanels", collection: collName, count: 0, skipped: 0 };
  const rows = await coll.find({}).toArray();
  const byGuild = new Map();
  let skipped = 0;
  for (const r of rows) {
    const gid = toGuildId(r);
    if (!gid) {
      skipped += 1;
      continue;
    }
    const entry = personalityEntryFromLegacy(r);
    if (!entry) {
      skipped += 1;
      continue;
    }
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid).push(entry);
  }
  let merged = 0;
  const mongo = emptyMongoStats();
  for (const [guildId, incoming] of byGuild) {
    if (!APPLY) {
      merged += incoming.length;
      continue;
    }
    let personalityPanels = incoming;
    if (!REPLACE_FROM_LEGACY) {
      const existing = await GlobalSettings.findOne({ guildId }).select("personalityPanels").lean().catch(() => null);
      personalityPanels = mergeByKey(existing?.personalityPanels || [], incoming, (x) => String(x.channelId || ""));
    }
    const ur = await GlobalSettings.updateOne(
      { guildId },
      { $set: { personalityPanels }, $setOnInsert: { guildId } },
      { upsert: true },
    ).catch(() => null);
    addMongoStats(mongo, ur);
    merged += incoming.length;
  }
  return { name: "personalitypanels", collection: collName, count: merged, skipped, ...(APPLY ? { mongo } : {}) };
}

async function migrateChannelSnapshots(db) {
  const collName = await resolveCollection(db, ["channelsnapshots", "channelSnapshots", "ChannelSnapshot"]);
  if (!collName) return { name: "channelsnapshots", collection: null, count: 0, skipped: 0 };
  const coll = db.collection(collName);
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "channelsnapshots", collection: collName, count: 0, skipped: 0 };
  const rows = await coll.find({}).toArray();
  const byGuild = new Map();
  let skipped = 0;
  for (const r of rows) {
    const gid = toGuildId(r);
    const entry = channelSnapshotFromLegacy(r);
    if (!gid || !entry) {
      skipped += 1;
      continue;
    }
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid).push(entry);
  }
  let merged = 0;
  const mongo = emptyMongoStats();
  for (const [guildId, incoming] of byGuild) {
    if (!APPLY) {
      merged += incoming.length;
      continue;
    }
    let channelSnapshots = incoming;
    if (!REPLACE_FROM_LEGACY) {
      const existing = await GlobalSettings.findOne({ guildId }).select("channelSnapshots").lean().catch(() => null);
      channelSnapshots = mergeByKey(existing?.channelSnapshots || [], incoming, (x) => String(x.channelId || ""));
    }
    const ur = await GlobalSettings.updateOne(
      { guildId },
      { $set: { channelSnapshots }, $setOnInsert: { guildId } },
      { upsert: true },
    ).catch(() => null);
    addMongoStats(mongo, ur);
    merged += incoming.length;
  }
  return { name: "channelsnapshots", collection: collName, count: merged, skipped, ...(APPLY ? { mongo } : {}) };
}

async function migrateSkullboardPosts(db) {
  const collName = await resolveCollection(db, ["skullboardposts", "skullboardPosts", "SkullboardPost"]);
  if (!collName) return { name: "skullboardposts", collection: null, count: 0, skipped: 0 };
  const coll = db.collection(collName);
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "skullboardposts", collection: collName, count: 0, skipped: 0 };
  const rows = await coll.find({}).toArray();
  const byGuild = new Map();
  let skipped = 0;
  for (const r of rows) {
    const gid = toGuildId(r);
    const entry = skullboardEntryFromLegacy(r);
    if (!gid || !entry) {
      skipped += 1;
      continue;
    }
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid).push(entry);
  }
  let merged = 0;
  const mongo = emptyMongoStats();
  for (const [guildId, incoming] of byGuild) {
    if (!APPLY) {
      merged += incoming.length;
      continue;
    }
    let skullboardPosts = incoming;
    if (!REPLACE_FROM_LEGACY) {
      const existing = await GlobalSettings.findOne({ guildId }).select("skullboardPosts").lean().catch(() => null);
      skullboardPosts = mergeByKey(existing?.skullboardPosts || [], incoming, (x) => String(x.messageId || ""));
    }
    const ur = await GlobalSettings.updateOne(
      { guildId },
      { $set: { skullboardPosts }, $setOnInsert: { guildId } },
      { upsert: true },
    ).catch(() => null);
    addMongoStats(mongo, ur);
    merged += incoming.length;
  }
  return { name: "skullboardposts", collection: collName, count: merged, skipped, ...(APPLY ? { mongo } : {}) };
}

async function migratePartnershipBlacklist(db) {
  const collName = await resolveCollection(db, [
    "partnershipblacklistguilds",
    "partnershipBlacklistGuilds",
    "PartnershipBlacklistGuild",
  ]);
  if (!collName) return { name: "partnershipblacklistguilds", collection: null, count: 0 };
  const coll = db.collection(collName);
  const n = await coll.countDocuments().catch(() => 0);
  if (!n) return { name: "partnershipblacklistguilds", collection: collName, count: 0 };
  const rows = await coll.find({}).toArray();
  const next = rows
    .map((r) => ({
      guildId: toGuildId(r) || String(r.guildId || ""),
      addedBy: r.addedBy != null ? String(r.addedBy) : r.added_by != null ? String(r.added_by) : null,
      note: String(r.note || "").slice(0, 500),
      addedAt: r.addedAt ? new Date(r.addedAt) : r.added_at ? new Date(r.added_at) : new Date(),
    }))
    .filter((x) => /^\d{16,20}$/.test(x.guildId));
  if (!APPLY) return { name: "partnershipblacklistguilds", collection: collName, count: next.length };
  const gcoll = db.collection("globalsettings");
  const mongo = emptyMongoStats();
  const urBucket = await gcoll.updateOne(
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
  ).catch(() => null);
  addMongoStats(mongo, urBucket);
  await ensureBucketArrays();
  const existing = await getPartnershipBlacklistEntries();
  const map = new Map();
  for (const x of existing) map.set(String(x.guildId), x);
  for (const x of next) map.set(x.guildId, { ...map.get(x.guildId), ...x });
  await setPartnershipBlacklistEntries([...map.values()]);
  return { name: "partnershipblacklistguilds", collection: collName, count: next.length, mongo };
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
  const report = {
    mergeMode: REPLACE_FROM_LEGACY ? "replace-from-legacy" : "merge-with-existing",
    steps: [],
  };
  report.steps.push(await migrateModConfigs(db));
  report.steps.push(await migratePersonalityPanels(db));
  report.steps.push(await migrateChannelSnapshots(db));
  report.steps.push(await migrateSkullboardPosts(db));
  report.steps.push(await migratePartnershipBlacklist(db));
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