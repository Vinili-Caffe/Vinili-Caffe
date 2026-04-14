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
    const chId = String(p?.requestChannelId || "").trim() || defaultPauseCh;
    if (!chId) continue;
    const ch = guild.channels.cache.get(chId) || (await getGuildChannelCached(guild, chId));
    if (!ch?.messages?.fetch) continue;
    for (const mid of [p?.requestMessageId, p?.requestMessageIdPm]) {
      const msgId = String(mid || "").trim();
      if (!msgId) continue;
      const msg = await ch.messages.fetch(msgId).catch(() => null);
      await msg?.delete?.().catch(() => null);
    }
  }
}

const DEPEX_SCAN_FETCH_LIMIT = 100;
const DEPEX_SCAN_MAX_MESSAGES_PER_CHANNEL = 1500;

function messageLooksRelatedToUser(msg, userId) {
  if (!msg || !userId) return false;
  const uid = String(userId);
  if (String(msg.author?.id || "") === uid) return true;
  const content = String(msg.content || "");
  if (content.includes(`<@${uid}>`) || content.includes(`<@!${uid}>`) || content.includes(uid)) {
    return true;
  }
  const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
  return embeds.some((e) => {
    const title = String(e?.title || e?.data?.title || "");
    const desc = String(e?.description || e?.data?.description || "");
    const footer = String(e?.footer?.text || e?.data?.footer?.text || "");
    return (
      title.includes(uid) ||
      desc.includes(uid) ||
      footer.includes(uid) ||
      title.includes(`<@${uid}>`) ||
      desc.includes(`<@${uid}>`) ||
      title.includes(`<@!${uid}>`) ||
      desc.includes(`<@!${uid}>`)
    );
  });
}

async function deleteUserRelatedMessagesInChannel(guild, channelId, userId) {
  const chId = String(channelId || "").trim();
  if (!chId || !guild) return 0;
  const channel = guild.channels.cache.get(chId) || (await getGuildChannelCached(guild, chId));
  if (!channel?.messages?.fetch) return 0;
  let deleted = 0;
  let before = null;
  let scanned = 0;
  while (scanned < DEPEX_SCAN_MAX_MESSAGES_PER_CHANNEL) {
    const batch = await channel.messages
      .fetch({ limit: DEPEX_SCAN_FETCH_LIMIT, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!batch?.size) break;
    for (const msg of batch.values()) {
      scanned += 1;
      if (messageLooksRelatedToUser(msg, userId)) {
        const ok = await msg.delete().then(() => true).catch(() => false);
        if (ok) deleted += 1;
      }
      if (scanned >= DEPEX_SCAN_MAX_MESSAGES_PER_CHANNEL) break;
    }
    before = batch.last()?.id || null;
    if (!before || batch.size < DEPEX_SCAN_FETCH_LIMIT) break;
  }
  return deleted;
}

async function deleteStaffRelatedMessagesFromConfiguredChannels(guild, userId) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return { deleted: 0 };
  const channelIds = [
    IDs.channels?.pause,
    IDs.channels?.valutazioniStaff,
    IDs.channels?.warnStaff,
    IDs.channels?.puntiTolti,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  let deleted = 0;
  for (const channelId of channelIds) {
    deleted += await deleteUserRelatedMessagesInChannel(guild, channelId, uid);
  }
  return { deleted };
}

module.exports = { getOrCreateStaffDoc, deleteThreadForMessage, deleteStaffPauseRequestChannelMessages, deleteStaffRelatedMessagesFromConfiguredChannels, ensureStaff };