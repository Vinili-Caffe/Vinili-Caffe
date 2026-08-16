const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { isValidGuildUserId } = require("../DB/validateWriteIds");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

function reconcileStaffValutazioneCounters(staff) {
  if (!staff || typeof staff !== "object") return false;
  const posLen = Array.isArray(staff.positiveReasons) ? staff.positiveReasons.length : 0;
  const negLen = Array.isArray(staff.negativeReasons) ? staff.negativeReasons.length : 0;
  const total = posLen + negLen;
  let changed = false;
  if (Math.floor(Number(staff.positiveCount) || 0) !== posLen) {
    staff.positiveCount = posLen;
    changed = true;
  }
  if (Math.floor(Number(staff.negativeCount) || 0) !== negLen) {
    staff.negativeCount = negLen;
    changed = true;
  }
  if (Math.floor(Number(staff.valutazioniCount) || 0) !== total) {
    staff.valutazioniCount = total;
    changed = true;
  }
  return changed;
}

function ensureStaff(profileDoc) {
  if (!profileDoc) return null;
  if (!profileDoc.staff) {
    profileDoc.staff = {};
  }
  if (Array.isArray(profileDoc.staff.autoValutazioni)) {
    profileDoc.staff.autoValutazioni = profileDoc.staff.autoValutazioni.filter((entry) => {
      const key = String(entry?.key || "").trim();
      const type = String(entry?.type || "").trim();
      return key && (type === "positive" || type === "negative");
    });
  }
  reconcileStaffValutazioneCounters(profileDoc.staff);
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

/**
 * Incremento atomico contatori valutazione (evita ID duplicati con sync auto + manuale in parallelo).
 * @param {string} guildId
 * @param {string} userId
 * @param {"positive"|"negative"} kind
 * @param {string} [reason]
 * @returns {Promise<{ valutazioniCount: number, sectionCount: number }|null>}
 */
async function incrementStaffValutazioneCounters(guildId, userId, kind, reason = "") {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!isValidGuildUserId(g, u)) return null;
  const negative = kind === "negative";
  const inc = negative
    ? { "staff.valutazioniCount": 1, "staff.negativeCount": 1 }
    : { "staff.valutazioniCount": 1, "staff.positiveCount": 1 };
  const reasonsKey = negative ? "staff.negativeReasons" : "staff.positiveReasons";
  const reasonText = String(reason || "");
  const update = { $inc: inc };
  if (reasonText) update.$push = { [reasonsKey]: reasonText };
  const doc = await ActivityUserProfile.findOneAndUpdate({ guildId: g, userId: u }, update, {
    new: true,
    projection: { "staff.valutazioniCount": 1, "staff.positiveCount": 1, "staff.negativeCount": 1 },
  })
    .lean()
    .catch(() => null);
  if (!doc?.staff) return null;
  const s = doc.staff;
  return {
    valutazioniCount: Math.max(0, Math.floor(Number(s.valutazioniCount) || 0)),
    sectionCount: Math.max(
      0,
      Math.floor(Number(negative ? s.negativeCount : s.positiveCount) || 0),
    ),
  };
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

function embedTextBlob(embed) {
  const parts = [
    embed?.title,
    embed?.description,
    embed?.footer?.text,
    embed?.author?.name,
  ];
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  for (const field of fields) {
    parts.push(field?.name, field?.value);
  }
  return parts.map((x) => String(x || "")).join("\n");
}

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
    const blob = embedTextBlob(e?.data || e);
    return blob.includes(uid) || blob.includes(`<@${uid}>`) || blob.includes(`<@!${uid}>`);
  });
}

function collectStaffMessageRefs(staff) {
  const seen = new Set();
  const out = [];
  const lists = [
    staff?.positiveValutazioni,
    staff?.negativeValutazioni,
    staff?.autoValutazioni,
  ];
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list : []) {
      const channelId = String(entry?.channelId || "").trim();
      const messageId = String(entry?.messageId || "").trim();
      const key = `${channelId}:${messageId}`;
      if (!channelId || !messageId || seen.has(key)) continue;
      seen.add(key);
      out.push({ channelId, messageId });
    }
  }
  return out;
}

async function deleteStaffMessagesByKnownIds(guild, staff) {
  const refs = collectStaffMessageRefs(staff);
  if (!refs.length || !guild) return 0;
  let deleted = 0;
  for (const { channelId, messageId } of refs) {
    const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
    if (!channel?.messages?.fetch) continue;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) continue;
    const ok = await msg.delete().then(() => true).catch(() => false);
    if (ok) deleted += 1;
  }
  return deleted;
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

const STAFF_ROLES_HISTORY_RETENTION_CAP = 400;

/** Campi partnership da conservare al depex completo (cronologia +profile pm / classifica storica). */
const PARTNERSHIP_STAFF_RETENTION_KEYS = Object.freeze([
  "partnerActions",
  "partnerCount",
  "partnerRedeemSpend",
  "partnerServerResetAt",
  "partnerMilestoneDmSent",
  "partnerManagerCustomPerksUntil",
  "partnerManagerVipUntil",
]);

function extractPartnershipStaffRetention(staff) {
  if (!staff || typeof staff !== "object") return null;
  const out = {};
  let keep = false;
  for (const key of PARTNERSHIP_STAFF_RETENTION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(staff, key)) continue;
    const value = staff[key];
    if (key === "partnerActions") {
      const actions = Array.isArray(value) ? value : [];
      if (actions.length) {
        out.partnerActions = actions;
        keep = true;
      }
      continue;
    }
    if (key === "partnerMilestoneDmSent") {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length) {
        out.partnerMilestoneDmSent = arr;
        keep = true;
      }
      continue;
    }
    if (key === "partnerCount" || key === "partnerRedeemSpend") {
      const n = Math.max(0, Math.floor(Number(value) || 0));
      if (n > 0) {
        out[key] = n;
        keep = true;
      }
      continue;
    }
    if (value != null && value !== "") {
      out[key] = value;
      keep = true;
    }
  }
  return keep ? out : null;
}

/**
 * Prima di rimuovere il tracciamento staff al depex:
 * - archivia `rolesHistory` in `staffRolesHistoryRetention`
 * - conserva cronologia/punti partnership (`partnerActions`, ecc.)
 * - elimina valutazioni/warn/pause e il resto di `staff`
 */
async function archiveStaffRolesHistoryThenUnsetStaff(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !isValidGuildUserId(gid, uid)) return;
  const prev = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("staff staffRolesHistoryRetention")
    .lean()
    .catch(() => null);
  if (!prev) return;
  const hasStaff = prev.staff != null && typeof prev.staff === "object";
  if (!hasStaff) {
    await ActivityUserProfile.updateOne({ guildId: gid, userId: uid }, { $unset: { staff: "" } }).catch(() => null);
    return;
  }

  const incoming = Array.isArray(prev.staff?.rolesHistory) ? prev.staff.rolesHistory : [];
  const existing = Array.isArray(prev.staffRolesHistoryRetention) ? prev.staffRolesHistoryRetention : [];
  const merged = [...existing, ...incoming].slice(-STAFF_ROLES_HISTORY_RETENTION_CAP);
  const partnerRetention = extractPartnershipStaffRetention(prev.staff);

  const update = { $set: { staffRolesHistoryRetention: merged } };
  if (partnerRetention) {
    update.$set.staff = partnerRetention;
  } else {
    update.$unset = { staff: "" };
  }

  await ActivityUserProfile.updateOne({ guildId: gid, userId: uid, staff: { $exists: true } }, update).catch(
    () => null,
  );
}

async function deleteStaffRelatedMessagesFromConfiguredChannels(guild, userId, staffObj = null) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return { deleted: 0 };
  let staff = staffObj;
  if (!staff) {
    const doc = await ActivityUserProfile.findOne({ guildId: String(guild.id), userId: uid }, { staff: 1 })
      .lean()
      .catch(() => null);
    staff = doc?.staff;
  }
  let deleted = 0;
  if (staff) deleted += await deleteStaffMessagesByKnownIds(guild, staff);
  const channelIds = [
    IDs.channels?.pause,
    IDs.channels?.valutazioniStaff,
    IDs.channels?.warnStaff,
    IDs.channels?.puntiTolti,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  for (const channelId of channelIds) {
    deleted += await deleteUserRelatedMessagesInChannel(guild, channelId, uid);
  }
  return { deleted };
}

const STAFF_LADDER_TRACK_RESET_SET = {
  "staff.idCount": 0,
  "staff.warnCount": 0,
  "staff.warnReasons": [],
  "staff.firstWarnStaffAt": null,
  "staff.positiveCount": 0,
  "staff.negativeCount": 0,
  "staff.positiveReasons": [],
  "staff.negativeReasons": [],
  "staff.positiveValutazioni": [],
  "staff.negativeValutazioni": [],
  "staff.valutazioniCount": 0,
  "staff.autoValutazioni": [],
  "staff.webTicketRatingSum": 0,
  "staff.webTicketRatingCount": 0,
  "staff.valPosTradedPauseBonusDays": 0,
  "staff.bestStaffPauseBonusYears": [],
  "staff.serataFilmAttendanceSaturdayKey": null,
  "staff.serataFilmWillAttend": null,
  "staff.pauses": [],
};

function buildStaffLadderTrackResetUpdate() {
  return { $set: { ...STAFF_LADDER_TRACK_RESET_SET } };
}

function applyStaffLadderTrackResetToObject(staffObj) {
  if (!staffObj || typeof staffObj !== "object") return;
  staffObj.idCount = 0;
  staffObj.warnCount = 0;
  staffObj.warnReasons = [];
  staffObj.firstWarnStaffAt = null;
  staffObj.positiveCount = 0;
  staffObj.negativeCount = 0;
  staffObj.positiveReasons = [];
  staffObj.negativeReasons = [];
  staffObj.positiveValutazioni = [];
  staffObj.negativeValutazioni = [];
  staffObj.valutazioniCount = 0;
  staffObj.autoValutazioni = [];
  staffObj.webTicketRatingSum = 0;
  staffObj.webTicketRatingCount = 0;
  staffObj.valPosTradedPauseBonusDays = 0;
  staffObj.bestStaffPauseBonusYears = [];
  staffObj.serataFilmAttendanceSaturdayKey = null;
  staffObj.serataFilmWillAttend = null;
  staffObj.pauses = [];
}

async function resetStaffLadderTrackInDb(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !isValidGuildUserId(gid, uid)) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid, staff: { $exists: true } },
    buildStaffLadderTrackResetUpdate(),
  ).catch(() => null);
}

async function purgeStaffChannelMessagesForUser(guild, userId) {
  return deleteStaffRelatedMessagesFromConfiguredChannels(guild, userId);
}

module.exports = {
  getOrCreateStaffDoc,
  incrementStaffValutazioneCounters,
  deleteThreadForMessage,
  deleteStaffPauseRequestChannelMessages,
  deleteStaffRelatedMessagesFromConfiguredChannels,
  purgeStaffChannelMessagesForUser,
  ensureStaff,
  reconcileStaffValutazioneCounters,
  archiveStaffRolesHistoryThenUnsetStaff,
  extractPartnershipStaffRetention,
  buildStaffLadderTrackResetUpdate,
  applyStaffLadderTrackResetToObject,
  resetStaffLadderTrackInDb,
};