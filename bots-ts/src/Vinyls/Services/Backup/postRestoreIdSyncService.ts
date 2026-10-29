"use strict";
/**
 * After guild structure restore: remap Mongo + panel recipes using role/channel maps.
 * Does NOT recreate open ticket channels (site/web tickets only).
 */
const {
  persistGuildIdRemap,
  remapRoleIdForward,
  remapChannelIdForward,
  remapDeepIdsInPlace,
  normalizeId,
} = require("../../Utils/Config/emergencyIdRemap") as typeof import("../../Utils/Config/emergencyIdRemap");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { GlobalSettings, ActivityUserProfile, UserLeaveBackup } =
  require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "1329080093599076474").trim();

const PANEL_MESSAGE_SLOT_KEYS = [
  "personalityMessageId",
  "dmPanelMessageId",
  "mentionsMessageId",
  "colorsMessageId",
  "plusColorsMessageId",
  "infoGifMessageId",
  "infoMessageId1",
  "infoMessageId2",
  "verifyInfoMessageId",
  "verifyPanelMessageId",
  "ticketInfoMessageId",
  "ticketPanelMessageId",
  "sponsorTicketPanelMessageId",
  "pausePanelMessageId",
  "sanzioniPanelMessageId",
];

function mapId(map?, oldId?) {
  const o = normalizeId(oldId);
  if (!o) return "";
  if (map instanceof Map) {
    const hit = map.get(o);
    return normalizeId(hit) || o;
  }
  if (map && typeof map === "object" && map[o]) return normalizeId(map[o]) || o;
  return o;
}

async function remapActivityProfiles({ guildId, roleMap, channelMap }) {
  const gid = String(guildId || MAIN_GUILD_ID);
  const cursor = ActivityUserProfile.find({ guildId: gid })
    .select("_id profile.customRole profile.discordState profile.personalityRoleIds")
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;
  for await (const doc of cursor) {
    scanned += 1;
    const set: Record<string, any> = {};
    const cr = doc?.profile?.customRole || {};
    if (cr.roleId) {
      const n = mapId(roleMap, cr.roleId) || remapRoleIdForward(cr.roleId);
      if (n && n !== String(cr.roleId)) set["profile.customRole.roleId"] = n;
    }
    if (cr.secondaryRoleId) {
      const n = mapId(roleMap, cr.secondaryRoleId) || remapRoleIdForward(cr.secondaryRoleId);
      if (n && n !== String(cr.secondaryRoleId)) set["profile.customRole.secondaryRoleId"] = n;
    }
    if (cr.customVocChannelId) {
      const n = mapId(channelMap, cr.customVocChannelId) || remapChannelIdForward(cr.customVocChannelId);
      if (n && n !== String(cr.customVocChannelId)) set["profile.customRole.customVocChannelId"] = n;
    }

    const ds = doc?.profile?.discordState;
    if (ds && typeof ds === "object") {
      const next = JSON.parse(JSON.stringify(ds));
      remapDeepIdsInPlace(next, ["role", "channel", "emoji"]);
      if (JSON.stringify(next) !== JSON.stringify(ds)) {
        set["profile.discordState"] = next;
      }
    }

    if (Array.isArray(doc?.profile?.personalityRoleIds) && doc.profile.personalityRoleIds.length) {
      const next = doc.profile.personalityRoleIds.map(
        (id?) => mapId(roleMap, id) || remapRoleIdForward(id) || id,
      );
      if (next.some((id?, i?) => String(id) !== String(doc.profile.personalityRoleIds[i]))) {
        set["profile.personalityRoleIds"] = next;
      }
    }

    if (!Object.keys(set).length) continue;
    await ActivityUserProfile.updateOne({ _id: doc._id }, { $set: set }).catch(() => null);
    updated += 1;
  }
  return { scanned, updated };
}

async function remapLeaveBackups({ guildId, roleMap }) {
  const gid = String(guildId || MAIN_GUILD_ID);
  const rows = await UserLeaveBackup.find({ guildId: gid })
    .select("_id restoreRoleIds")
    .lean()
    .catch(() => []);
  let updated = 0;
  for (const row of rows || []) {
    const ids = Array.isArray(row.restoreRoleIds) ? row.restoreRoleIds : [];
    if (!ids.length) continue;
    const next = ids.map((id?) => mapId(roleMap, id) || remapRoleIdForward(id) || id);
    if (next.every((id?, i?) => String(id) === String(ids[i]))) continue;
    await UserLeaveBackup.updateOne({ _id: row._id }, { $set: { restoreRoleIds: next } }).catch(() => null);
    updated += 1;
  }
  return { scanned: rows?.length || 0, updated };
}

async function remapGlobalSettingsPanels({ guildId, channelMap }) {
  const gid = String(guildId || MAIN_GUILD_ID);
  const doc = await GlobalSettings.findOne({ guildId: gid })
    .select("personalityPanels discordPanelRecipes")
    .lean()
    .catch(() => null);
  if (!doc) return { panels: 0, recipes: 0, clearedSlots: 0 };

  let clearedSlots = 0;
  const panels = Array.isArray(doc.personalityPanels)
    ? doc.personalityPanels.map((row?) => {
        const next = { ...row };
        const oldCid = String(row?.channelId || "").trim();
        if (oldCid) {
          next.channelId =
            mapId(channelMap, oldCid) || remapChannelIdForward(oldCid) || oldCid;
        }
        // Message IDs are invalid after wipe — clear so panels republish cleanly.
        for (const key of PANEL_MESSAGE_SLOT_KEYS) {
          if (next[key]) {
            next[key] = null;
            clearedSlots += 1;
          }
        }
        return next;
      })
    : [];

  let recipesTouched = 0;
  const recipesDoc = doc.discordPanelRecipes && typeof doc.discordPanelRecipes === "object"
    ? { ...doc.discordPanelRecipes }
    : null;
  if (recipesDoc && Array.isArray(recipesDoc.recipes)) {
    recipesDoc.recipes = recipesDoc.recipes.map((r?) => {
      const next = { ...r };
      if (next.channelId) {
        const n =
          mapId(channelMap, next.channelId) || remapChannelIdForward(next.channelId) || next.channelId;
        if (n !== String(next.channelId)) recipesTouched += 1;
        next.channelId = n;
      }
      next.messageSlots = {};
      return next;
    });
    // Force cleanup re-run on next panel publish.
    recipesDoc.cleanupFingerprint = "";
  }

  await GlobalSettings.updateOne(
    { guildId: gid },
    {
      $set: {
        personalityPanels: panels,
        ...(recipesDoc ? { discordPanelRecipes: recipesDoc } : {}),
      },
      $setOnInsert: { guildId: gid },
    },
    { upsert: true },
  ).catch(() => null);

  return { panels: panels.length, recipes: recipesTouched, clearedSlots };
}

async function remapTicketChannelIds({ guildId, channelMap }) {
  // Remap stored channel IDs only — do not recreate Discord ticket channels (web-only).
  let updated = 0;
  let scanned = 0;
  try {
    const mongoose = require("mongoose") as typeof import("mongoose");
    const db = mongoose.connection?.db;
    if (!db) return { scanned: 0, updated: 0 };

    for (const collName of ["tickets", "guildfeaturebuckets"]) {
      const coll = db.collection(collName);
      if (collName === "tickets") {
        const cursor = coll.find({ guildId: String(guildId) }, { projection: { channelId: 1 } });
        for await (const row of cursor) {
          scanned += 1;
          const old = String(row?.channelId || "").trim();
          if (!old) continue;
          const next = mapId(channelMap, old) || remapChannelIdForward(old) || old;
          if (next === old) continue;
          await coll.updateOne({ _id: row._id }, { $set: { channelId: next } });
          updated += 1;
        }
      } else {
        const doc = await coll.findOne(
          { guildId: String(guildId) },
          { projection: { tickets: 1 } },
        );
        const tickets = Array.isArray(doc?.tickets) ? doc.tickets : [];
        if (!tickets.length) continue;
        let dirty = false;
        const nextTickets = tickets.map((t?) => {
          scanned += 1;
          const old = String(t?.channelId || "").trim();
          if (!old) return t;
          const n = mapId(channelMap, old) || remapChannelIdForward(old) || old;
          if (n !== old) {
            dirty = true;
            updated += 1;
            return { ...t, channelId: n };
          }
          return t;
        });
        if (dirty) {
          await coll.updateOne({ _id: doc._id }, { $set: { tickets: nextTickets } });
        }
      }
    }
  } catch (err) {
    global.logger?.warn?.("[postRestoreIdSync] ticket remap:", err?.message || err);
  }
  return { scanned, updated };
}

/**
 * Persist remap files + sync Mongo. Call at end of applyBackupToGuild.
 */
async function runPostRestoreIdSync({
  guildId,
  backupId,
  roleMap,
  channelMap,
  emojiMap,
  stickerMap,
  syncMongo = true,
} = {}) {
  const persisted = persistGuildIdRemap({
    guildId,
    backupId,
    roleMap,
    channelMap,
    emojiMap,
    stickerMap,
  });

  // Apply onto in-memory ids for this process immediately.
  try {
    const { applyEmergencyIdRemapToIds } = require("../../Utils/Config/emergencyIdRemap") as typeof import("../../Utils/Config/emergencyIdRemap");
    applyEmergencyIdRemapToIds(IDs);
  } catch (_) {}

  const out = {
    persisted: {
      roles: Object.keys(persisted.roleRemap || {}).length,
      channels: Object.keys(persisted.channelRemap || {}).length,
      emojis: Object.keys(persisted.emojiRemap || {}).length,
      stickers: Object.keys(persisted.stickerRemap || {}).length,
    },
    mongo: null,
  };

  if (syncMongo) {
    const profiles = await remapActivityProfiles({ guildId, roleMap, channelMap });
    const leave = await remapLeaveBackups({ guildId, roleMap });
    const panels = await remapGlobalSettingsPanels({ guildId, channelMap });
    const tickets = await remapTicketChannelIds({ guildId, channelMap });
    out.mongo = { profiles, leave, panels, tickets };
  }

  global.logger?.info?.(
    `[postRestoreIdSync] guild=${guildId} backup=${backupId} roles=${out.persisted.roles} channels=${out.persisted.channels} emojis=${out.persisted.emojis} mongoProfiles=${out.mongo?.profiles?.updated ?? 0} panelsCleared=${out.mongo?.panels?.clearedSlots ?? 0}`,
  );
  return out;
}

export = {
  runPostRestoreIdSync,
  remapActivityProfiles,
  remapLeaveBackups,
  remapGlobalSettingsPanels,
  remapTicketChannelIds,
};
