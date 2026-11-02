"use strict";

/** Custom profile: create/delete/rename vocale privata, emoji e overwrite membri. */
const { ChannelType, OverwriteType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { CustomRole, ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { hasExtraCustomPerksUnlock } = require("../../Utils/Community/customPerksUnlock") as typeof import("../../Utils/Community/customPerksUnlock");
const { fetchPartnerManagerTimedPerkLean, partnerManagerCustomBundleActiveFromLean } = require("../../Utils/Staff/partnerManagerTimedPerks") as typeof import("../../Utils/Staff/partnerManagerTimedPerks");
const { buildCustomVocName, parseCustomVocName, sanitizeVoiceBaseName, normalizeCustomVocEmojiValue } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { buildCustomVocCreateOverwrites, ensureCustomVocChannelBaseline, CUSTOM_VOC_MEMBER_PERMS, applyOverwrite } = require("./customVocPermissionsService") as typeof import("./customVocPermissionsService");
const { ensureCustomPrivateCategory } = require("../../Utils/Community/customPrivateCategoryUtils") as typeof import("../../Utils/Community/customPrivateCategoryUtils");
const { isCustomVocRecreationBlocked } = require("./customVocWeeklyActivityService") as typeof import("./customVocWeeklyActivityService");
const { getLastSunday21BoundaryMsAtOrBefore } = require("../../Utils/Community/customVocWeeklyActivityUtils") as typeof import("../../Utils/Community/customVocWeeklyActivityUtils");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { memberCanCreateCustomVoc, okPersist } = require("./customProfileShared") as typeof import("./customProfileShared");

async function createCustomVoc({ client, guild, member, ownerId }) {
  if (!guild || !member) return { ok: false, reason: "server_missing" };
  const [hasExtraUnlock, pmPerkLean] = await Promise.all([
    hasExtraCustomPerksUnlock(guild.id, ownerId),
    fetchPartnerManagerTimedPerkLean(guild.id, ownerId),
  ]);
  const pmBundle = partnerManagerCustomBundleActiveFromLean(pmPerkLean);
  if (!memberCanCreateCustomVoc(member) && !hasExtraUnlock && !pmBundle) {
    return { ok: false, reason: "missing_customvoc_access" };
  }

  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) {
    return { ok: false, reason: "no_manage_channels" };
  }

  const latestDoc =
    (await CustomRole.findOne({ guildId: guild.id, userId: ownerId }).lean().catch(() => null)) ||
    (await ActivityUserProfile.findOne({ guildId: guild.id, userId: ownerId })
      .select("profile.customRole")
      .lean()
      .then((row?: any) => (row?.profile?.customRole ? { guildId: guild.id, userId: ownerId, ...row.profile.customRole } : null))
      .catch(() => null));

  if (isCustomVocRecreationBlocked(latestDoc)) {
    return { ok: false, reason: "customvoc_recreation_cooldown", until: latestDoc?.customVocRecreationBlockedUntil || null };
  }

  const existingChannelId = String(latestDoc?.customVocChannelId || "").trim();
  if (existingChannelId) {
    const existing = guild.channels?.cache?.get?.(existingChannelId) || (await guild.channels?.fetch?.(existingChannelId).catch(() => null));
    if (existing) return { ok: true, channel: existing, doc: latestDoc };
  }

  const category = await ensureCustomPrivateCategory(guild, client);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, reason: "category_missing" };
  }

  const channelName = buildCustomVocName(
    latestDoc?.customVocEmoji || "🎧",
    accountUsername(member) || "privata",
  );

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: category.id,
    reason: `Canale vocale privato via sito per ${member.user?.tag || ownerId}`,
    permissionOverwrites: buildCustomVocCreateOverwrites(guild, ownerId, client.user.id),
  }).catch(() => null);
  if (!channel) return { ok: false, reason: "channel_create_failed" };
  await ensureCustomVocChannelBaseline(channel, ownerId, client.user.id).catch(() => {});

  const doc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: ownerId },
    {
      $set: {
        customVocChannelId: channel.id,
        customVocFailedWeekStreak: 0,
        customVocLastEvaluatedWeekEndMs: getLastSunday21BoundaryMsAtOrBefore(),
        customVocRecreationBlockedUntil: null,
      },
    },
    { new: true, lean: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return okPersist(guild, ownerId, "create_custom_voc", { ok: true, channel, doc });
}

async function deleteCustomVoc({ client, guild, ownerId }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (channel?.delete) {
    await channel.delete(`Custom voice deleted via sito da ${ownerId}`).catch(() => {});
  }
  await CustomRole.updateOne(
    { guildId: guild.id, userId: ownerId },
    { $set: { customVocChannelId: null, customVocEligibilityLostAt: null, customVocFailedWeekStreak: 0 } },
  ).catch(() => {});

  return okPersist(guild, ownerId, "delete_custom_voc", { ok: true });
}

async function renameCustomVoc({ guild, ownerId, baseName }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1, customVocEmoji: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return { ok: false, reason: "channel_not_found" };

  const parsedCurrent = parseCustomVocName(channel.name || "");
  const preservedEmoji = parsedCurrent.emoji || vocDoc?.customVocEmoji || "🎧";
    const rawIn = String(baseName || "").trim();
  const parsedIn = parseCustomVocName(rawIn);
  const cleanedBase = sanitizeVoiceBaseName(parsedIn.baseName || rawIn) || parsedCurrent.baseName || "privata";
  const nextName = buildCustomVocName(preservedEmoji, cleanedBase);

  if (String(channel.name || "") === nextName) {
    return { ok: true, message: "Nome già aggiornato.", name: nextName };
  }

  try {
    await channel.edit({ name: nextName }, `Custom voc rename via sito da ${ownerId}`);
    return okPersist(guild, ownerId, "rename_custom_voc", { ok: true, message: "Nome vocale aggiornato.", name: nextName });
  } catch (err) {
    const code = Number(err?.code || err?.status || 0);
    if (code === 429 || /rate.?limit/i.test(String(err?.message || ""))) {
      return { ok: false, reason: "discord_rate_limit" };
    }
    if (code === 50013 || code === 50001) {
      return { ok: false, reason: "no_manage_channels" };
    }
    global.logger?.warn?.("[customProfile] renameCustomVoc failed:", code, err?.message || err);
    return { ok: false, reason: "edit_failed", detail: String(err?.message || "").slice(0, 180) };
  }
}

async function setCustomVocEmoji({ guild, ownerId, emoji }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const normalized = normalizeCustomVocEmojiValue(emoji);
  if (!normalized) return { ok: false, reason: "invalid_emoji" };

  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  await CustomRole.updateOne({ guildId: guild.id, userId: ownerId }, { $set: { customVocEmoji: normalized } }).catch(() => {});

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return okPersist(guild, ownerId, "custom_voc_emoji", { ok: true, message: "Emoji salvata (canale non trovato per rinominare).", emoji: normalized });
  }

  const parsedCurrent = parseCustomVocName(channel.name || "");
  const currentBase = parsedCurrent.baseName || "privata";
  const nextName = buildCustomVocName(normalized, currentBase);
  if (String(channel.name || "") === nextName) {
    return okPersist(guild, ownerId, "custom_voc_emoji", { ok: true, message: "Emoji aggiornata.", emoji: normalized });
  }

  try {
    await channel.edit({ name: nextName }, `Custom voc emoji via sito da ${ownerId}`);
    return okPersist(guild, ownerId, "custom_voc_emoji", { ok: true, message: "Emoji vocale aggiornata.", emoji: normalized });
  } catch (err) {
    const code = Number(err?.code || err?.status || 0);
        if (code === 429 || /rate.?limit/i.test(String(err?.message || ""))) {
      return {
        ok: false,
        reason: "discord_rate_limit",
        message:
          "Emoji salvata in database, ma Discord limita i rename del canale (circa 2 ogni 10 minuti). Riprova tra qualche minuto.",
      };
    }
    if (code === 50013 || code === 50001) {
      return { ok: false, reason: "no_manage_channels" };
    }
    global.logger?.warn?.("[customProfile] setCustomVocEmoji failed:", code, err?.message || err);
    return { ok: false, reason: "edit_failed", detail: String(err?.message || "").slice(0, 180) };
  }
}

async function addCustomVocMember({ guild, ownerId, memberId }) {
  if (!guild || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId) || String(memberId) === String(guild.client?.user?.id || "")) {
    return { ok: false, reason: "invalid_params", message: "Non puoi aggiungere proprietario o bot." };
  }
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return { ok: false, reason: "channel_not_found" };

  const target = await guild.members.fetch({ user: memberId, force: true }).catch(() => null);
  if (!target) return { ok: false, reason: "member_not_found" };

    const ok = await applyOverwrite(
    channel,
    memberId,
    CUSTOM_VOC_MEMBER_PERMS,
    `Custom voc grant via sito da ${ownerId}`,
    OverwriteType.Member,
  );
  if (!ok) {
        const existing = channel.permissionOverwrites?.cache?.get?.(String(memberId));
    if (existing) return okPersist(guild, ownerId, "custom_voc_member_add", { ok: true, message: "Accesso già presente." });
    return { ok: false, reason: "edit_failed" };
  }
  return okPersist(guild, ownerId, "custom_voc_member_add", { ok: true, message: "Accesso aggiunto." });
}

async function removeCustomVocMember({ guild, ownerId, memberId }) {
  if (!guild || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId)) {
    return { ok: false, reason: "cannot_remove_owner", message: "Non puoi toglierti l'accesso: sei il proprietario della vocale." };
  }
  const botId = String(guild.client?.user?.id || guild.members?.me?.id || "").trim();
  if (botId && String(memberId) === botId) {
    return { ok: false, reason: "cannot_remove_owner", message: "Non puoi rimuovere il bot dal canale." };
  }
  const vocDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { customVocChannelId: 1 }).lean().catch(() => null);
  const channelId = String(vocDoc?.customVocChannelId || "").trim();
  if (!channelId) return { ok: false, reason: "no_custom_voc" };

  const channel = guild.channels?.cache?.get?.(channelId) || (await guild.channels?.fetch?.(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return { ok: false, reason: "channel_not_found" };

  const deleted = await channel.permissionOverwrites
    .delete(memberId, `Custom voc revoke via sito da ${ownerId}`)
    .then(() => true)
    .catch((err?) => {
      const code = Number(err?.code || 0);
            if (code === 10009) return true;
      global.logger?.warn?.("[customProfile] removeCustomVocMember failed:", code, err?.message || err);
      return false;
    });
  if (!deleted) return { ok: false, reason: "edit_failed" };
  return okPersist(guild, ownerId, "custom_voc_member_remove", { ok: true, message: "Accesso rimosso." });
}

export = {
  createCustomVoc,
  deleteCustomVoc,
  renameCustomVoc,
  setCustomVocEmoji,
  addCustomVocMember,
  removeCustomVocMember,
};
