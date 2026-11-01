const { AuditLogEvent, ChannelType, EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { isMultiGuildLayerEnabled } = require("../core/env") as typeof import("../core/env");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds") as typeof import("../core/viniliProtectedGuilds");
const {
  TENANT_EMBED_COLOR,
  applyBrandingBannerImage,
  createStandardGifAttachment,
} = require("../utils/tenantEmbedBranding") as typeof import("../utils/tenantEmbedBranding");
const { applyDefaultFooter } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");

const AUDIT_DELAY_MS = 2000;
const AUDIT_MAX_AGE_MS = 30_000;

const TEXT_CHANNEL_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
const SEND_PERMS =
  PermissionsBitField.Flags.ViewChannel |
  PermissionsBitField.Flags.SendMessages |
  PermissionsBitField.Flags.EmbedLinks |
  PermissionsBitField.Flags.AttachFiles;

async function resolveBotJoinInviter(guild?, client?) {
  const botId = String(client?.user?.id || "").trim();
  if (!botId || !guild) return null;

  let me = guild.members?.me || null;
  if (!me) {
    me = await guild.members.fetchMe().catch(() => null);
  }

  const canAudit = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog));
  if (canAudit) {
    await new Promise((resolve?) => setTimeout(resolve, AUDIT_DELAY_MS));
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 6 }).catch(() => null);
    const now = Date.now();
    for (const entry of logs?.entries?.values() || []) {
      if (String(entry?.target?.id || "") !== botId) continue;
      if (now - Number(entry?.createdTimestamp || 0) > AUDIT_MAX_AGE_MS) continue;
      const executorId = String(entry?.executorId || entry?.executor?.id || "").trim();
      if (!/^\d{16,20}$/.test(executorId)) continue;
      const user = await client.users.fetch(executorId).catch(() => null);
      if (user) return user;
    }
  }

  try {
    return await guild.fetchOwner();
  } catch {
    return null;
  }
}

function buildWelcomeEmbed(guild?, client?) {
  const prefix = String(client?.config?.prefix || "+").trim() || "+";
  const botName = String(client?.user?.displayName || client?.user?.username || "Vinili & Caffè").trim();
  const guildName = String(guild?.name || "server").trim() || "server";

  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle(`__<a:VC_Rocket:1468544312475123753> Benvenuto in ${botName}!__`)
    .setDescription(
      [`**Grazie** per avermi invitato in **${guildName}**!`, `Esegui \`${prefix}setup\` nel server per **configurarmi**.`].join(
        "\n",
      ),
    );

  return applyDefaultFooter(applyBrandingBannerImage(embed), guild);
}

function welcomePayload(embed?, extra: Record<string, any> = {}) {
  const file = createStandardGifAttachment();
  return {
    embeds: [embed],
    ...(file ? { files: [file] } : {}),
    ...extra,
  };
}

async function ensureGuildChannelsCached(guild?) {
  if (guild?.channels?.cache?.size) return;
  await guild.channels.fetch().catch(() => null);
}

function pickRandomWritableTextChannel(guild?, me?) {
  if (!guild || !me) return null;
  const candidates = [...guild.channels.cache.values()].filter((ch?) => {
    if (!TEXT_CHANNEL_TYPES.has(Number(ch?.type))) return false;
    if (typeof ch.send !== "function") return false;
    return Boolean(ch.permissionsFor(me)?.has(SEND_PERMS));
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function sendWelcomeInGuildChannel(guild?, client?, user?, embed?) {
  let me = guild.members?.me || null;
  if (!me) me = await guild.members.fetchMe().catch(() => null);
  await ensureGuildChannelsCached(guild);
  const channel = pickRandomWritableTextChannel(guild, me);
  if (!channel) {
    global.logger?.warn?.(
      `[MultiGuild welcomeDm] no writable text channel for fallback guild=${guild.id}`,
    );
    return null;
  }

  const payload: any = welcomePayload(embed);
  if (user?.id) {
    payload.content = `<@${user.id}> Non riesco a scriverti in DM — ecco il messaggio di benvenuto qui.`;
    payload.allowedMentions = { users: [user.id], roles: [], parse: [] };
  }

  const sent = await channel.send(payload).catch((err?) => {
    global.logger?.warn?.(
      `[MultiGuild welcomeDm] channel fallback failed guild=${guild.id} channel=${channel.id}:`,
      err?.code || err?.message || err,
    );
    return null;
  });
  if (sent) {
    global.logger?.info?.(
      `[MultiGuild welcomeDm] channel fallback to #${channel.name} (${channel.id}) guild=${guild.id}` +
        (user?.id ? ` user=${user.id}` : ""),
    );
  }
  return sent;
}

async function sendGuildJoinWelcomeDm(client?, guild?) {
  if (!isMultiGuildLayerEnabled() || !client || !guild?.id) return null;
  if (isViniliProtectedGuild(guild.id)) return null;

  const user = await resolveBotJoinInviter(guild, client);
  if (!user?.id) {
    global.logger?.warn?.("[MultiGuild welcomeDm] inviter not found for guild", guild.id);
    const embed = buildWelcomeEmbed(guild, client);
    return sendWelcomeInGuildChannel(guild, client, null, embed);
  }

  const embed = buildWelcomeEmbed(guild, client);
  try {
    return await user.send(welcomePayload(embed));
  } catch (err) {
    const code = Number(err?.code || 0);
        if (code !== 50007 && code !== 50278) {
      global.logger?.warn?.(
        `[MultiGuild welcomeDm] DM failed user=${user.id} guild=${guild.id}:`,
        code || err?.message || err,
      );
    }
    return sendWelcomeInGuildChannel(guild, client, user, embed);
  }
}

export = {
  sendGuildJoinWelcomeDm,
  buildWelcomeEmbed,
  pickRandomWritableTextChannel,
};
