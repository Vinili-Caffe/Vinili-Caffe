const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getGuildChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
const EMOJI_DELETE_ACTION = AuditLogEvent?.EmojiDelete ?? 62;
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
  const logs = await guild.fetchAuditLogs({ type: EMOJI_DELETE_ACTION, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
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
  name: "emojiDelete",
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
        .setColor("#ED4245")
        .setTitle("<:VC_Color:1482532543273238569> Emoji Delete")
        .setDescription(
          [
            `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
            `<:VC_User:1482527453586002103> **Utente:** ${emoji.name || "emoji"} \`${emojiId}\``,
            `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**<:VC_tools:1478862265305272364> Impostazioni precedenti**",
            `<:VC_Modifica:1478859646587633717> **Nome:** ${emoji.name || "sconosciuto"}`,
            `<a:VC_Countdown:1482706760476131539> **Animato:** ${emoji?.animated ? "Si" : "No"}`,
          ].join("\n"),
        );

      const imageUrl = emoji.imageURL?.({ extension: "png", size: 256 }) || emoji.url || null;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[emojiDelete] log failed:", error);
    }
  },
};