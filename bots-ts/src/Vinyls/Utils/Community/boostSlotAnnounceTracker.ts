const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../DB/validateWriteIds") as typeof import("../DB/validateWriteIds");

const slotsByKey = new Map();
const hydratedKeys = new Set();
const inflightHydrate = new Map();

function keyOf(guildId?, userId?) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function isActivityMainGuildId(guildId?) {
  return String(guildId || "") === String(IDs.guilds?.main || "");
}

function getAnnouncedBoostSlots(guildId?, userId?) {
  return Math.max(0, Number(slotsByKey.get(keyOf(guildId, userId)) || 0));
}

function setAnnouncedBoostSlots(guildId?, userId?, value?) {
  const k = keyOf(guildId, userId);
  const n = Math.max(0, Math.floor(Number(value || 0)));
  if (n <= 0) slotsByKey.delete(k);
  else slotsByKey.set(k, n);
}

async function fetchDbSlotCount(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({
    guildId: String(guildId),
    userId: String(userId),
  })
    .select("profile.serverBoostAnnouncedSlotCount")
    .lean()
    .catch(() => null);
  return Math.max(0, Math.floor(Number(doc?.profile?.serverBoostAnnouncedSlotCount || 0)));
}

async function hydrateBoostSlotsFromDatabaseOnce(guildId?, userId?) {
  const k = keyOf(guildId, userId);
  if (hydratedKeys.has(k)) return;
  if (!isActivityMainGuildId(guildId) || !isValidGuildUserId(guildId, userId)) {
    hydratedKeys.add(k);
    return;
  }
  let p = inflightHydrate.get(k);
  if (!p) {
    p = (async () => {
      const dbVal = await fetchDbSlotCount(guildId, userId);
      const mem = Math.max(0, Number(slotsByKey.get(k) || 0));
      const merged = Math.max(mem, dbVal);
      if (merged > 0) slotsByKey.set(k, merged);
      else slotsByKey.delete(k);
      hydratedKeys.add(k);
    })().finally(() => inflightHydrate.delete(k));
    inflightHydrate.set(k, p);
  }
  await p;
}

async function ensureBoostSlotsSynced(guildId?, userId?) {
  await hydrateBoostSlotsFromDatabaseOnce(guildId, userId);
}

async function persistAnnouncedBoostSlotsToDb(guildId?, userId?) {
  if (!isActivityMainGuildId(guildId) || !isValidGuildUserId(guildId, userId)) return;
  const n = getAnnouncedBoostSlots(guildId, userId);
  const g = String(guildId);
  const u = String(userId);
  if (n <= 0) {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $unset: { "profile.serverBoostAnnouncedSlotCount": "" } },
    ).catch(() => null);
    return;
  }
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    {
      $set: {
        guildId: g,
        userId: u,
        "profile.serverBoostAnnouncedSlotCount": n,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function addAnnouncedBoostSlots(guildId?, userId?, add?) {
  const k = keyOf(guildId, userId);
  const delta = Math.max(0, Math.floor(Number(add || 0)));
  const next = getAnnouncedBoostSlots(guildId, userId) + delta;
  if (next <= 0) slotsByKey.delete(k);
  else slotsByKey.set(k, next);
  await persistAnnouncedBoostSlotsToDb(guildId, userId);
  return next;
}

async function deleteAnnouncedBoostSlots(guildId?, userId?) {
  const k = keyOf(guildId, userId);
  slotsByKey.delete(k);
  hydratedKeys.delete(k);
  await persistAnnouncedBoostSlotsToDb(guildId, userId);
}

function clearAnnouncedBoostSlotsMemoryForGuild(guildId?) {
  const g = String(guildId || "");
  if (!g) return;
  const prefix = `${g}:`;
  for (const k of [...slotsByKey.keys()]) {
    if (k.startsWith(prefix)) slotsByKey.delete(k);
  }
  for (const k of [...hydratedKeys]) {
    if (k.startsWith(prefix)) hydratedKeys.delete(k);
  }
  for (const k of [...inflightHydrate.keys()]) {
    if (k.startsWith(prefix)) inflightHydrate.delete(k);
  }
}

export = {
  getAnnouncedBoostSlots,
  setAnnouncedBoostSlots,
  addAnnouncedBoostSlots,
  deleteAnnouncedBoostSlots,
  ensureBoostSlotsSynced,
  persistAnnouncedBoostSlotsToDb,
  clearAnnouncedBoostSlotsMemoryForGuild,
};