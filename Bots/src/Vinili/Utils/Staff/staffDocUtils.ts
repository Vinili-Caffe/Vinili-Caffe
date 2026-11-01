const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { isValidGuildUserId } = require("../DB/validateWriteIds") as typeof import("../DB/validateWriteIds");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");

function reconcileStaffValutazioneCounters(staff?) {
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

function ensureStaff(profileDoc?) {
  if (!profileDoc) return null;
  if (!profileDoc.staff) {
    profileDoc.staff = {};
  }
  if (Array.isArray(profileDoc.staff.autoValutazioni)) {
    profileDoc.staff.autoValutazioni = profileDoc.staff.autoValutazioni.filter((entry?) => {
      const key = String(entry?.key || "").trim();
      const type = String(entry?.type || "").trim();
      return key && (type === "positive" || type === "negative");
    });
  }
  reconcileStaffValutazioneCounters(profileDoc.staff);
  return profileDoc.staff;
}

async function getOrCreateStaffDoc(guildId?, userId?) {
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

async function incrementStaffValutazioneCounters(guildId?, userId?, kind?, reason = "") {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!isValidGuildUserId(g, u)) return null;
  const negative = kind === "negative";
  const inc = negative
    ? { "staff.valutazioniCount": 1, "staff.negativeCount": 1 }
    : { "staff.valutazioniCount": 1, "staff.positiveCount": 1 };
  const reasonsKey = negative ? "staff.negativeReasons" : "staff.positiveReasons";
  const reasonText = String(reason || "");
  const update: Record<string, any> = { $inc: inc };
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

async function deleteThreadForMessage(guild?, messageIdOrMessage?) {
  if (typeof messageIdOrMessage === "object" && messageIdOrMessage != null) {
    const msg = messageIdOrMessage;
    if (msg.thread) {
      await msg.thread.delete().catch(() => null);
      return;
    }
    const linkedThreadId = String(msg.threadId || "").trim();
    if (linkedThreadId) {
      const linked = guild.channels.cache.get(linkedThreadId) || (await getGuildChannelCached(guild, linkedThreadId));
      if (linked?.isThread?.()) {
        await linked.delete().catch(() => null);
        return;
      }
    }
    messageIdOrMessage = msg.id;
  }

  const id = String(messageIdOrMessage || "");
  if (!/^\d{16,20}$/.test(id)) return;
  const thread = guild.channels.cache.get(id) || (await getGuildChannelCached(guild, id));
  if (thread?.isThread?.()) {
    await thread.delete().catch(() => null);
  }
}

async function deleteStaffPauseRequestChannelMessages(guild?, userId?) {
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

function embedTextBlob(embed?) {
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
  return parts.map((x?) => String(x || "")).join("\n");
}

function messageLooksRelatedToUser(msg?, userId?) {
  if (!msg || !userId) return false;
  const uid = String(userId);
  if (String(msg.author?.id || "") === uid) return true;
  const content = String(msg.content || "");
  if (content.includes(`<@${uid}>`) || content.includes(`<@!${uid}>`) || content.includes(uid)) {
    return true;
  }
  const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
  if (
    embeds.some((e?) => {
      const blob = embedTextBlob(e?.data || e);
      return blob.includes(uid) || blob.includes(`<@${uid}>`) || blob.includes(`<@!${uid}>`);
    })
  ) {
    return true;
  }
    for (const row of msg.components || []) {
    for (const c of row.components || []) {
      if (String(c?.customId || "").includes(uid)) return true;
    }
  }
  return false;
}

function collectStaffMessageRefs(staff?) {
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

async function deleteStaffMessagesByKnownIds(guild?, staff?) {
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

async function deleteUserRelatedMessagesInChannel(guild?, channelId?, userId?) {
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

const PARTNERSHIP_STAFF_RETENTION_KEYS = Object.freeze([
  "partnerActions",
  "partnerCount",
  "partnerRedeemSpend",
  "partnerServerResetAt",
  "partnerMilestoneDmSent",
  "partnerManagerCustomPerksUntil",
  "partnerManagerVipUntil",
]);

function extractPartnershipStaffRetention(staff?) {
  if (!staff || typeof staff !== "object") return null;
  const out: Record<string, any> = {};
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

async function archiveStaffRolesHistoryThenUnsetStaff(guildId?, userId?) {
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
  const fromTrack = (Array.isArray(prev.staff?.trackHistory) ? prev.staff.trackHistory : [])
    .filter((row?) => {
      const k = String(row?.kind || "").toLowerCase();
      return k === "pex" || k === "depex";
    })
    .map((row?) => ({
      oldRole: row.oldRole != null ? String(row.oldRole) : "",
      newRole: row.newRole != null ? String(row.newRole) : "",
      reason: row.reason != null ? String(row.reason) : null,
      kind: String(row.kind || "").toLowerCase(),
      date: row.date || new Date(),
      actorId: row.actorId != null ? String(row.actorId) : null,
      actorName: row.actorName != null ? String(row.actorName) : null,
    }));
  const existing = Array.isArray(prev.staffRolesHistoryRetention) ? prev.staffRolesHistoryRetention : [];
  const merged = [...existing, ...incoming, ...fromTrack].slice(-STAFF_ROLES_HISTORY_RETENTION_CAP);
  const partnerRetention = extractPartnershipStaffRetention(prev.staff);

  const update: Record<string, any> = { $set: { staffRolesHistoryRetention: merged } };
  if (partnerRetention) {
    update.$set.staff = partnerRetention;
  } else {
    update.$unset = { staff: "" };
  }

  await ActivityUserProfile.updateOne({ guildId: gid, userId: uid, staff: { $exists: true } }, update).catch(
    () => null,
  );
}

async function deleteStaffRelatedMessagesFromConfiguredChannels(guild?, userId?, staffObj = null) {
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
    ...new Set(
      [
        IDs.channels?.pause,
        ...( (() => {
          try {
            const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
            if (!isDiscordStaffChannelPostsEnabled()) return [];
          } catch (_) {
            return [];
          }
          return [
            IDs.channels?.valutazioniStaff,
            IDs.channels?.resocontiStaff,
            IDs.channels?.warnStaff,
            IDs.channels?.puntiTolti,
          ];
        })() ),
      ]
        .map((x?) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
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
  "staff.bestStaffWeekPauseBonusWeeks": [],
  "staff.serataFilmAttendanceSaturdayKey": null,
  "staff.serataFilmWillAttend": null,
    };

function buildStaffLadderTrackResetUpdate() {
  return { $set: { ...STAFF_LADDER_TRACK_RESET_SET } };
}

function applyStaffLadderTrackResetToObject(staffObj?) {
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
  staffObj.bestStaffWeekPauseBonusWeeks = [];
  staffObj.serataFilmAttendanceSaturdayKey = null;
  staffObj.serataFilmWillAttend = null;
  }

async function resetStaffLadderTrackInDb(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !isValidGuildUserId(gid, uid)) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid, staff: { $exists: true } },
    buildStaffLadderTrackResetUpdate(),
  ).catch(() => null);
}

async function appendStaffRolesHistoryEntry(
  guildId,
  userId,
  { oldRole, newRole, reason, date, kind, displayName, username, avatarUrl, actorId, actorName }: any,
) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !/^\d{16,22}$/.test(uid)) return false;
  const profileDoc = await getOrCreateStaffDoc(gid, uid);
  const s = ensureStaff(profileDoc);
  if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
  const entry: Record<string, any> = {
    oldRole: String(oldRole || "").trim(),
    newRole: String(newRole ?? "").trim(),
    reason: String(reason || "").trim() || null,
    date: date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(),
  };
  if (kind === "pex" || kind === "depex") entry.kind = kind;
  const snapName = String(displayName || "").trim();
  const snapUser = String(username || "").trim();
  const snapAvatar = String(avatarUrl || "").trim();
  if (snapName && !/^\d{16,22}$/.test(snapName)) entry.displayName = snapName.slice(0, 128);
  if (snapUser && !/^\d{16,22}$/.test(snapUser)) entry.username = snapUser.slice(0, 64);
  if (snapAvatar && /^https:\/\//i.test(snapAvatar)) entry.avatarUrl = snapAvatar.slice(0, 512);
  const actor = String(actorId || "").trim();
  if (actor && /^\d{16,22}$/.test(actor)) entry.actorId = actor;
  const actorLabel = String(actorName || "").trim();
  if (actorLabel) entry.actorName = actorLabel.slice(0, 128);
  s.rolesHistory.push(entry);
  profileDoc.markModified("staff");
  await profileDoc.save().catch((err?) => {
    global.logger?.warn?.("[staffDocUtils] appendStaffRolesHistoryEntry save:", uid, err?.message || err);
    return null;
  });
  try {
    const { appendStaffTrackHistory, actorLabelFromUser } = require("./staffTrackHistory") as typeof import("./staffTrackHistory");
    await appendStaffTrackHistory(gid, uid, {
      kind: entry.kind || (entry.newRole ? "pex" : "depex"),
      reason: entry.reason,
      date: entry.date,
      actorId: entry.actorId || null,
      actorName: entry.actorName || actorLabelFromUser(null, entry.actorId),
      oldRole: entry.oldRole,
      newRole: entry.newRole,
    });
  } catch (_) {}
  return true;
}

export = {
  getOrCreateStaffDoc,
  appendStaffRolesHistoryEntry,
  incrementStaffValutazioneCounters,
  deleteThreadForMessage,
  deleteStaffPauseRequestChannelMessages,
  deleteStaffRelatedMessagesFromConfiguredChannels,
  ensureStaff,
  archiveStaffRolesHistoryThenUnsetStaff,
  applyStaffLadderTrackResetToObject,
  resetStaffLadderTrackInDb,
};