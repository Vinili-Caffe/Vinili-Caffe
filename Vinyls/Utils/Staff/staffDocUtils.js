const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { isValidGuildUserId } = require("../DB/validateWriteIds");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

function ensureStaff(profileDoc) {
  if (!profileDoc) return null;
  if (!profileDoc.staff) {
    profileDoc.staff = {};
  }
  return profileDoc.staff;
}

async function getOrCreateStaffDoc(guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!isValidGuildUserId(g, u)) return null;
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $setOnInsert: { guildId: g, userId: u } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!doc) return null;
  ensureStaff(doc);
  return doc;
}

async function deleteThreadForMessage(guild, messageIdOrMessage) {
  const id = typeof messageIdOrMessage === "object" && messageIdOrMessage != null
    ? String(messageIdOrMessage?.id || "")
    : String(messageIdOrMessage || "");
  if (!/^\d{16,20}$/.test(id)) return;
  const thread = guild.channels.cache.get(id) || (await getGuildChannelCached(guild, id));
  if (thread?.isThread?.()) {
    await thread.delete().catch(() => null);
  }
}

/** Elimina dal canale pausa i messaggi (e thread collegati) delle richieste salvate nel profilo, usando i dati in DB. */
async function deleteStaffPauseRequestChannelMessages(guild, userId) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !guild) return;
  const defaultPauseCh = String(IDs.channels?.pause || "").trim();
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("staff.pauses")
    .lean()
    .catch(() => null);
  const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
  for (const p of pauses) {
    const threadId = String(p?.requestThreadId || "").trim();
    if (threadId) await deleteThreadForMessage(guild, threadId);
    const msgId = String(p?.requestMessageId || "").trim();
    const chId = String(p?.requestChannelId || "").trim() || defaultPauseCh;
    if (!msgId || !chId) continue;
    const ch = guild.channels.cache.get(chId) || (await getGuildChannelCached(guild, chId));
    if (!ch?.messages?.fetch) continue;
    const msg = await ch.messages.fetch(msgId).catch(() => null);
    await msg?.delete?.().catch(() => null);
  }
}

module.exports = { getOrCreateStaffDoc, deleteThreadForMessage, deleteStaffPauseRequestChannelMessages, ensureStaff };