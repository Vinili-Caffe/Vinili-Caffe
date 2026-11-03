const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const STICKER_UPDATE_ACTION = AuditLogEvent?.StickerUpdate ?? 91;
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

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
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveAudit(guild?, stickerId?) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return { executor: null, changes: [] };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: STICKER_UPDATE_ACTION, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const entry=logs.entries.find((item?) => {const created=Number(item?.createdTimestamp||0);const within=created>0&&now-created<=AUDIT_LOOKBACK_MS;return within&&String(item?.target?.id||"")===String(stickerId||"");});
      if (entry) {
        return {
          executor: entry.executor || null,
          changes: Array.isArray(entry.changes) ? entry.changes : [],
        };
      }
    }
    if (attempt < 2) await sleep(700);
  }
  return { executor: null, changes: [] };
}

function getChange(changes?, key?) {
  return changes.find((c?) => String(c?.key || "") === key) || null;
}

export = {
  name: "stickerUpdate",
  async execute(oldSticker?, newSticker?) {
    try {
      const guild = newSticker?.guild || oldSticker?.guild;
      const stickerId = String(newSticker?.id || oldSticker?.id || "");
      if (!guild || !stickerId) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const { executor, changes } = await resolveAudit(guild, stickerId);
      const responsibleText = formatAuditActor(executor);

      const nameChange = getChange(changes, "name");
      const tagsChange = getChange(changes, "tags");
      const fallbackNameChanged=String(oldSticker?.name||"")!==String(newSticker?.name||"");
      const fallbackTagsChanged=String(oldSticker?.tags||"")!==String(newSticker?.tags||"");
      if (!nameChange && !tagsChange && !fallbackNameChanged && !fallbackTagsChanged) return;

      const lines = [
        `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
        `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**<:VC_tools:1478862265305272364> Cambiamenti**",
      ];

      if (nameChange || fallbackNameChanged) {
        lines.push(`<:VC_Modifica:1478859646587633717> **Nome**`);
        lines.push(`  ${String(nameChange?.old ?? oldSticker?.name ?? "sconosciuto")} <a:VC_Arrow:1482706699365257397> ${String(nameChange?.new ?? newSticker?.name ?? "sconosciuto")}`);
      }
      if (tagsChange || fallbackTagsChanged) {
        lines.push(`<:VC_Modifica:1478859646587633717> **Tags**`);
        lines.push(`  ${String(tagsChange?.old ?? oldSticker?.tags ?? "-")} <a:VC_Arrow:1482706699365257397> ${String(tagsChange?.new ?? newSticker?.tags ?? "-")}`);
      }

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("<:VC_Color:1482532543273238569> Sticker Aggiornato")
        .setDescription(lines.join("\n"));

      if (newSticker?.url) embed.setThumbnail(newSticker.url);
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    } catch (error) {
      global.logger?.error?.("[stickerUpdate] log failed:", error);
    }
  },
};