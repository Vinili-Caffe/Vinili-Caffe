const { ChannelType, EmbedBuilder, PermissionsBitField } = require("discord.js");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { getClientChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds");
const { isMultiGuildLayerEnabled } = require("../core/env");
const joinAlertConfig = require("../config/joinAlert.json");

const BOT_STATE_KEY = "multiGuildManagedInvites";
const RECREATE_LOCKS = new Map();
/** Solo canali testo/annunci: niente vocali (né text-in-voice). */
const INVITE_CHANNEL_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

function isJoinAlertEnabled() {
  return isMultiGuildLayerEnabled();
}

function normalizeGuildId(guildId) {
  const id = String(guildId || "").trim();
  return /^\d{16,20}$/.test(id) ? id : "";
}

async function loadManagedInvitesMap() {
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function saveManagedInvite(guildId, payload) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return;
  const map = await loadManagedInvitesMap();
  map[gid] = {
    code: String(payload?.code || ""),
    channelId: String(payload?.channelId || ""),
    url: String(payload?.url || ""),
    logMessageId: payload?.logMessageId ? String(payload.logMessageId) : null,
    updatedAt: Date.now(),
  };
  await setBotState(BOT_STATE_KEY, map);
}

async function getManagedInvite(guildId) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return null;
  const map = await loadManagedInvitesMap();
  const row = map[gid];
  if (!row || typeof row !== "object") return null;
  return { guildId: gid, ...row };
}

async function removeManagedInvite(guildId) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return false;
  const map = await loadManagedInvitesMap();
  if (!Object.prototype.hasOwnProperty.call(map, gid)) return false;
  delete map[gid];
  await setBotState(BOT_STATE_KEY, map);
  return true;
}

function verificationLevelLabel(level) {
  const map = {
    0: "Nessuna",
    1: "Bassa",
    2: "Media",
    3: "Alta",
    4: "Molto alta",
  };
  return map[Number(level)] || String(level ?? "?");
}

function isInviteEligibleTextChannel(channel) {
  return Boolean(
    channel &&
      INVITE_CHANNEL_TYPES.has(Number(channel.type)) &&
      typeof channel.createInvite === "function",
  );
}

function canCreateInviteInChannel(channel, me) {
  if (!isInviteEligibleTextChannel(channel) || !me) return false;
  return Boolean(channel.permissionsFor(me)?.has(PermissionsBitField.Flags.CreateInstantInvite));
}

function pickInviteChannel(guild, me) {
  if (!guild || !me) return null;
  if (canCreateInviteInChannel(guild.systemChannel, me)) return guild.systemChannel;
  const sorted = [...guild.channels.cache.values()]
    .filter((ch) => canCreateInviteInChannel(ch, me))
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
  return sorted[0] || null;
}

async function deleteGuildInviteByCode(guild, code, reason = "MultiGuild invite relocate") {
  const want = String(code || "").trim();
  if (!guild?.id || !want) return false;
  try {
    const invites = await guild.invites.fetch().catch(() => null);
    const existing = invites?.get?.(want) || null;
    if (existing && typeof existing.delete === "function") {
      await existing.delete(String(reason || "MultiGuild invite relocate"));
      return true;
    }
  } catch (err) {
    global.logger?.warn?.(
      "[MultiGuild joinAlert] deleteInvite failed:",
      guild.id,
      want,
      err?.message || err,
    );
  }
  return false;
}

async function createPermanentInvite(guild, reason, preferredChannelId = null) {
  const me = guild.members.me || (await getGuildMemberCached(guild, guild.client.user.id).catch(() => null));
  if (!me) return null;
  let channel = null;
  const preferredId = String(preferredChannelId || "").trim();
  if (/^\d{16,20}$/.test(preferredId)) {
    const preferred =
      guild.channels.cache.get(preferredId) ||
      (await guild.channels.fetch(preferredId).catch(() => null));
    if (canCreateInviteInChannel(preferred, me)) {
      channel = preferred;
    }
  }
  if (!channel) channel = pickInviteChannel(guild, me);
  if (!channel) return null;
  const invite = await channel
    .createInvite({
      maxAge: 0,
      maxUses: 0,
      unique: true,
      temporary: false,
      reason: String(reason || joinAlertConfig.inviteReason || "MultiGuild permanent invite"),
    })
    .catch((err) => {
      global.logger?.warn?.("[MultiGuild joinAlert] createInvite failed:", guild.id, err?.message || err);
      return null;
    });
  if (!invite) return null;
  return {
    code: invite.code,
    channelId: channel.id,
    url: invite.url || `https://discord.gg/${invite.code}`,
    channel,
  };
}

function buildGuildJoinEmbed(guild, inviteRow, ownerUser, extra = {}) {
  const owner = ownerUser
    ? `${ownerUser} (\`${ownerUser.id}\`)`
    : guild.ownerId
      ? `<@${guild.ownerId}> (\`${guild.ownerId}\`)`
      : "—";
  const features = Array.isArray(guild.features) && guild.features.length
    ? guild.features.map((f) => `\`${f}\``).join(", ")
    : "—";
  const inviteBlock = inviteRow?.url
    ? [
        "",
        "**Invito permanente (bot)**",
        `🔗 ${inviteRow.url}`,
        `Codice: \`${inviteRow.code}\` · Canale: <#${inviteRow.channelId}>`,
        extra.regenerated ? "_Invito rigenerato automaticamente._" : "",
      ].filter(Boolean).join("\n")
    : "\n⚠️ Impossibile creare invito (permessi mancanti).";

  return new EmbedBuilder()
    .setColor(extra.regenerated ? "#FEE75C" : "#57F287")
    .setTitle(extra.regenerated ? "🔄 Invito rigenerato — bot in nuova guild" : "✅ Bot aggiunto in nuova guild")
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setDescription(
      [
        `**${guild.name}**`,
        inviteBlock,
      ].join("\n"),
    )
    .addFields(
      { name: "Guild ID", value: `\`${guild.id}\``, inline: true },
      { name: "Membri", value: `${guild.memberCount ?? "?"}`, inline: true },
      { name: "Boost", value: `${guild.premiumTier ?? 0}`, inline: true },
      { name: "Proprietario", value: owner, inline: false },
      { name: "Verifica", value: verificationLevelLabel(guild.verificationLevel), inline: true },
      { name: "Creato", value: guild.createdAt ? `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>` : "—", inline: true },
      { name: "Locale", value: guild.preferredLocale || "—", inline: true },
      { name: "Features", value: features.slice(0, 1020), inline: false },
      {
        name: "Bot in guild",
        value: [
          `Shard: \`${guild.shardId ?? "—"}\``,
          `Canali: ${guild.channels?.cache?.size ?? "?"}`,
          `Ruoli: ${guild.roles?.cache?.size ?? "?"}`,
        ].join("\n"),
        inline: false,
      },
    )
    .setFooter({ text: extra.regenerated ? "MultiGuild · invite restore" : "MultiGuild · guild join" })
    .setTimestamp();
}

async function resolveLogChannel(client) {
  const channelId = String(joinAlertConfig.logChannelId || "").trim();
  if (!channelId || !client) return null;
  return getClientChannelCached(client, channelId);
}

async function sendOrUpdateJoinLog(client, guild, inviteRow, options = {}) {
  const logChannel = await resolveLogChannel(client);
  if (!logChannel?.isTextBased?.()) {
    global.logger?.warn?.("[MultiGuild joinAlert] log channel unavailable:", joinAlertConfig.logChannelId);
    return null;
  }
  let ownerUser = null;
  try {
    ownerUser = await guild.fetchOwner();
  } catch (_) {}
  const embed = buildGuildJoinEmbed(guild, inviteRow, ownerUser, options);
  const managed = await getManagedInvite(guild.id);
  if (options.regenerated && managed?.logMessageId) {
    const prev = await logChannel.messages.fetch(managed.logMessageId).catch(() => null);
    if (prev?.editable) {
      await prev.edit({ embeds: [embed] }).catch(() => null);
      return prev;
    }
  }
  return logChannel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.warn?.("[MultiGuild joinAlert] log send failed:", err?.message || err);
    return null;
  });
}

async function handleBotJoinedGuild(client, guild) {
  if (!isJoinAlertEnabled() || !guild?.id) return null;
  if (isViniliProtectedGuild(guild.id)) return null;

  const invite = await createPermanentInvite(guild, joinAlertConfig.inviteReason);
  const inviteRow = invite
    ? { code: invite.code, channelId: invite.channelId, url: invite.url }
    : null;

  const logMessage = await sendOrUpdateJoinLog(client, guild, inviteRow);
  if (inviteRow) {
    await saveManagedInvite(guild.id, {
      ...inviteRow,
      logMessageId: logMessage?.id || null,
    });
    try {
      const { maybeSyncPartnershipInviteFromManaged } = require("../../Services/Partner/partnershipInviteService");
      await maybeSyncPartnershipInviteFromManaged(guild.id, inviteRow);
    } catch (_) {}
  }
  return { invite: inviteRow, logMessageId: logMessage?.id || null };
}

async function handleManagedInviteDeleted(client, invite) {
  if (!isJoinAlertEnabled()) return;
  const guild = invite?.guild;
  const code = String(invite?.code || "");
  if (!guild?.id || !code || isViniliProtectedGuild(guild.id)) return;

  const managed = await getManagedInvite(guild.id);
  if (!managed?.code || managed.code !== code) return;

  const cooldown = Math.max(3000, Number(joinAlertConfig.recreateCooldownMs) || 8000);
  if (RECREATE_LOCKS.get(guild.id) > Date.now()) return;
  RECREATE_LOCKS.set(guild.id, Date.now() + cooldown);

  const fresh = await guild.fetch().catch(() => guild);
  let preferredChannelId = null;
  try {
    const { getPartnershipConfig } = require("../core/tenantPartnershipSettings");
    const cfg = await getPartnershipConfig(guild.id).catch(() => null);
    preferredChannelId = cfg?.partnershipsChannelId || managed.channelId || null;
  } catch (_) {
    preferredChannelId = managed.channelId || null;
  }
  const recreated = await createPermanentInvite(
    fresh,
    `${joinAlertConfig.inviteReason} (rigenerato)`,
    preferredChannelId,
  );
  if (!recreated) {
    global.logger?.warn?.("[MultiGuild joinAlert] recreate failed:", guild.id);
    return;
  }

  await saveManagedInvite(guild.id, {
    code: recreated.code,
    channelId: recreated.channelId,
    url: recreated.url,
    logMessageId: managed.logMessageId,
  });

  try {
    const { maybeSyncPartnershipInviteFromManaged } = require("../../Services/Partner/partnershipInviteService");
    await maybeSyncPartnershipInviteFromManaged(guild.id, recreated);
  } catch (_) {}

  await sendOrUpdateJoinLog(client, fresh, recreated, { regenerated: true });

  const logChannel = await resolveLogChannel(client);
  if (logChannel?.isTextBased?.()) {
    await logChannel
      .send({
        content: `⚠️ Invito \`${code}\` eliminato su **${fresh.name}** (\`${fresh.id}\`) — rigenerato: ${recreated.url}`,
      })
      .catch(() => null);
  }

  global.logger?.info?.(
    `[MultiGuild joinAlert] recreated invite ${guild.id}: ${code} → ${recreated.code}`,
  );
}

module.exports = {
  isJoinAlertEnabled,
  handleBotJoinedGuild,
  handleManagedInviteDeleted,
  getManagedInvite,
  removeManagedInvite,
  createPermanentInvite,
  saveManagedInvite,
  deleteGuildInviteByCode,
  isInviteEligibleTextChannel,
  sendOrUpdateJoinLog,
};