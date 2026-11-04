const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const EMOJI_CREATE_ACTION = AuditLogEvent?.EmojiCreate ?? 60;
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const AUDIT_RETRY_ATTEMPTS = 4;
const AUDIT_RETRY_DELAY_MS = 900;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function formatAuditActor(actor?) {
  if (!actor) return "sconosciuto";
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${actor}${suffix} \`${actor.id}\``;
}

async function resolveLogChannel(guild?) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function resolveResponsible(guild?, emojiId?) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return null;
  }
  const logs = await guild.fetchAuditLogs({ type: EMOJI_CREATE_ACTION, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
  if (!logs?.entries?.size) return null;
  const now = Date.now();
  const entry=logs.entries.find((item?) => {const created=Number(item?.createdTimestamp||0);const within=created>0&&now-created<=AUDIT_LOOKBACK_MS;return within&&String(item?.target?.id||"")===String(emojiId||"");});
  return entry?.executor || null;
}

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsibleWithRetry(guild?, emojiId?) {
  for (let attempt = 0; attempt < AUDIT_RETRY_ATTEMPTS; attempt += 1) {
    const responsible = await resolveResponsible(guild, emojiId);
    if (responsible) return responsible;
    if (attempt < AUDIT_RETRY_ATTEMPTS - 1) {
      await wait(AUDIT_RETRY_DELAY_MS);
    }
  }
  return null;
}

export = {
  name: "emojiCreate",
  async execute(emoji?) {
    try {
      const guild = emoji?.guild;
      const emojiId = String(emoji?.id || "").trim();
      if (!guild || !emojiId) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsibleWithRetry(guild, emojiId);
      const responsibleText = formatAuditActor(responsible);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(`${E.VC_Color} Emoji Create`)
        .setDescription(
          [
            `${E.VC_Staff} **Responsabile:** ${responsibleText}`,
            `${E.VC_User} **Utente:** ${emoji.name || "emoji"} \`${emojiId}\``,
            `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            `**${E.VC_tools} Impostazioni**`,
            `${E.VC_Modifica} **Nome:** ${emoji.name || "sconosciuto"}`,
            `${E.VC_Countdown} **Animato:** ${emoji?.animated ? "Si" : "No"}`,
          ].join("\n"),
        );

      const imageUrl = emoji.imageURL?.({ extension: "png", size: 256 }) || emoji.url || null;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[emojiCreate] log failed:", error);
    }
  },
};