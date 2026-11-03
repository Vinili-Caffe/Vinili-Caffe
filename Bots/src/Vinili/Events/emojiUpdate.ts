const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildChannelCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
const EMOJI_UPDATE_ACTION = AuditLogEvent?.EmojiUpdate ?? 61;
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
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function fetchAuditWithRetry(guild?, emojiId?, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: EMOJI_UPDATE_ACTION, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
    const now = Date.now();
    const entry=logs?.entries?.find((item?) => {const created=Number(item?.createdTimestamp||0);const within=created>0&&now-created<=AUDIT_LOOKBACK_MS;return within&&String(item?.target?.id||"")===String(emojiId||"");});

    if (entry) return entry;
    if (attempt < retries - 1) await sleep(delayMs);
  }

  return null;
}

function normalizeRoleList(emoji?) {
  const ids = emoji?.roles?.cache?.map((role?) => String(role.id)) || [];
  ids.sort();
  return ids;
}

async function resolveAuditChange(guild?, emojiId?) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return { executor: null, oldName: null, newName: null };
  }

  const entry = await fetchAuditWithRetry(guild, emojiId);
  if (!entry) return { executor: null, oldName: null, newName: null };

  const nameChange=Array.isArray(entry?.changes)?entry.changes.find((c?) => String(c?.key||"")==="name"):null;

  return {
    executor: entry?.executor || null,
    oldName: nameChange?.old ?? null,
    newName: nameChange?.new ?? null,
  };
}

export = {
  name: "emojiUpdate",
  async execute(oldEmoji?, newEmoji?) {
    try {
      const guild = newEmoji?.guild || oldEmoji?.guild;
      if (!guild) return;
      if (!isViniliFullFeatureGuild(guild.id)) return;

      const emojiId = String(newEmoji?.id || oldEmoji?.id || "");
      if (!emojiId) return;

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const { executor, oldName, newName } = await resolveAuditChange(guild, emojiId);
      const responsibleText = formatAuditActor(executor);
      const fromName = String(oldName ?? oldEmoji?.name ?? "sconosciuto");
      const toName = String(newName ?? newEmoji?.name ?? "sconosciuto");

      const oldRoles = normalizeRoleList(oldEmoji);
      const newRoles = normalizeRoleList(newEmoji);
      const oldRolesSet = new Set(oldRoles);
      const newRolesSet = new Set(newRoles);
      const addedRoles = newRoles.filter((id?) => !oldRolesSet.has(id));
      const removedRoles = oldRoles.filter((id?) => !newRolesSet.has(id));

      const hasNameChange = fromName !== toName;
      const hasRolesChange = addedRoles.length > 0 || removedRoles.length > 0;
      if (!hasNameChange && !hasRolesChange) return;

      const changeLines = [];
      if (hasNameChange) {
        changeLines.push(`<:VC_Modifica:1478859646587633717> **Nome**`);
        changeLines.push(`  ${fromName} <a:VC_Arrow:1482706699365257397> ${toName}`);
      }

      if (hasRolesChange) {
        changeLines.push(`<:VC_Mention:1482526855289634997> **Ruoli**`);
        if (addedRoles.length) {
          changeLines.push(`  + ${addedRoles.map((id?) => `<@&${id}>`).join(", ")}`);
        }
        if (removedRoles.length) {
          changeLines.push(`  - ${removedRoles.map((id?) => `<@&${id}>`).join(", ")}`);
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("<:VC_Color:1482532543273238569> Emoji Update")
        .setDescription(
          [
            `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
            `<:VC_User:1482527453586002103> **Utente:** ${newEmoji?.name || oldEmoji?.name || "emoji"} \`${emojiId}\``,
            `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**<:VC_tools:1478862265305272364> Cambiamenti**",
            ...changeLines,
          ].join("\n"),
        )
        .addFields({ name: "<a:VC_Countdown:1482706760476131539> Animato", value: newEmoji?.animated ? "Si" : "No", inline: true });

      const imageUrl = newEmoji?.imageURL?.({ extension: "png", size: 256 }) || newEmoji?.url || null;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await logChannel.send({ embeds: [embed] }).catch(() => null);
    } catch (error) {
      global.logger?.error?.("[emojiUpdate] log failed:", error);
    }
  },
};