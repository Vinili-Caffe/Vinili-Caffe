const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const {
  ensureStaffProfileDoc,
  getStaffDoc,
  valutazionePositiveRemoveCore,
  makeRemovalEmbed,
  makeLogEmbed,
} = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");

const { getResocontoReviewerUserIdsForSegment } = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");

const COMPITO_SETTIMANALE_REASON = "Compito settimanale completato.";
const PURGE_REASON = "Ripulizia duplicato automatico (compito settimanale resoconti).";
const ORPHAN_PURGE_FOOTER = "Messaggio duplicato rimosso dal log (orphan).";
const RESOCONTO_SEGMENTS = ["pm", "helper", "mod", "senior_moderator", "director"];
const CHANNEL_SCAN_PAGE = 100;
const CHANNEL_SCAN_MAX = 1500;

function parseResocontoReviewerTaskKey(keyStr?) {
  const m = /^resoconto_reviewer_task:([^:]+):([^:]+):(\d{17,20})$/.exec(String(keyStr || ""));
  if (!m) return null;
  return { weekKey: m[1], segment: m[2], userId: m[3] };
}

function assignCompitoSegments(staff?, userId?) {
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const compitoIndices = [];
  for (let index = 0; index < reasons.length; index += 1) {
    if (String(reasons[index] || "") === COMPITO_SETTIMANALE_REASON) compitoIndices.push(index);
  }

  const resocontoAutos = auto
    .map((entry?) => {
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
    const linked = resocontoAutos.find((row?) => String(row.entry.messageId || "") === messageId);
    if (!linked) continue;
    assignments.set(index, linked.parsed.segment);
    usedAutoKeys.add(String(linked.entry.key || ""));
  }

  const unassignedIndices = compitoIndices
    .filter((index?) => !assignments.has(index))
    .map((index?) => ({
      index,
      createdAt: logs[index]?.createdAt ? new Date(logs[index].createdAt).getTime() : index,
    }))
    .sort((a?, b?) => a.createdAt - b.createdAt || a.index - b.index);

  const orphanAutos = resocontoAutos
    .filter((row?) => !usedAutoKeys.has(String(row.entry.key || "")))
    .sort(
      (a?, b?) =>
        new Date(a.entry.createdAt || 0).getTime() - new Date(b.entry.createdAt || 0).getTime(),
    );

  const usedOrphanKeys = new Set();
  for (const idxEntry of unassignedIndices) {
    const logWeek = weekKeyFromCreatedAtMs(idxEntry.createdAt);
    const orphan = orphanAutos.find(
      (row?) =>
        !usedOrphanKeys.has(String(row.entry.key || "")) &&
        String(row.parsed.weekKey || "") === String(logWeek || ""),
    );
    if (!orphan) continue;
    assignments.set(idxEntry.index, orphan.parsed.segment);
    usedOrphanKeys.add(String(orphan.entry.key || ""));
  }

  return assignments;
}

function getResocontoReviewerSegmentsForUser(userId?) {
  const uid = String(userId || "");
  return RESOCONTO_SEGMENTS.filter((segment?) =>
    getResocontoReviewerUserIdsForSegment(segment).includes(uid),
  );
}

function weekKeyFromCreatedAtMs(createdAtMs?) {
  const weeklyResocontoService = require("./weeklyStaffResocontoService") as typeof import("./weeklyStaffResocontoService");
  return weeklyResocontoService.getResocontoCycleWeekKey(new Date(createdAtMs || Date.now()));
}

function parseCompitoValutazioneMessage(message?) {
  if (!message) return null;
  const embed = message.embeds?.[0];
  if (!embed) return null;
  const title = String(embed.title || "");
  if (/RIMOSSA/i.test(title)) return null;
  const blob = [
    title,
    String(embed.description || ""),
    ...(Array.isArray(embed.fields)
      ? embed.fields.flatMap((field?) => [String(field?.name || ""), String(field?.value || "")])
      : []),
  ].join("\n");
  if (!blob.includes(COMPITO_SETTIMANALE_REASON)) return null;
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

async function collectActiveCompitoMessagesFromChannel(channel?, sinceMs = 0) {
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
    entries.sort((a?, b?) => a.createdAt - b.createdAt || a.messageId.localeCompare(b.messageId));
  }
  return byUser;
}

function buildProtectedCompitoRefs(staff?, userId?) {
  const protectedIndices = new Set();
  const protectedMessageIds = new Set();
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const uid = String(userId || "");
  for (const entry of auto) {
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    if (!parsed || parsed.userId !== uid) continue;
    if (String(entry?.reason || "") !== COMPITO_SETTIMANALE_REASON) continue;
    const messageId = String(entry?.messageId || "");
    if (messageId) protectedMessageIds.add(messageId);
    const index = findPositiveIndexByMessageId(staff, messageId);
    if (index >= 0) protectedIndices.add(index);
  }
  return { protectedIndices, protectedMessageIds };
}

function findChannelDuplicateCompitoMessageIds(byUser?, userId?, staff = null) {
  const entries = byUser.get(String(userId || "")) || [];
  if (entries.length <= 1) return [];

  const { protectedMessageIds } = staff ? buildProtectedCompitoRefs(staff, userId) : { protectedMessageIds: new Set() };

  const segmentAssignments = staff ? assignCompitoSegments(staff, userId) : new Map();
  const segments = getResocontoReviewerSegmentsForUser(userId);
  const defaultSegment = segments.length === 1 ? segments[0] : null;
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];

  const enriched = entries.map((row?) => {
    let segment = defaultSegment;
    const weekKey = weekKeyFromCreatedAtMs(row.createdAt);
    const dbIndex = staff ? findPositiveIndexByMessageId(staff, row.messageId) : -1;
    if (dbIndex >= 0) {
      segment = segmentAssignments.get(dbIndex) || segment;
      const messageId = String(logs[dbIndex]?.messageId || "");
      const autoEntry = auto.find((entry?) => String(entry?.messageId || "") === messageId);
      const autoParsed = autoEntry ? parseResocontoReviewerTaskKey(String(autoEntry.key || "")) : null;
      if (autoParsed?.segment) segment = autoParsed.segment;
    }
    return {
      ...row,
      weekKey,
      segment: segment || "_",
    };
  });

  const byWeekSegment = new Map();
  for (const entry of enriched) {
    const bucketKey = `${entry.weekKey}:${entry.segment}`;
    if (!byWeekSegment.has(bucketKey)) byWeekSegment.set(bucketKey, []);
    byWeekSegment.get(bucketKey).push(entry);
  }

  const duplicateMessageIds = [];
  for (const bucket of byWeekSegment.values()) {
    if (bucket.length <= 1) continue;
    bucket.sort((a?, b?) => {
      const aProtected = protectedMessageIds.has(String(a.messageId || "")) ? 0 : 1;
      const bProtected = protectedMessageIds.has(String(b.messageId || "")) ? 0 : 1;
      if (aProtected !== bProtected) return aProtected - bProtected;
      return a.createdAt - b.createdAt || a.messageId.localeCompare(b.messageId);
    });
    duplicateMessageIds.push(...bucket.slice(1).map((row?) => row.messageId).filter(Boolean));
  }
  return duplicateMessageIds.filter(Boolean);
}

async function resolveCompitoCreatedAtMs(guild?, log?, autoEntry?, index?) {
  if (log?.createdAt) {
    const parsed = new Date(log.createdAt).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (autoEntry?.createdAt) {
    const parsed = new Date(autoEntry.createdAt).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const channelId = String(log?.channelId || "");
  const messageId = String(log?.messageId || "");
  if (guild && channelId && messageId) {
    const channel =
      guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
    const message = await channel?.messages?.fetch?.(messageId).catch(() => null);
    const created = Number(message?.createdTimestamp || 0);
    if (Number.isFinite(created) && created > 0) return created;
  }
  return Number(index) || 0;
}

async function findDuplicateCompitoRemovals(guild?, staff?, userId?) {
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const segmentAssignments = assignCompitoSegments(staff, userId);
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const compitoEntries = [];

  for (let index = 0; index < reasons.length; index += 1) {
    if (String(reasons[index] || "") !== COMPITO_SETTIMANALE_REASON) continue;
    const log = logs[index] || {};
    const messageId = String(log.messageId || "");
    const autoEntry = auto.find((row?) => String(row?.messageId || "") === messageId);
    const autoParsed = autoEntry ? parseResocontoReviewerTaskKey(String(autoEntry.key || "")) : null;
    const createdAt = await resolveCompitoCreatedAtMs(guild, log, autoEntry, index);
    const weekKey = autoParsed?.weekKey || weekKeyFromCreatedAtMs(createdAt);
    const segment = segmentAssignments.get(index) || autoParsed?.segment || "_";
    compitoEntries.push({
      index,
      segment,
      messageId,
      createdAt,
      weekKey,
    });
  }
  if (!compitoEntries.length) return [];

  const { protectedIndices } = buildProtectedCompitoRefs(staff, userId);
  const byWeekSegment = new Map();
  for (const entry of compitoEntries) {
    const bucketKey = `${entry.weekKey}:${entry.segment}`;
    if (!byWeekSegment.has(bucketKey)) byWeekSegment.set(bucketKey, []);
    byWeekSegment.get(bucketKey).push(entry);
  }

  const duplicateRemovals = [];
  for (const bucket of byWeekSegment.values()) {
    if (bucket.length <= 1) continue;
    bucket.sort((a?, b?) => {
      const aProtected = protectedIndices.has(a.index) ? 0 : 1;
      const bProtected = protectedIndices.has(b.index) ? 0 : 1;
      if (aProtected !== bProtected) return aProtected - bProtected;
      return a.createdAt - b.createdAt || a.index - b.index;
    });
    for (const row of bucket.slice(1)) {
      if (protectedIndices.has(row.index)) continue;
      if (row.segment === "_" && protectedIndices.has(bucket[0]?.index)) continue;
      duplicateRemovals.push({
        index: row.index,
        messageId: row.messageId,
        sectionId: resolveCompitoRemoveId(staff, row.index),
      });
    }
  }

  const seen = new Set();
  return duplicateRemovals.filter((row?) => {
    if (seen.has(row.index)) return false;
    seen.add(row.index);
    return true;
  });
}

function findDuplicateCompitoMessageIds(guild?, staff?, userId?) {
  return findDuplicateCompitoRemovals(guild, staff, userId)
    .then((rows?) => rows.map((row?) => row.messageId).filter(Boolean));
}

function findDuplicateResocontoAutoKeys(staff?, userId?, weekKey = null) {
  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const byWeekSegment = new Map();
  for (const entry of auto) {
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    if (!parsed || parsed.userId !== String(userId)) continue;
    if (String(entry?.reason || "") !== COMPITO_SETTIMANALE_REASON) continue;
    if (weekKey && parsed.weekKey !== weekKey) continue;
    const bucketKey = `${parsed.weekKey}:${parsed.segment}`;
    if (!byWeekSegment.has(bucketKey)) byWeekSegment.set(bucketKey, []);
    byWeekSegment.get(bucketKey).push(entry);
  }
  const duplicateKeys = [];
  for (const entries of byWeekSegment.values()) {
    if (entries.length <= 1) continue;
    entries.sort(
      (a?, b?) =>
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    );
    duplicateKeys.push(...entries.slice(1).map((row?) => String(row.key || "")).filter(Boolean));
  }
  return duplicateKeys;
}

function findPositiveIndexByMessageId(staff?, messageId?) {
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const target = String(messageId || "");
  if (!target) return -1;
  for (let index = 0; index < logs.length; index += 1) {
    if (String(logs[index]?.messageId || "") === target) return index;
  }
  return -1;
}

function resolveCompitoRemoveId(staff?, removeIndex?) {
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const sectionId = Number(logs[removeIndex]?.sectionId);
  if (Number.isInteger(sectionId) && sectionId > 0) return sectionId;
  return removeIndex + 1;
}

async function removeDuplicateResocontoAutoKeys(profileDoc?, duplicateKeys?) {
  if (!duplicateKeys.length) return 0;
  const staff = ensureStaff(profileDoc);
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  const before = staff.autoValutazioni.length;
  staff.autoValutazioni = staff.autoValutazioni.filter(
    (entry?) => !duplicateKeys.includes(String(entry?.key || "")),
  );
  if (staff.autoValutazioni.length === before) return 0;
  profileDoc.markModified("staff");
  await profileDoc.save();
  return before - staff.autoValutazioni.length;
}

async function repairWronglyOrphanedCompitoLogs(guild?, member?, channel?, actor?, duplicateMessageIds = []) {
  const skipIds = new Set(duplicateMessageIds.map(String));
  const profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, member.id),
    guild.id,
    member.id,
  );
  const staff = ensureStaff(profileDoc);
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  let repaired = 0;

  for (let index = 0; index < reasons.length; index += 1) {
    if (String(reasons[index] || "") !== COMPITO_SETTIMANALE_REASON) continue;
    const entry = logs[index] || {};
    const messageId = String(entry?.messageId || "");
    if (skipIds.has(messageId)) continue;

    const sectionId = Number(entry?.sectionId) || index + 1;
    const channelId = String(entry?.channelId || channel?.id || "");
    const logChannel =
      guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
    if (!logChannel?.messages?.fetch) continue;

    let message = messageId ? await logChannel.messages.fetch(messageId).catch(() => null) : null;
    if (!message) {
      let before = null;
      const mention = `<@${member.id}>`;
      for (let scanned = 0; scanned < 800; scanned += 100) {
        const batch = await logChannel.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch?.size) break;
        for (const candidate of batch.values()) {
          const content = String(candidate.content || "");
          if (!content.includes(mention) && !content.includes(member.id)) continue;
          const candidateEmbed = candidate.embeds?.[0];
          if (!candidateEmbed) continue;
          const title = String(candidateEmbed.title || "");
          const titleMatch = title.match(/#(\d+)/);
          if (!titleMatch || Number(titleMatch[1]) !== sectionId) continue;
          message = candidate;
          break;
        }
        if (message) break;
        before = batch.last()?.id;
        if (!before) break;
      }
    }
    const embed = message?.embeds?.[0];
    if (!embed) continue;
    if (!/RIMOSSA/i.test(String(embed.title || ""))) continue;
    const embedBlob = JSON.stringify(embed.toJSON?.() || embed.data || embed);
    if (!embedBlob.includes(PURGE_REASON) && !embedBlob.includes(ORPHAN_PURGE_FOOTER)) continue;

    const restored = await makeLogEmbed(
      actor,
      member.user,
      `<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__** #${sectionId}`,
      COMPITO_SETTIMANALE_REASON,
      sectionId,
      "#6f4e37",
      guild,
    );
    const edited = await message
      .edit({ content: `<@${member.id}>`, embeds: [restored], components: [] })
      .catch(() => null);
    if (edited) repaired += 1;
  }

  return repaired;
}

async function removeDuplicateCompitoRemoval(guild?, member?, channel?, actor?, removal?) {
  const profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, member.id),
    guild.id,
    member.id,
  );
  const staff = ensureStaff(profileDoc);
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  let index = Number(removal?.index);
  if (!Number.isInteger(index) || index < 0 || String(reasons[index] || "") !== COMPITO_SETTIMANALE_REASON) {
    const messageId = String(removal?.messageId || "");
    index = messageId ? findPositiveIndexByMessageId(staff, messageId) : -1;
  }
  if (index < 0 || String(reasons[index] || "") !== COMPITO_SETTIMANALE_REASON) {
    return { ok: false, skipped: "not_found" };
  }

  const removeId = Number(removal?.sectionId) || resolveCompitoRemoveId(staff, index);
  const result = await valutazionePositiveRemoveCore(
    profileDoc,
    member.user,
    removeId,
    PURGE_REASON,
    actor,
    channel,
  );
  return { ok: Boolean(result?.ok), via: "db" };
}

async function removeChannelOnlyOrphanCompito(guild?, member?, messageId?, channel?, actor?) {
  const id = String(messageId || "");
  if (!guild || !member?.user || !id || !channel?.messages?.fetch) {
    return { ok: false, skipped: "invalid_args" };
  }
  const message = await channel.messages.fetch(id).catch(() => null);
  if (!message) return { ok: false, skipped: "message_missing" };
  if (!parseCompitoValutazioneMessage(message)) return { ok: false, skipped: "not_active_compito" };

  const profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, member.id), guild.id, member.id);
  const staff = ensureStaff(profileDoc);
  if (findPositiveIndexByMessageId(staff, id) >= 0) {
    return { ok: false, skipped: "linked_in_db" };
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
  return { ok: true, via: "orphan" };
}

async function purgeDuplicateCompitoSettimanaleForMember(guild?, member?, channel?, actor?, opts: Record<string, any> = {}) {
  const dryRun = Boolean(opts.dryRun);
  const channelByUser = opts.channelByUser instanceof Map ? opts.channelByUser : null;
  const userId = String(member?.id || "");
  if (!guild || !userId || !channel) return { userId, removed: 0, autoRemoved: 0, planned: [] };

  let profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, userId), guild.id, userId);
  let staff = ensureStaff(profileDoc);
  const dbRemovals = await findDuplicateCompitoRemovals(guild, staff, userId);
  const channelMessageIds = channelByUser
    ? findChannelDuplicateCompitoMessageIds(channelByUser, userId, staff)
    : [];
  const dbMessageIds = new Set(dbRemovals.map((row?) => String(row.messageId || "")).filter(Boolean));
  const channelOnlyIds = channelMessageIds.filter((messageId?) => !dbMessageIds.has(String(messageId || "")));
  const autoKeys = findDuplicateResocontoAutoKeys(staff, userId, null);
  const planned = [
    ...dbRemovals.map((row?) => `db:${row.sectionId || row.index}`),
    ...channelOnlyIds.map((messageId?) => `channel:${messageId}`),
  ];

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
      dbRemovals,
      channelOnlyIds,
    };
  }

  let removed = 0;
  const repaired = await repairWronglyOrphanedCompitoLogs(
    guild,
    member,
    channel,
    actor,
    dbRemovals.map((row?) => row.messageId).filter(Boolean),
  );

  const sortedDbRemovals = [...dbRemovals].sort((a?, b?) => Number(b.index) - Number(a.index));
  for (const removal of sortedDbRemovals) {
    const result = await removeDuplicateCompitoRemoval(guild, member, channel, actor, removal);
    if (result?.ok) removed += 1;
  }

  for (const messageId of channelOnlyIds) {
    const result = await removeChannelOnlyOrphanCompito(guild, member, messageId, channel, actor);
    if (result?.ok) removed += 1;
  }

  profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, userId), guild.id, userId);
  const autoRemoved = await removeDuplicateResocontoAutoKeys(profileDoc, autoKeys);

  return { userId, removed, autoRemoved, repaired, planned, autoKeys };
}

function resolveCompitoPurgeSinceMs(referenceNow = new Date()) {
  const weeklyResocontoService = require("./weeklyStaffResocontoService") as typeof import("./weeklyStaffResocontoService");
  const window = weeklyResocontoService.getCurrentResocontoPexWeekWindowUtc(referenceNow);
  const fromWindow = window?.windowStart?.getTime?.();
  if (Number.isFinite(fromWindow) && fromWindow > 0) return fromWindow;
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

async function purgeDuplicateCompitoSettimanaleValutazioni(client?, opts: Record<string, any> = {}) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Utils/Web/discordWorkflowUiGate") as typeof import("../../Utils/Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return { ok: false, skipped: "staff_discord_posts_disabled" };
  const dryRun = Boolean(opts.dryRun);
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { ok: false, skipped: "no_guild" };

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, skipped: "guild_unavailable" };

  const channel =
    guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
    (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff));
  if (!channel?.isTextBased?.()) return { ok: false, skipped: "no_channel" };

  const channelByUser = await collectActiveCompitoMessagesFromChannel(channel, 0);

  const reviewerIds = new Set(
    RESOCONTO_SEGMENTS.flatMap((segment?) => getResocontoReviewerUserIdsForSegment(segment).map(String)),
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
    const hasDbDoc = dbUserIds.has(String(userId));
    let staffForChannel = null;
    if (hasDbDoc) {
      const profileDoc = await ensureStaffProfileDoc(
        await getStaffDoc(guild.id, userId),
        guild.id,
        userId,
      );
      staffForChannel = ensureStaff(profileDoc);
    }
    const hasChannelDupes =
      findChannelDuplicateCompitoMessageIds(channelByUser, userId, staffForChannel).length > 0;
    const hasDbDupes = staffForChannel
      ? (await findDuplicateCompitoRemovals(guild, staffForChannel, userId)).length > 0
      : false;
    if (!hasDbDoc && !hasChannelDupes && !hasDbDupes) continue;

    const result = await purgeDuplicateCompitoSettimanaleForMember(guild, member, channel, actor, {
      dryRun,
      channelByUser,
    });
    const hadWork =
      (result.planned?.length || 0) > 0 ||
      (result.autoKeys?.length || 0) > 0 ||
      result.removed > 0 ||
      result.repaired > 0;
    if (!hadWork) continue;
    summary.affectedUsers += 1;
    summary.removedValutazioni += Number(result.removed || 0);
    summary.removedAutoEntries += Number(result.autoRemoved || 0);
    summary.repairedOrphanLogs = (summary.repairedOrphanLogs || 0) + Number(result.repaired || 0);
    summary.details.push(result);
  }

  if (summary.removedValutazioni > 0 || summary.removedAutoEntries > 0 || summary.details.length > 0) {
    global.logger?.info?.(
      `[COMPITO PURGE] dryRun=${dryRun} users=${summary.affectedUsers} removed=${summary.removedValutazioni} auto=${summary.removedAutoEntries} repaired=${summary.repairedOrphanLogs || 0} planned=${summary.details.reduce((n?, row?) => n + (row.planned?.length || 0), 0)}`,
    );
  }

  return summary;
}

export = {
  COMPITO_SETTIMANALE_REASON,
  purgeDuplicateCompitoSettimanaleValutazioni,
  purgeDuplicateCompitoSettimanaleForMember,
  findDuplicateCompitoMessageIds,
  resolveCompitoPurgeSinceMs,
  collectActiveCompitoMessagesFromChannel,
  weekKeyFromCreatedAtMs,
};
