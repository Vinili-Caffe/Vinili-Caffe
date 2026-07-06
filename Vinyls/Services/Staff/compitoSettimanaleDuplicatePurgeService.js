const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const {
  ensureStaffProfileDoc,
  getStaffDoc,
  valutazionePositiveRemoveCore,
  makeRemovalEmbed,
} = require("../../Utils/Staff/valutazionePanelActions");

const { getResocontoReviewerUserIdsForSegment } = require("../../Utils/Staff/resocontoAccess");

const COMPITO_SETTIMANALE_REASON = "Compito settimanale completato.";
const PURGE_REASON = "Ripulizia duplicato automatico (compito settimanale resoconti).";
const RESOCONTO_SEGMENTS = ["pm", "helper", "mod", "senior_moderator", "director", "admin"];
const CHANNEL_SCAN_PAGE = 100;
const CHANNEL_SCAN_MAX = 1500;

function parseResocontoReviewerTaskKey(keyStr) {
  const m = /^resoconto_reviewer_task:([^:]+):([^:]+):(\d{17,20})$/.exec(String(keyStr || ""));
  if (!m) return null;
  return { weekKey: m[1], segment: m[2], userId: m[3] };
}

function assignCompitoSegments(staff, userId) {
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const compitoIndices = [];
  for (let index = 0; index < reasons.length; index += 1) {
    if (String(reasons[index] || "") === COMPITO_SETTIMANALE_REASON) compitoIndices.push(index);
  }

  const resocontoAutos = auto
    .map((entry) => {
      const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
      if (!parsed || parsed.userId !== String(userId)) return null;
      if (String(entry?.reason || "") !== COMPITO_SETTIMANALE_REASON) return null;
      return { entry, parsed };
    })
    .filter(Boolean);

  const assignments = new Map();
  const usedAutoKeys = new Set();

  for (const index of compitoIndices) {
    const messageId = String(logs[index]?.messageId || "");
    if (!messageId) continue;
    const linked = resocontoAutos.find((row) => String(row.entry.messageId || "") === messageId);
    if (!linked) continue;
    assignments.set(index, linked.parsed.segment);
    usedAutoKeys.add(String(linked.entry.key || ""));
  }

  const unassignedIndices = compitoIndices
    .filter((index) => !assignments.has(index))
    .map((index) => ({
      index,
      createdAt: logs[index]?.createdAt ? new Date(logs[index].createdAt).getTime() : index,
    }))
    .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);

  const orphanAutos = resocontoAutos
    .filter((row) => !usedAutoKeys.has(String(row.entry.key || "")))
    .sort(
      (a, b) =>
        new Date(a.entry.createdAt || 0).getTime() - new Date(b.entry.createdAt || 0).getTime(),
    );

  for (let i = 0; i < Math.min(unassignedIndices.length, orphanAutos.length); i += 1) {
    assignments.set(unassignedIndices[i].index, orphanAutos[i].parsed.segment);
  }

  return assignments;
}

function getResocontoReviewerSegmentsForUser(userId) {
  const uid = String(userId || "");
  return RESOCONTO_SEGMENTS.filter((segment) =>
    getResocontoReviewerUserIdsForSegment(segment).includes(uid),
  );
}

function maxCompitoAllowedForUser(userId) {
  const segments = getResocontoReviewerSegmentsForUser(userId);
  return Math.max(1, segments.length);
}

function parseCompitoValutazioneMessage(message) {
  if (!message) return null;
  const embed = message.embeds?.[0];
  if (!embed) return null;
  const title = String(embed.title || "");
  if (/RIMOSSA/i.test(title)) return null;
  const description = String(embed.description || "");
  if (!description.includes(COMPITO_SETTIMANALE_REASON)) return null;
  const content = String(message.content || "");
  const mention = content.match(/<@!?(\d{17,20})>/);
  const userId = mention ? String(mention[1]) : null;
  if (!userId) return null;
  return {
    userId,
    messageId: String(message.id || ""),
    createdAt: Number(message.createdTimestamp || 0),
  };
}

async function collectActiveCompitoMessagesFromChannel(channel, sinceMs = 0) {
  const byUser = new Map();
  if (!channel?.messages?.fetch) return byUser;

  let before = null;
  let scanned = 0;
  while (scanned < CHANNEL_SCAN_MAX) {
    const batch = await channel.messages
      .fetch({
        limit: CHANNEL_SCAN_PAGE,
        ...(before ? { before } : {}),
      })
      .catch(() => null);
    if (!batch?.size) break;

    for (const message of batch.values()) {
      scanned += 1;
      const created = Number(message.createdTimestamp || 0);
      if (sinceMs && created && created < sinceMs) continue;
      const parsed = parseCompitoValutazioneMessage(message);
      if (!parsed?.messageId) continue;
      if (!byUser.has(parsed.userId)) byUser.set(parsed.userId, []);
      byUser.get(parsed.userId).push(parsed);
    }

    const oldest = batch.last();
    if (sinceMs && oldest && Number(oldest.createdTimestamp || 0) < sinceMs) break;
    before = oldest?.id || null;
    if (!before || batch.size < CHANNEL_SCAN_PAGE) break;
  }

  for (const entries of byUser.values()) {
    entries.sort((a, b) => a.createdAt - b.createdAt || a.messageId.localeCompare(b.messageId));
  }
  return byUser;
}

function findChannelDuplicateCompitoMessageIds(byUser, userId) {
  const entries = byUser.get(String(userId || "")) || [];
  const maxAllowed = maxCompitoAllowedForUser(userId);
  if (entries.length <= maxAllowed) return [];
  return entries.slice(maxAllowed).map((row) => row.messageId).filter(Boolean);
}

function findDuplicateCompitoMessageIds(staff, userId) {
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const segmentAssignments = assignCompitoSegments(staff, userId);
  const compitoEntries = [];

  for (let index = 0; index < reasons.length; index += 1) {
    if (String(reasons[index] || "") !== COMPITO_SETTIMANALE_REASON) continue;
    const log = logs[index] || {};
    compitoEntries.push({
      index,
      segment: segmentAssignments.get(index) || null,
      messageId: String(log.messageId || ""),
      createdAt: log.createdAt ? new Date(log.createdAt).getTime() : index,
    });
  }
  if (!compitoEntries.length) return [];

  const duplicateMessageIds = [];
  const bySegment = new Map();
  const unassigned = [];
  for (const entry of compitoEntries) {
    if (entry.segment) {
      if (!bySegment.has(entry.segment)) bySegment.set(entry.segment, []);
      bySegment.get(entry.segment).push(entry);
    } else {
      unassigned.push(entry);
    }
  }

  for (const entries of bySegment.values()) {
    if (entries.length <= 1) continue;
    entries.sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
    duplicateMessageIds.push(...entries.slice(1).map((row) => row.messageId).filter(Boolean));
  }

  if (unassigned.length > 1) {
    unassigned.sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
    duplicateMessageIds.push(...unassigned.slice(1).map((row) => row.messageId).filter(Boolean));
  }

  const maxAllowed = maxCompitoAllowedForUser(userId);
  if (compitoEntries.length > maxAllowed) {
    compitoEntries.sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
    duplicateMessageIds.push(...compitoEntries.slice(maxAllowed).map((row) => row.messageId).filter(Boolean));
  }

  return [...new Set(duplicateMessageIds.filter(Boolean))];
}

function findDuplicateResocontoAutoKeys(staff, userId) {
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const bySegment = new Map();
  for (const entry of auto) {
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    if (!parsed || parsed.userId !== String(userId)) continue;
    if (!bySegment.has(parsed.segment)) bySegment.set(parsed.segment, []);
    bySegment.get(parsed.segment).push(entry);
  }
  const duplicateKeys = [];
  for (const entries of bySegment.values()) {
    if (entries.length <= 1) continue;
    entries.sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    );
    duplicateKeys.push(...entries.slice(1).map((row) => String(row.key || "")).filter(Boolean));
  }
  return duplicateKeys;
}

function findPositiveIndexByMessageId(staff, messageId) {
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const target = String(messageId || "");
  if (!target) return -1;
  for (let index = 0; index < reasons.length; index += 1) {
    if (String(reasons[index] || "") !== COMPITO_SETTIMANALE_REASON) continue;
    if (String(logs[index]?.messageId || "") === target) return index;
  }
  return -1;
}

async function removeDuplicateResocontoAutoKeys(profileDoc, duplicateKeys) {
  if (!duplicateKeys.length) return 0;
  const staff = ensureStaff(profileDoc);
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  const before = staff.autoValutazioni.length;
  staff.autoValutazioni = staff.autoValutazioni.filter(
    (entry) => !duplicateKeys.includes(String(entry?.key || "")),
  );
  if (staff.autoValutazioni.length === before) return 0;
  profileDoc.markModified("staff");
  await profileDoc.save();
  return before - staff.autoValutazioni.length;
}

async function removeOrphanCompitoDiscordMessage(guild, member, messageId, channel, actor) {
  const id = String(messageId || "");
  if (!guild || !member?.user || !id || !channel?.messages?.fetch) {
    return { ok: false, skipped: "invalid_args" };
  }
  const message = await channel.messages.fetch(id).catch(() => null);
  if (!message) return { ok: false, skipped: "message_missing" };

  const profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, member.id), guild.id, member.id);
  const staff = ensureStaff(profileDoc);
  const removeIndex = findPositiveIndexByMessageId(staff, id);
  if (removeIndex >= 0) {
    const result = await valutazionePositiveRemoveCore(
      profileDoc,
      member.user,
      removeIndex + 1,
      PURGE_REASON,
      actor,
      channel,
    );
    return { ok: Boolean(result?.ok), via: "db" };
  }

  const embed = makeRemovalEmbed(
    actor,
    member.user,
    "<:cancel:1461730653677551691> **__VALUTAZIONE POSITIVA RIMOSSA__**",
    `<:VC_reason:1478517122929004544> A __${member.user.username || member.displayName || "staffer"}__ è stata **rimossa** una _Valutazione Positiva!_`,
    PURGE_REASON,
    "<:VC_update:1478721333096349817> __Valutazioni Positive Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Messaggio duplicato rimosso dal log (orphan).`,
  );
  const edited = await message.edit({ content: "", embeds: [embed], components: [] }).catch(() => null);
  if (!edited) return { ok: false, skipped: "edit_failed" };

  const reasons = Array.isArray(staff.positiveReasons) ? staff.positiveReasons : [];
  const compitoCount = reasons.filter((row) => row === COMPITO_SETTIMANALE_REASON).length;
  const positiveCount = Math.max(0, Number(staff.positiveCount || 0));
  if (compitoCount < positiveCount && positiveCount > 0) {
    staff.positiveCount = Math.max(0, positiveCount - 1);
    staff.valutazioniCount = Math.max(0, Number(staff.valutazioniCount || 0) - 1);
    profileDoc.markModified("staff");
    await profileDoc.save();
  }
  return { ok: true, via: "orphan" };
}

async function purgeDuplicateCompitoSettimanaleForMember(guild, member, channel, actor, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const channelByUser = opts.channelByUser instanceof Map ? opts.channelByUser : null;
  const userId = String(member?.id || "");
  if (!guild || !userId || !channel) return { userId, removed: 0, autoRemoved: 0, planned: [] };

  let profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, userId), guild.id, userId);
  let staff = ensureStaff(profileDoc);
  const messageIds = new Set(findDuplicateCompitoMessageIds(staff, userId));
  if (channelByUser) {
    for (const messageId of findChannelDuplicateCompitoMessageIds(channelByUser, userId)) {
      messageIds.add(String(messageId || ""));
    }
  }
  const autoKeys = findDuplicateResocontoAutoKeys(staff, userId);
  const planned = [...messageIds].filter(Boolean);

  if (!planned.length && !autoKeys.length) {
    return { userId, removed: 0, autoRemoved: 0, planned: [] };
  }

  if (dryRun) {
    return {
      userId,
      removed: 0,
      autoRemoved: 0,
      planned,
      autoKeys,
    };
  }

  let removed = 0;
  for (const messageId of planned) {
    const result = await removeOrphanCompitoDiscordMessage(guild, member, messageId, channel, actor);
    if (result?.ok) removed += 1;
  }

  profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, userId), guild.id, userId);
  const autoRemoved = await removeDuplicateResocontoAutoKeys(profileDoc, autoKeys);

  return { userId, removed, autoRemoved, planned, autoKeys };
}

async function purgeDuplicateCompitoSettimanaleValutazioni(client, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { ok: false, skipped: "no_guild" };

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, skipped: "guild_unavailable" };

  const channel =
    guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
    (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
  if (!channel?.isTextBased?.()) return { ok: false, skipped: "no_channel" };

  const weeklyResocontoService = require("./weeklyStaffResocontoService");
  const since = weeklyResocontoService.getResocontoCycleMessagesSince();
  const sinceMs = since?.getTime?.() || (Date.now() - 7 * 24 * 60 * 60 * 1000);
  const channelByUser = await collectActiveCompitoMessagesFromChannel(channel, sinceMs);

  const reviewerIds = new Set(
    RESOCONTO_SEGMENTS.flatMap((segment) => getResocontoReviewerUserIdsForSegment(segment).map(String)),
  );
  const dbUserIds = new Set();

  const docs = await ActivityUserProfile.find(
    {
      guildId,
      "staff.positiveReasons": COMPITO_SETTIMANALE_REASON,
    },
    { userId: 1 },
  )
    .lean()
    .catch(() => []);

  for (const doc of docs) dbUserIds.add(String(doc.userId || ""));

  const actor = { user: client.user || { username: "Automazione Staff" }, member: null };
  const summary = {
    ok: true,
    dryRun,
    scanned: docs.length,
    channelUsers: channelByUser.size,
    affectedUsers: 0,
    removedValutazioni: 0,
    removedAutoEntries: 0,
    details: [],
  };

  const userIds = new Set([...dbUserIds, ...channelByUser.keys(), ...reviewerIds]);
  for (const userId of userIds) {
    const member = await getGuildMemberCached(guild, userId).catch(() => null);
    if (!member?.user) continue;
    const channelEntries = channelByUser.get(String(userId)) || [];
    const hasChannelDupes = channelEntries.length > maxCompitoAllowedForUser(userId);
    const hasDbDoc = dbUserIds.has(String(userId));
    if (!hasDbDoc && !hasChannelDupes) continue;

    const result = await purgeDuplicateCompitoSettimanaleForMember(guild, member, channel, actor, {
      dryRun,
      channelByUser,
    });
    const hadWork = (result.planned?.length || 0) > 0 || (result.autoKeys?.length || 0) > 0 || result.removed > 0;
    if (!hadWork) continue;
    summary.affectedUsers += 1;
    summary.removedValutazioni += Number(result.removed || 0);
    summary.removedAutoEntries += Number(result.autoRemoved || 0);
    summary.details.push(result);
  }

  if (summary.removedValutazioni > 0 || summary.removedAutoEntries > 0 || (dryRun && summary.details.length)) {
    global.logger?.info?.(
      `[COMPITO PURGE] dryRun=${dryRun} users=${summary.affectedUsers} removed=${summary.removedValutazioni} auto=${summary.removedAutoEntries}`,
    );
  }

  return summary;
}

module.exports = {
  COMPITO_SETTIMANALE_REASON,
  purgeDuplicateCompitoSettimanaleValutazioni,
  purgeDuplicateCompitoSettimanaleForMember,
  findDuplicateCompitoMessageIds,
};
