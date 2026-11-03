const {
  getOrCreateStaffDoc,
  ensureStaff,
  incrementStaffValutazioneCounters,
  appendStaffRolesHistoryEntry,
} = require("../staffDocUtils") as typeof import("../staffDocUtils");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const {
  addStaffWarnFromNegatives,
  applyFullDepex,
  getHighestStaffRoleId,
  STAFF_WARN_THREE_NEGATIVES_REASON,
  NEGATIVES_PER_STAFF_WARN,
} = require("../../../Staff/services/staffWarnService") as typeof import("../../../Staff/services/staffWarnService");
const { syncStaffDbAndPauseChannelAfterDepex } = require("../staffPmUtils") as typeof import("../staffPmUtils");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const {
  VALUTAZIONE_EMBED_COLOR,
  clearWebStaffProfileCache,
  formatStaffMention,
  makeLogEmbed,
  makeRemovalEmbed,
  sendChannelEmbed,
  getValutazioneEntry,
  removeLinkedAutoValutazioneEntry,
  pushValutazioneEntry,
  mirrorValTrackHistory,
  removeValutazioneEntry,
  resolveValutazioneRemoveIndexFull,
  editOriginalValutazioneMessage,
  syncProfileStaffFromDb,
} = require("./shared") as typeof import("./shared");
const { convertOldestNegativesToStaffWarn } = require("./trades") as typeof import("./trades");

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
    const { notifyStaffValutazione, memberDisplayName } = require("../../../site/staff/siteStaffEventNotifications") as typeof import("../../../site/staff/siteStaffEventNotifications");
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
    const { notifyStaffValutazioneRemoved, memberDisplayName } = require("../../../site/staff/siteStaffEventNotifications") as typeof import("../../../site/staff/siteStaffEventNotifications");
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
  /* Warn/depex log Discord rimossi: decisioni e storico solo sul sito. */
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
        /* Log canale pex/depex Discord rimosso — notifica sito sotto. */
      }
    }
  }
  try {
    const { notifyStaffValutazione, notifyStaffWarn, notifyStaffPexDepex, memberDisplayName } = require("../../../site/staff/siteStaffEventNotifications") as typeof import("../../../site/staff/siteStaffEventNotifications");
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
    const { notifyStaffValutazioneRemoved, memberDisplayName } = require("../../../site/staff/siteStaffEventNotifications") as typeof import("../../../site/staff/siteStaffEventNotifications");
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

export = {
  valutazionePositiveAddCore,
  valutazionePositiveRemoveCore,
  valutazioneNegativeAddCore,
  valutazioneNegativeRemoveCore,
};
