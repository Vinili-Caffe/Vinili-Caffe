const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const STICKER_CREATE_ACTION = AuditLogEvent?.StickerCreate ?? 90;
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function formatAuditActor(actor) {
  if (!actor) return "sconosciuto";
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${actor}${suffix} \`${actor.id}\``;
}

function yesNo(value) {
  return value ? "Si" : "No";
}

function stickerFormatLabel(value) {
  const n = Number(value || 0);
  if (n === 1) return "PNG (.png)";
  if (n === 2) return "APNG (.png)";
  if (n === 3) return "Lottie (.json)";
  if (n === 4) return "GIF (.gif)";
  return `Sconosciuto (${n || 0})`;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveResponsible(guild, stickerId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return null;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: STICKER_CREATE_ACTION, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const entry=logs.entries.find((item) => {const created=Number(item?.createdTimestamp||0);const within=created>0&&now-created<=AUDIT_LOOKBACK_MS;return within&&String(item?.target?.id||"")===String(stickerId||"");});
      if (entry?.executor) return entry.executor;
    }
    if (attempt < 2) await sleep(700);
  }
  return null;
}

module.exports = {
  name: "stickerCreate",
  async execute(sticker) {
    try {
      const guild = sticker?.guild;
      const stickerId = String(sticker?.id || "");
      if (!guild || !stickerId) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsible(guild, stickerId);
      const responsibleText = formatAuditActor(responsible);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("<:VC_Color:1482532543273238569> Sticker Creato")
        .setDescription(
          [
            `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
            `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**<:VC_tools:1478862265305272364> Impostazioni**",
            `<:VC_Modifica:1478859646587633717> **ID:** \`${stickerId}\``,
            `<:VC_Modifica:1478859646587633717> **Nome:** ${sticker.name || "sconosciuto"}`,
            `<:VC_Modifica:1478859646587633717> **Tags:** ${sticker.tags || "-"}`,
            `<:VC_Modifica:1478859646587633717> **Tipo:** Local Server Sticker`,
            `<:VC_Modifica:1478859646587633717> **Formato:** ${stickerFormatLabel(sticker.formatType)}`,
            `<:VC_Modifica:1478859646587633717> **Disponibile:** ${yesNo(Boolean(sticker.available))}`,
            `<:VC_Modifica:1478859646587633717> **ID Server:** \`${guild.id}\``,
          ].join("\n"),
        );

      if (sticker.url) embed.setThumbnail(sticker.url);
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    } catch (error) {
      global.logger?.error?.("[stickerCreate] log failed:", error);
    }
  },
};