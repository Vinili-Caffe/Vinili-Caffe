const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const {
  getOrCreateStaffDoc,
  ensureStaff,
  incrementStaffValutazioneCounters,
  appendStaffRolesHistoryEntry,
} = require("./staffDocUtils") as typeof import("./staffDocUtils");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const {
  addStaffWarnFromNegatives,
  applyFullDepex,
  getHighestStaffRoleId,
  STAFF_WARN_THREE_NEGATIVES_REASON,
  NEGATIVES_PER_STAFF_WARN,
} = require("../../Services/Staff/staffWarnService") as typeof import("../../Services/Staff/staffWarnService");
const { syncStaffDbAndPauseChannelAfterDepex } = require("./staffPmUtils") as typeof import("./staffPmUtils");
const { resolveStaffValutazioniChannel, resolveStaffPexDepexChannel } = require("./staffChannelUtils") as typeof import("./staffChannelUtils");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic, resolveEmbedUserAvatarUrl } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

const VALUTAZIONE_EMBED_COLOR = TENANT_EMBED_COLOR;

/* staffProfLiveAll1: clear → WS profilo aperto */
/* staffProfLiveAll1: clear → WS profili aperti */
function clearWebStaffProfileCache(userId?, action = "valutazione") {
  const uid = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return;
  try {
    require("../../Web/siteStaffProfileApi").clearStaffProfileCacheForUser(uid, { action });
  } catch (_) {}
}

function formatStaffMention(userLike?) {
  const id = String(userLike?.id || userLike?.user?.id || "").trim();
  if (/^\d{16,22}$/.test(id)) return `<@${id}>`;
  if (typeof userLike?.toString === "function") {
    const asText = String(userLike.toString());
    if (asText && asText !== "[object Object]") return asText;
  }
  return "Utente";
}

async function ensureStaffProfileDoc(profileDoc?, guildId?, userId?) {
  if (profileDoc) {
    ensureStaff(profileDoc);
    return profileDoc;
  }
  return getOrCreateStaffDoc(guildId, userId);
}

async function getStaffDoc(guildId?, userId?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u });
}

async function makeLogEmbed(
  actor?,
  user?,
  title?,
  reason?,
  idValue?,
  color = VALUTAZIONE_EMBED_COLOR,
  guild = null,
) {
  const actorLike = actor?.member || actor?.user || actor;
  const targetMember = guild?.members?.cache?.get(user.id) || null;
  const [actorIcon, thumb] = await Promise.all([
    resolveEmbedUserAvatarUrl(actorLike),
    resolveEmbedUserAvatarUrl(targetMember || user),
  ]);
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${accountUsername(actorLike)}`,
      iconURL: actorIcon,
    })
    .setTitle(title)
    .setThumbnail(thumb)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${formatStaffMention(user)}`,
        `<:VC_reason:1478517122929004544> __${reason}__`,
        `<:VC_id:1478517313618575419> **ID Valutazione** __\`${idValue}\`__`,
      ].join("\n"),
    )
    .setColor(color);
}

async function buildAutoStaffWarnFromNegativesEmbed(actorLike?, targetUser?, warnCount?, guild = null) {
  const actorForAuthor = actorLike?.member || actorLike?.user || actorLike;
  const username = accountUsername(actorForAuthor) || "Staff";
  const targetMention = formatStaffMention(targetUser);
  const targetMember = guild?.members?.cache?.get(targetUser.id) || null;
  const [actorIcon, thumb] = await Promise.all([
    resolveEmbedUserAvatarUrl(actorForAuthor),
    resolveEmbedUserAvatarUrl(targetMember || targetUser),
  ]);
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${username}`,
      iconURL: actorIcon,
    })
    .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF__** \`#${warnCount}\``)
    .setThumbnail(thumb)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${targetMention}`,
        `<:VC_reason:1478517122929004544> __${STAFF_WARN_THREE_NEGATIVES_REASON}__`,
        `<:VC_id:1478517313618575419> **ID Warn** __\`${warnCount}\`__`,
      ].join("\n"),
    )
    .setColor("#E74C3C");
}

function makeRemovalEmbed(actor?, user?, title?, description?, reason?, updatedLabel?, updatedValue?) {
  const actorLike = actor?.member || actor?.user || actor;
  const safeDescriptionRaw = String(description || "").trim();
  const mention = formatStaffMention(user);
  const safeDescription = safeDescriptionRaw
    ? safeDescriptionRaw.replace(/\{user\}/g, mention)
    : `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${mention}`;
  const safeReasonField = String(reason || "").trim() || "—";
  const safeUpdatedLabel = String(updatedLabel || "").trim() || "Aggiornamento";
  const safeUpdatedValue = String(updatedValue || "").trim() || "—";
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione rimossa da ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle(title)
    .setDescription(safeDescription)
    .addFields(
      { name: "<:VC_reason:1478517122929004544> Motivazione: ", value: safeReasonField, inline: false },
      { name: safeUpdatedLabel, value: safeUpdatedValue, inline: false },
    )
    .setColor(VALUTAZIONE_EMBED_COLOR);
}

async function sendChannelEmbed(channel?, payload?) {
  if (!channel) return null;
  return channel.send(payload).catch(() => null);
}

function getValutazioneEntry(staff?, kind?, index?, reason?) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  const reasonsName = kind === "negative" ? "negativeReasons" : "positiveReasons";
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const reasons = Array.isArray(staff?.[reasonsName]) ? staff[reasonsName] : [];
  const byIndex = list[index] || null;
  if (byIndex?.messageId && byIndex?.channelId) return byIndex;

  const targetReason = String(reason || "");
  let reasonOccurrenceAtIndex = 0;
  for (let i = 0; i <= index && i < reasons.length; i += 1) {
    if (String(reasons[i] || "") === targetReason) reasonOccurrenceAtIndex += 1;
  }
  if (reasonOccurrenceAtIndex <= 0) return null;

  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  let seen = 0;
  for (const entry of auto) {
    if (String(entry?.type || "") !== kind) continue;
    if (String(entry?.reason || "") !== targetReason) continue;
    if (!String(entry?.messageId || "") || !String(entry?.channelId || "")) continue;
    seen += 1;
    if (seen === reasonOccurrenceAtIndex) return entry;
  }
  return null;
}

function removeLinkedAutoValutazioneEntry(staff?, resolvedEntry?) {
  const messageId = String(resolvedEntry?.messageId || "").trim();
  if (!messageId || !Array.isArray(staff?.autoValutazioni)) return;
  staff.autoValutazioni = staff.autoValutazioni.filter(
    (entry?) => String(entry?.messageId || "") !== messageId,
  );
}

function markLinkedAutoValutazioneSpentByTrade(staff?, resolvedEntry?, tradeReason = "") {
  if (!Array.isArray(staff?.autoValutazioni)) return false;
  const messageId = String(resolvedEntry?.messageId || "").trim();
  const reason = String(resolvedEntry?.reason || "").trim();
  let marked = false;
  for (const entry of staff.autoValutazioni) {
    if (!entry || typeof entry !== "object") continue;
    const sameMessage = messageId && String(entry.messageId || "") === messageId;
    const sameReason =
      !sameMessage &&
      reason &&
      String(entry.reason || "").trim() === reason &&
      !entry.spentByTrade;
    if (!sameMessage && !sameReason) continue;
    entry.spentByTrade = true;
    entry.spentAt = new Date();
    entry.spentReason = String(tradeReason || "").slice(0, 300);
    entry.updatedAt = new Date();
    marked = true;
        const keyStr = String(entry.key || "");
    const m = /^resoconto_reviewer_task:([^:]+):([^:]+):(\d{17,20})$/.exec(keyStr);
    if (m) {
      if (!Array.isArray(staff.resocontoCompitoClaims)) staff.resocontoCompitoClaims = [];
      const id = `${m[1]}:${m[2]}:${m[3]}`;
      if (!staff.resocontoCompitoClaims.some((row?) => String(row?.id || row || "") === id)) {
        staff.resocontoCompitoClaims.push({
          id,
          weekKey: m[1],
          segment: m[2],
          userId: m[3],
          at: new Date(),
        });
      }
    }
    if (sameMessage) break;
  }
  return marked;
}

function pushValutazioneEntry(staff?, kind?, reason?, message?, meta = null) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  if (!Array.isArray(staff[listName])) staff[listName] = [];
  const row: Record<string, any> = {
    reason: String(reason || ""),
    channelId: message?.channelId ? String(message.channelId) : null,
    messageId: message?.id ? String(message.id) : null,
    createdAt: new Date(),
  };
  if (meta?.sectionId != null) row.sectionId = Number(meta.sectionId);
  if (meta?.globalId != null) row.globalId = Number(meta.globalId);
  const actorId = String(meta?.actorId || "").trim();
  if (actorId && /^\d{16,22}$/.test(actorId)) row.actorId = actorId;
  const actorName = String(meta?.actorName || "").trim();
  if (actorName) row.actorName = actorName.slice(0, 128);
  staff[listName].push(row);
}

async function mirrorValTrackHistory(guildId?, userId?, kind?, reason?, actor?, entryId?) {
  try {
    const { appendStaffTrackHistory, actorLabelFromUser } = require("./staffTrackHistory") as typeof import("./staffTrackHistory");
    const actorLike = actor?.member || actor?.user || actor;
    await appendStaffTrackHistory(guildId, userId, {
      kind,
      reason,
      date: new Date(),
      actorId: String(actorLike?.id || "").trim() || null,
      actorName: actorLabelFromUser(actorLike, actorLike?.id),
      entryId: entryId || null,
    });
  } catch (_) {}
}

function removeValutazioneEntry(staff?, kind?, index?) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  if (!Array.isArray(staff?.[listName])) return;
  if (index >= 0 && index < staff[listName].length) staff[listName].splice(index, 1);
}

const VALUTAZIONE_EMBED_ID_RE = /ID Valutazione[^`]*`(\d+)`/i;
const VALUTAZIONE_EMBED_TITLE_NUM_RE = /#(\d+)/;

function resolveValutazioneRemoveIndex(staff?, kind?, removeId?) {
  const reasonsName = kind === "negative" ? "negativeReasons" : "positiveReasons";
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  const reasons = Array.isArray(staff?.[reasonsName]) ? staff[reasonsName] : [];
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const n = Math.floor(Number(removeId));
  if (!Number.isInteger(n) || n < 1) return -1;

  if (reasons[n - 1] !== undefined) return n - 1;

  const bySection = list.findIndex((entry?) => Number(entry?.sectionId) === n);
  if (bySection >= 0 && bySection < reasons.length) return bySection;

  const byGlobal = list.findIndex((entry?) => Number(entry?.globalId) === n);
  if (byGlobal >= 0 && byGlobal < reasons.length) return byGlobal;

  return -1;
}

async function resolveValutazioneRemoveIndexFromMessages(guild?, staff?, kind?, removeId?) {
  const n = Math.floor(Number(removeId));
  if (!guild || !Number.isInteger(n) || n < 1) return -1;

  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  const reasonsName = kind === "negative" ? "negativeReasons" : "positiveReasons";
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const reasons = Array.isArray(staff?.[reasonsName]) ? staff[reasonsName] : [];
  if (!list.length) return -1;

  for (let i = 0; i < list.length; i += 1) {
    if (i >= reasons.length) break;
    const entry = list[i];
    const channelId = String(entry?.channelId || "").trim();
    const messageId = String(entry?.messageId || "").trim();
    if (!channelId || !messageId) continue;

    const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
    if (!channel?.messages?.fetch) continue;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    const embed = message?.embeds?.[0];
    if (!embed) continue;

    const idMatch = String(embed.description || "").match(VALUTAZIONE_EMBED_ID_RE);
    if (idMatch && Number(idMatch[1]) === n) return i;

    const titleMatch = String(embed.title || "").match(VALUTAZIONE_EMBED_TITLE_NUM_RE);
    if (titleMatch && Number(titleMatch[1]) === n) return i;
  }
  return -1;
}

async function resolveValutazioneRemoveIndexFromChannelScan(guild?, staff?, kind?, removeId?, targetUserId?) {
  const n = Math.floor(Number(removeId));
  const userId = String(targetUserId || "").trim();
  if (!guild || !userId || !Number.isInteger(n) || n < 1) return -1;

  const channelId = String(IDs.channels?.valutazioniStaff || "").trim();
  if (!channelId) return -1;
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return -1;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.messages?.fetch) return -1;

  const reasonsName = kind === "negative" ? "negativeReasons" : "positiveReasons";
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  const reasons = Array.isArray(staff?.[reasonsName]) ? staff[reasonsName] : [];
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const mention = `<@${userId}>`;

  let before = null;
  for (let scanned = 0; scanned < 800; scanned += 100) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    for (const msg of batch.values()) {
      const content = String(msg.content || "");
      if (!content.includes(mention) && !content.includes(userId)) continue;
      const embed = msg.embeds?.[0];
      if (!embed) continue;

      const idMatch = String(embed.description || "").match(VALUTAZIONE_EMBED_ID_RE);
      const titleMatch = String(embed.title || "").match(VALUTAZIONE_EMBED_TITLE_NUM_RE);
      const matchesId =
        (idMatch && Number(idMatch[1]) === n) ||
        (titleMatch && Number(titleMatch[1]) === n);
      if (!matchesId) continue;

      const byMsg = list.findIndex((entry?) => String(entry?.messageId || "") === String(msg.id));
      if (byMsg >= 0 && byMsg < reasons.length) return byMsg;

      const reasonChunks = String(embed.description || "").match(/__([^_\n]+)__/g) || [];
      const embedReason = String(reasonChunks[1] || "").replace(/^__|__$/g, "").trim();
      if (!embedReason) continue;
      for (let i = 0; i < reasons.length; i += 1) {
        if (String(reasons[i] || "") !== embedReason) continue;
        const linkedId = String(list[i]?.messageId || "");
        if (!linkedId || linkedId === String(msg.id)) return i;
      }
    }
    before = batch.last()?.id;
    if (!before) break;
  }
  return -1;
}

async function resolveValutazioneRemoveIndexFull(guild?, staff?, kind?, removeId?, targetUserId = null) {
  const direct = resolveValutazioneRemoveIndex(staff, kind, removeId);
  if (direct >= 0) return direct;
  const fromLogs = await resolveValutazioneRemoveIndexFromMessages(guild, staff, kind, removeId);
  if (fromLogs >= 0) return fromLogs;
  return resolveValutazioneRemoveIndexFromChannelScan(guild, staff, kind, removeId, targetUserId);
}

async function editOriginalValutazioneMessage(guild?, entry?, embed?) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return false;
  const channelId = String(entry?.channelId || "").trim();
  const messageId = String(entry?.messageId || "").trim();
  if (!guild || !channelId || !messageId) return false;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message?.edit) return false;
  return message.edit({ content: "", embeds: [embed], components: [] }).then(() => true).catch(() => false);
}

async function syncProfileStaffFromDb(profileDoc?, guildId?, userId?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!profileDoc || !g || !u) return ensureStaff(profileDoc);
  const fresh = await ActivityUserProfile.findOne({ guildId: g, userId: u }).catch(() => null);
  if (fresh?.staff) profileDoc.staff = fresh.staff;
  return ensureStaff(profileDoc);
}

async function valutazionePositiveAddCore(profileDoc?, staffUser?, reason?, actor?, channel?) {
  const guildId = String(profileDoc?.guildId || channel?.guild?.id || "");
  const userId = String(staffUser?.id || "");
  let counts = await incrementStaffValutazioneCounters(guildId, userId, "positive", reason);
  if (!counts) {
    await getOrCreateStaffDoc(guildId, userId);
    counts = await incrementStaffValutazioneCounters(guildId, userId, "positive", reason);
  }
  if (!counts) return { message: null };
  const s = await syncProfileStaffFromDb(profileDoc, guildId, userId);
  const embed = await makeLogEmbed(
    actor,
    staffUser,
    `<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__** #${counts.sectionCount}`,
    reason,
    counts.sectionCount,
    VALUTAZIONE_EMBED_COLOR,
    channel?.guild || null,
  );
  const message = channel?.isTextBased?.()
    ? await sendChannelEmbed(channel, { content: formatStaffMention(staffUser), embeds: [embed] })
    : null;
  pushValutazioneEntry(s, "positive", reason, message, {
    sectionId: counts.sectionCount,
    globalId: counts.valutazioniCount,
    actorId: String(actor?.id || actor?.user?.id || "").trim() || null,
    actorName: String(actor?.username || actor?.user?.username || actor?.displayName || "").trim() || null,
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorValTrackHistory(guildId, userId, "val_pos", reason, actor, counts.sectionCount);
  try {
    const { notifyStaffValutazione, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
    void notifyStaffValutazione({
      guild: channel?.guild || null,
      staffUserId: userId,
      kind: "positive",
      reason,
      actorName: memberDisplayName(null, actor, actor?.id),
      sectionId: counts.sectionCount,
    }).catch(() => 0);
  } catch (_) {}
  clearWebStaffProfileCache(userId);
  return { message, ok: true };
}

async function valutazionePositiveRemoveCore(profileDoc?, staffUser?, removeId?, reason?, actor?, channel?) {
  const s = ensureStaff(profileDoc);
  if (!Number.isInteger(removeId) || removeId < 1) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> ID non valido" };
  }
  const index = await resolveValutazioneRemoveIndexFull(channel?.guild || null, s, "positive", removeId, staffUser?.id);
  if (index < 0 || !s.positiveReasons?.[index]) {
    return {
      ok: false,
      message: "<:VC_Attention:1482534443632558151> ID non valido — usa il **#** nel titolo o **ID Valutazione** nel footer del messaggio",
    };
  }
  const removedReason = s.positiveReasons[index];
  const originalEntry = getValutazioneEntry(s, "positive", index, removedReason);
  s.positiveReasons.splice(index, 1);
  removeValutazioneEntry(s, "positive", index);
  removeLinkedAutoValutazioneEntry(s, originalEntry);
  s.positiveCount = Math.max(0, s.positiveCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorValTrackHistory(
    String(profileDoc?.guildId || channel?.guild?.id || ""),
    String(staffUser?.id || ""),
    "val_pos_rm",
    reason || removedReason,
    actor,
    removeId,
  );
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    "<:cancel:1461730653677551691> **__VALUTAZIONE POSITIVA RIMOSSA__**",
    `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Positiva!_`,
    reason,
    "<:VC_update:1478721333096349817> __Valutazioni Positive Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${s.positiveCount}\` valutazioni positive!`,
  );
  const edited = await editOriginalValutazioneMessage(channel?.guild || null, originalEntry, embed);
  if (!edited) await sendChannelEmbed(channel, { embeds: [embed] });
  try {
    const { notifyStaffValutazioneRemoved, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
    void notifyStaffValutazioneRemoved({
      guild: channel?.guild || null,
      staffUserId: String(staffUser?.id || ""),
      kind: "positive",
      reason: reason || removedReason,
      actorName: memberDisplayName(null, actor, actor?.id),
      sectionId: removeId,
    }).catch(() => 0);
  } catch (_) {}
  clearWebStaffProfileCache(staffUser?.id);
  return { ok: true };
}

async function valutazioneNegativeAddCore(guild?, profileDoc?, staffUser?, reason?, actor?, channel?) {
  const guildId = String(profileDoc?.guildId || guild?.id || "");
  const userId = String(staffUser?.id || "");
  let counts = await incrementStaffValutazioneCounters(guildId, userId, "negative", reason);
  if (!counts) {
    await getOrCreateStaffDoc(guildId, userId);
    counts = await incrementStaffValutazioneCounters(guildId, userId, "negative", reason);
  }
  if (!counts) return { message: null };
  const s = await syncProfileStaffFromDb(profileDoc, guildId, userId);
  const embed = await makeLogEmbed(
    actor,
    staffUser,
    `<:thumbsdown:1471292163957457013> **__VALUTAZIONE NEGATIVA__** #${counts.sectionCount}`,
    reason,
    counts.sectionCount,
    VALUTAZIONE_EMBED_COLOR,
    guild,
  );
  const message = channel?.isTextBased?.()
    ? await sendChannelEmbed(channel, { content: formatStaffMention(staffUser), embeds: [embed] })
    : null;
  pushValutazioneEntry(s, "negative", reason, message, {
    sectionId: counts.sectionCount,
    globalId: counts.valutazioniCount,
    actorId: String(actor?.id || actor?.user?.id || "").trim() || null,
    actorName: String(actor?.username || actor?.user?.username || actor?.displayName || "").trim() || null,
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorValTrackHistory(guildId, userId, "val_neg", reason, actor, counts.sectionCount);
  const warnResult = await addStaffWarnFromNegatives(
    guild.id,
    staffUser.id,
    s.negativeCount,
    STAFF_WARN_THREE_NEGATIVES_REASON,
  );
  const warnChannel = channel?.isTextBased?.() ? channel : null;
  let fullDepexRoleId = null;
  let fullDepexOk = false;
  if (warnResult.added) {
        await syncProfileStaffFromDb(profileDoc, guild.id, staffUser.id);
    await convertOldestNegativesToStaffWarn(
      ensureStaff(profileDoc),
      NEGATIVES_PER_STAFF_WARN,
      actor,
      staffUser,
      warnChannel || channel,
      guild,
    );
    profileDoc.markModified("staff");
    await profileDoc.save().catch(() => null);
  }
  if (warnResult.added && warnChannel) {
    const warnEmbed = await buildAutoStaffWarnFromNegativesEmbed(actor, staffUser, warnResult.warnCount, guild);
    await warnChannel.send({ content: formatStaffMention(staffUser), embeds: [warnEmbed] }).catch(() => null);
    /* Prompt depex Discord (staff_warn_depex) rimosso: decisione High Staff sul sito. */
  }
  if (warnResult.added && warnResult.shouldFullDepex) {
    const member = await getGuildMemberCached(guild, staffUser.id);
    if (member) {
      const currentRoleId = getHighestStaffRoleId(member);
      const fullResult = await applyFullDepex(guild, member, currentRoleId);
      if (fullResult.ok) {
        fullDepexOk = true;
        fullDepexRoleId = currentRoleId;
        const memberAfterFull = await getGuildMemberCached(guild, staffUser.id, { preferFresh: true }).catch(() => member);
        await syncStaffDbAndPauseChannelAfterDepex(guild, staffUser.id, memberAfterFull);
        await appendStaffRolesHistoryEntry(guild.id, staffUser.id, {
          oldRole: currentRoleId,
          newRole: "",
          kind: "depex",
          reason: "Depex automatico: 3 warn staff (valutazioni negative).",
          displayName: String(
            memberAfterFull?.displayName || staffUser?.globalName || staffUser?.username || "",
          ).trim() || null,
          username: String(staffUser?.username || "").trim() || null,
          avatarUrl:
            guildMemberDisplayAvatarUrlDynamic(memberAfterFull || staffUser, { size: 128 }) ||
            null,
        });
        const pexDepexChannel = await resolveStaffPexDepexChannel(guild);
        if (pexDepexChannel?.isTextBased?.()) {
          await pexDepexChannel.send({
            content: `**<:cancel:1461730653677551691> DEPEX** ${formatStaffMention(staffUser)}\n` +
              `<:VC_Staff:1494286904089247754> \`${currentRoleId}\` <a:VC_Arrow:1482706699365257397> Nessuno\n` +
              `<:VC_reason:1478517122929004544> __Depex automatico: 3 warn staff (valutazioni negative).__`,
          __skipNoticeEmbed: true,
          }).catch(() => null);
        }
      }
    }
  }
  try {
    const { notifyStaffValutazione, notifyStaffWarn, notifyStaffPexDepex, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
    void notifyStaffValutazione({
      guild,
      staffUserId: staffUser.id,
      kind: "negative",
      reason,
      actorName: memberDisplayName(null, actor, actor?.id),
      sectionId: counts.sectionCount,
    }).catch(() => 0);
    if (warnResult.added) {
      void notifyStaffWarn({
        guild,
        staffUserId: staffUser.id,
        staffName: memberDisplayName(null, staffUser, staffUser.id),
        warnCount: warnResult.warnCount,
        reason: STAFF_WARN_THREE_NEGATIVES_REASON,
        isAutoFromNegatives: true,
        needsDepexDecision: warnResult.shouldAskDepex,
      }).catch(() => 0);
    }
    if (fullDepexOk) {
      void notifyStaffPexDepex({
        guild,
        kind: "depex",
        targetUserId: staffUser.id,
        targetName: memberDisplayName(null, staffUser, staffUser.id),
        oldRoleId: fullDepexRoleId,
        newRoleId: "",
        reason: "Depex automatico: 3 warn staff (valutazioni negative).",
        sourceHint: `auto-warn-depex:${staffUser.id}`,
      }).catch(() => 0);
    }
  } catch (_) {}
  clearWebStaffProfileCache(staffUser?.id);
  return { message, warnResult, ok: true };
}

async function valutazioneNegativeRemoveCore(profileDoc?, staffUser?, removeId?, reason?, actor?, channel?) {
  const s = ensureStaff(profileDoc);
  if (!Number.isInteger(removeId) || removeId < 1) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> ID non valido" };
  }
  const index = await resolveValutazioneRemoveIndexFull(channel?.guild || null, s, "negative", removeId, staffUser?.id);
  if (index < 0 || !s.negativeReasons?.[index]) {
    return {
      ok: false,
      message: "<:VC_Attention:1482534443632558151> ID non valido — usa il **#** nel titolo o **ID Valutazione** nel footer del messaggio",
    };
  }
  const removedReason = s.negativeReasons[index];
  const originalEntry = getValutazioneEntry(s, "negative", index, removedReason);
  s.negativeReasons.splice(index, 1);
  removeValutazioneEntry(s, "negative", index);
  removeLinkedAutoValutazioneEntry(s, originalEntry);
  s.negativeCount = Math.max(0, s.negativeCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorValTrackHistory(
    String(profileDoc?.guildId || channel?.guild?.id || ""),
    String(staffUser?.id || ""),
    "val_neg_rm",
    reason || removedReason,
    actor,
    removeId,
  );
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    "<:cancel:1461730653677551691> **__VALUTAZIONE NEGATIVA RIMOSSA__**",
    `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Negativa!_`,
    reason,
    "<:VC_update:1478721333096349817> __Valutazioni Negative Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${s.negativeCount}\` valutazioni negative!`,
  );
  const edited = await editOriginalValutazioneMessage(channel?.guild || null, originalEntry, embed);
  if (!edited) await sendChannelEmbed(channel, { embeds: [embed] });
  try {
    const { notifyStaffValutazioneRemoved, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
    void notifyStaffValutazioneRemoved({
      guild: channel?.guild || null,
      staffUserId: String(staffUser?.id || ""),
      kind: "negative",
      reason: reason || removedReason,
      actorName: memberDisplayName(null, actor, actor?.id),
      sectionId: removeId,
    }).catch(() => 0);
  } catch (_) {}
  clearWebStaffProfileCache(staffUser?.id);
  return { ok: true };
}

function actorFromMember(member?) {
  if (!member?.user) return { user: member, member: null };
  return { user: member.user, member };
}

function memberIsHighStaffOrAbove(member?) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  return Boolean(IDs.roles?.HighStaff && cache.has(IDs.roles.HighStaff));
}

async function removeOldestPositiveValutazioni(s?, count?, actor?, staffUser?, channel?, guild?, removalReason?, finalPosLabel?) {
  const posEdits = [];
  const n = Math.floor(Number(count || 0));
  for (let i = 0; i < n; i += 1) {
    const removedReason = s.positiveReasons[0];
    const originalEntry = getValutazioneEntry(s, "positive", 0, removedReason);
    s.positiveReasons.splice(0, 1);
    removeValutazioneEntry(s, "positive", 0);
    markLinkedAutoValutazioneSpentByTrade(s, originalEntry || { reason: removedReason }, removalReason);
    s.positiveCount = Math.max(0, s.positiveCount - 1);
    s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
    posEdits.push({ entry: originalEntry });
  }
  const finalPos = s.positiveCount;
  const title =
    n > 1
      ? `<:cancel:1461730653677551691> **__${n} VALUTAZIONI POSITIVE RIMOSSE__** (scambio)`
      : "<:cancel:1461730653677551691> **__VALUTAZIONE POSITIVA RIMOSSA__** (scambio)";
  const body =
    n > 1
      ? `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ sono state **rimosse** **${n}** _Valutazioni Positive_ (scambio).`
      : `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Positiva_ (scambio).`;
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    title,
    body,
    removalReason,
    "<:VC_update:1478721333096349817> __Valutazioni Positive Totali__",
    finalPosLabel(finalPos),
  );
  let anyEdited = false;
  let needChannelPost = false;
  for (const row of posEdits) {
    const edited = await editOriginalValutazioneMessage(guild, row.entry, embed);
    if (edited) anyEdited = true;
    else needChannelPost = true;
  }
    if (needChannelPost || !anyEdited) {
    await sendChannelEmbed(channel, { embeds: [embed] });
  }
  return { removed: n, finalPos };
}

function consumeOldestNegativesFromStaff(s?, count?) {
  if (!s || !Array.isArray(s.negativeReasons)) {
    return { removed: 0, finalNeg: 0, entries: [], reasons: [] };
  }
  const n = Math.min(
    Math.max(0, Math.floor(Number(count || 0))),
    s.negativeReasons.length,
  );
  if (n <= 0) {
    return {
      removed: 0,
      finalNeg: Math.max(0, Math.floor(Number(s.negativeCount) || 0)),
      entries: [],
      reasons: [],
    };
  }

  const entries = [];
  const reasons = [];
  for (let i = 0; i < n; i += 1) {
    const removedReason = s.negativeReasons[0];
    const originalEntry = getValutazioneEntry(s, "negative", 0, removedReason);
    reasons.push(String(removedReason || ""));
    entries.push(originalEntry || null);
    s.negativeReasons.splice(0, 1);
    removeValutazioneEntry(s, "negative", 0);
    removeLinkedAutoValutazioneEntry(s, originalEntry);
    s.negativeCount = Math.max(0, Math.floor(Number(s.negativeCount) || 0) - 1);
    s.valutazioniCount = Math.max(0, Math.floor(Number(s.valutazioniCount) || 0) - 1);
  }

  return {
    removed: n,
    finalNeg: Math.max(0, Math.floor(Number(s.negativeCount) || 0)),
    entries,
    reasons,
  };
}

async function convertOldestNegativesToStaffWarn(s?, count?, actor?, staffUser?, channel?, guild?) {
  const consumed = consumeOldestNegativesFromStaff(s, count);
  if (consumed.removed <= 0) return { removed: 0, finalNeg: consumed.finalNeg };

  const n = consumed.removed;
  const finalNeg = consumed.finalNeg;
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    `<:cancel:1461730653677551691> **__${n} VALUTAZIONI NEGATIVE CONVERTITE__**`,
    `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ sono state **convertite** **${n}** _Valutazioni Negative_ in un **warn staff**.`,
    STAFF_WARN_THREE_NEGATIVES_REASON,
    "<:VC_update:1478721333096349817> __Valutazioni Negative Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${finalNeg}\` valutazioni negative!`,
  );

  let anyEdited = false;
  let needChannelPost = false;
  for (const entry of consumed.entries) {
    const edited = await editOriginalValutazioneMessage(guild, entry, embed);
    if (edited) anyEdited = true;
    else needChannelPost = true;
  }
  if (needChannelPost || !anyEdited) {
    await sendChannelEmbed(channel, { embeds: [embed] });
  }
  return { removed: n, finalNeg };
}

async function runValutazionePositiveAddForPanel(guild?, actorMember?, staffUser?, reason?) {
  try {
    const channel =
      (await resolveStaffValutazioniChannel(guild));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    await valutazionePositiveAddCore(profileDoc, staffUser, reason, actorFromMember(actorMember), channel);
    return { ok: true };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore valutazione positiva." };
  }
}

async function runValutazioneNegativeAddForPanel(guild?, actorMember?, staffUser?, reason?) {
  try {
    const channel =
      (await resolveStaffValutazioniChannel(guild));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    await valutazioneNegativeAddCore(guild, profileDoc, staffUser, reason, actorFromMember(actorMember), channel);
    return { ok: true };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore valutazione negativa." };
  }
}

async function runValutazionePositiveRemoveForPanel(guild?, actorMember?, staffUser?, removeId?, reason?) {
  try {
    const channel =
      (await resolveStaffValutazioniChannel(guild));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    const res = await valutazionePositiveRemoveCore(
      profileDoc,
      staffUser,
      removeId,
      reason,
      actorFromMember(actorMember),
      channel,
    );
    return res.ok ? { ok: true } : { ok: false, message: res.message };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore rimozione valutazione positiva." };
  }
}

async function runValutazioneNegativeRemoveForPanel(guild?, actorMember?, staffUser?, removeId?, reason?, options: Record<string, any> = {}) {
  try {
    const tradeCountRaw = Math.floor(Number(options?.positiveTradeCount || 0));
    const tradeCount = Number.isFinite(tradeCountRaw) && tradeCountRaw > 0 ? tradeCountRaw : 0;
    const channel =
      (await resolveStaffValutazioniChannel(guild));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    const s = ensureStaff(profileDoc);
    if (tradeCount > 0) {
      const available = Array.isArray(s.positiveReasons) ? s.positiveReasons.length : 0;
      if (available < tradeCount) {
        return {
          ok: false,
          message: `<:VC_Attention:1482534443632558151> Servono **almeno ${tradeCount} valutazioni positive** per lo scambio (ne ha \`${available}\`).`,
        };
      }
      const tradeReason = `Scambio: ${tradeCount} positive → rimozione valutazione negativa #${removeId}`;
      await removeOldestPositiveValutazioni(
        s,
        tradeCount,
        actorFromMember(actorMember),
        staffUser,
        channel,
        guild,
        tradeReason,
        (finalPos?) =>
          `<:VC_OnlineStatus:1482527088912240650> Ora ${staffUser?.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
      );
    }
    const res = await valutazioneNegativeRemoveCore(
      profileDoc,
      staffUser,
      removeId,
      reason ||
        (tradeCount
          ? `Scambio ${tradeCount} valutazioni positive → rimozione negativa #${removeId}`
          : `Rimozione val − #${removeId}`),
      actorFromMember(actorMember),
      channel,
    );
    if (!res.ok) return { ok: false, message: res.message };
    return {
      ok: true,
      tradedPositives: tradeCount,
      message: tradeCount
        ? `<a:VC_Verified:1482532479637127188> Valutazione negativa rimossa. Scambiate anche **${tradeCount}** positive.`
        : null,
    };
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore rimozione valutazione negativa." };
  }
}

const SELF_NEG_TRADE_REASON = "Compensazione volontaria: 3 valutazioni positive scambiate per rimuovere 1 negativa";
const HS_NEG_TRADE_REASON = "Compensazione: 3 valutazioni positive scambiate per rimuovere 1 negativa";
const POS_PAUSE_TRADE_REASON = "Scambio valutazioni positive per giorni pausa extra";

async function valutazioneSelfNegTradeThreePosOneNegCore(profileDoc?, staffUser?, negativeRemoveId1Based?, actor?, channel?, guild?, tradeReason = SELF_NEG_TRADE_REASON) {
  const s = ensureStaff(profileDoc);
  const guildRef = guild || channel?.guild;
  if (!guildRef) return { ok: false, message: "<:VC_Attention:1482534443632558151> Server non valido." };
  if (!Number.isInteger(negativeRemoveId1Based) || negativeRemoveId1Based < 1) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> **Numero negativa non valido.** Usa l’indice della lista (es. **1** per −1)." };
  }
  if (!Array.isArray(s.positiveReasons) || s.positiveReasons.length < 3) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Servono **almeno 3 valutazioni positive** per questa opzione." };
  }
  const negIdx = await resolveValutazioneRemoveIndexFull(guildRef, s, "negative", negativeRemoveId1Based, staffUser?.id);
  if (negIdx < 0 || !Array.isArray(s.negativeReasons) || !s.negativeReasons[negIdx]) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> **Numero negativa non valido.** Controlla la lista ( −1, −2, … )." };
  }
  const posResult = await removeOldestPositiveValutazioni(
    s,
    3,
    actor,
    staffUser,
    channel,
    guildRef,
    tradeReason,
    (finalPos?) => `<:VC_OnlineStatus:1482527088912240650> Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
  );
  const removedNegReason = s.negativeReasons[negIdx];
  const negEntry = getValutazioneEntry(s, "negative", negIdx, removedNegReason);
  s.negativeReasons.splice(negIdx, 1);
  removeValutazioneEntry(s, "negative", negIdx);
  s.negativeCount = Math.max(0, s.negativeCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const finalPos = posResult.finalPos;
  const finalNeg = s.negativeCount;
  const negEmbed = makeRemovalEmbed(
    actor,
    staffUser,
    "<:cancel:1461730653677551691> **__VALUTAZIONE NEGATIVA RIMOSSA__**",
    `<:VC_reason:1478517122929004544> A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Negativa!_`,
    tradeReason,
    "<:VC_update:1478721333096349817> __Valutazioni Negative Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalNeg}\` valutazioni negative!`,
  );
  const negEdited = await editOriginalValutazioneMessage(guildRef, negEntry, negEmbed);
  if (!negEdited) await sendChannelEmbed(channel, { embeds: [negEmbed] });
  const actorLike = actor?.member || actor?.user || actor;
  const summary = new EmbedBuilder()
    .setAuthor({
      name: `Valutazione negativa rimossa — ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle("<:thumbsup:1471292172145004768><:thumbsdown:1471292163957457013> **Scambio 3 positive → 1 negativa**")
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic((await getGuildMemberCached(guildRef, staffUser.id).catch(() => null)) || staffUser) || undefined)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> ${formatStaffMention(staffUser)}`,
        "",
        `**Rimossa negativa n°** \`${negativeRemoveId1Based}\` — _${String(removedNegReason || "—").slice(0, 400)}_`,
        "",
        "**Rimosse le 3 positive più vecchie** come contropartita.",
        "",
        `**Conteggi attuali:** <:thumbsup:1471292172145004768> \`${finalPos}\` · <:thumbsdown:1471292163957457013> \`${finalNeg}\``,
      ].join("\n"),
    )
    .setColor(VALUTAZIONE_EMBED_COLOR);
  await sendChannelEmbed(channel, { embeds: [summary] });
  clearWebStaffProfileCache(staffUser?.id);
  return { ok: true };
}

async function valutazionePosForPauseTradeCore(profileDoc?, staffUser?, positiveCount?, pauseDays?, actor?, channel?, guild?) {
  const s = ensureStaff(profileDoc);
  const guildRef = guild || channel?.guild;
  if (!guildRef) return { ok: false, message: "<:VC_Attention:1482534443632558151> Server non valido." };
  const posCount = Math.floor(Number(positiveCount || 0));
  const days = Math.floor(Number(pauseDays || 0));
  if (posCount < 1 || days < 1) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Inserisci **numeri validi** (almeno 1 positiva e 1 giorno pausa)." };
  }
  if (!Array.isArray(s.positiveReasons) || s.positiveReasons.length < posCount) {
    return { ok: false, message: `<:VC_Attention:1482534443632558151> Servono **almeno ${posCount} valutazioni positive** disponibili.` };
  }
  const tradeReason = `${POS_PAUSE_TRADE_REASON}: ${posCount} positive → +${days} giorni pausa`;
  const posResult = await removeOldestPositiveValutazioni(
    s,
    posCount,
    actor,
    staffUser,
    channel,
    guildRef,
    tradeReason,
    (finalPos?) => `<:VC_OnlineStatus:1482527088912240650> Ora ${staffUser.id ? `<@${staffUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
  );
  const prevBonus = Math.max(0, Math.floor(Number(s.valPosTradedPauseBonusDays || 0)));
  s.valPosTradedPauseBonusDays = prevBonus + days;
  profileDoc.markModified("staff");
  await profileDoc.save();
  const actorLike = actor?.member || actor?.user || actor;
  const summary = new EmbedBuilder()
    .setAuthor({
      name: `Scambio pause — ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle("<:thumbsup:1471292172145004768> **Positive → giorni pausa extra**")
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic((await getGuildMemberCached(guildRef, staffUser.id).catch(() => null)) || staffUser) || undefined)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> ${formatStaffMention(staffUser)}`,
        "",
        `**Rimosse** \`${posCount}\` valutazioni positive.`,
        `**Aggiunti** \`+${days}\` giorni pausa extra (totale scambio: \`${s.valPosTradedPauseBonusDays}\`).`,
        "",
        `**Positive rimaste:** \`${posResult.finalPos}\``,
      ].join("\n"),
    )
    .setColor(VALUTAZIONE_EMBED_COLOR);
  await sendChannelEmbed(channel, { embeds: [summary] });
  clearWebStaffProfileCache(staffUser?.id);
  return { ok: true, pauseBonusTotal: s.valPosTradedPauseBonusDays };
}

async function runValutazioneNegTradeForPanel(guild?, actorMember?, staffUser?, negativeRemoveId1Based?) {
  const actorId = String(actorMember?.user?.id || "");
  const targetId = String(staffUser?.id || "");
  const isSelf = actorId && targetId && actorId === targetId;
  if (!isSelf && !memberIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Solo **High Staff** può eseguire questo scambio per un altro staffer." };
  }
  try {
    const channel =
      (await resolveStaffValutazioniChannel(guild));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    const tradeReason = isSelf ? SELF_NEG_TRADE_REASON : HS_NEG_TRADE_REASON;
    return await valutazioneSelfNegTradeThreePosOneNegCore(
      profileDoc,
      staffUser,
      negativeRemoveId1Based,
      actorFromMember(actorMember),
      channel,
      guild,
      tradeReason,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore durante la compensazione delle valutazioni." };
  }
}

async function runValutazionePosPauseTradeForPanel(guild?, actorMember?, staffUser?, positiveCount?, pauseDays?) {
  if (!memberIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Solo **High Staff** può registrare questo scambio." };
  }
  try {
    const channel =
      (await resolveStaffValutazioniChannel(guild));
    const profileDoc = await ensureStaffProfileDoc(
      await getStaffDoc(guild.id, staffUser.id),
      guild.id,
      staffUser.id,
    );
    return await valutazionePosForPauseTradeCore(
      profileDoc,
      staffUser,
      positiveCount,
      pauseDays,
      actorFromMember(actorMember),
      channel,
      guild,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Errore durante lo scambio positive → pausa." };
  }
}

async function runValutazioneSelfNegTradeForPanel(guild?, actorMember?, staffUser?, negativeRemoveId1Based?) {
  return runValutazioneNegTradeForPanel(guild, actorMember, staffUser, negativeRemoveId1Based);
}

export = { buildAutoStaffWarnFromNegativesEmbed, ensureStaffProfileDoc, getStaffDoc, formatStaffMention, valutazionePositiveAddCore, valutazioneNegativeAddCore, valutazionePositiveRemoveCore, makeRemovalEmbed, makeLogEmbed, consumeOldestNegativesFromStaff, removeOldestPositiveValutazioni, runValutazionePositiveAddForPanel, runValutazioneNegativeAddForPanel, runValutazionePositiveRemoveForPanel, runValutazioneNegativeRemoveForPanel, runValutazioneNegTradeForPanel, runValutazionePosPauseTradeForPanel, runValutazioneSelfNegTradeForPanel };