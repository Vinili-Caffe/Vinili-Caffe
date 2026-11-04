const { AuditLogEvent, EmbedBuilder, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { queueCategoryRenumber, isCategoryNumberingBotRename, } = require("../../Community/services/communityOpsService") as typeof import("../../Community/services/communityOpsService");
const { queueIdsCatalogSync } = require("../../Config/idsAutoSync") as typeof import("../../Config/idsAutoSync");
const { upsertChannelSnapshot, } = require("../../Community/utils/channelSnapshotUtils") as typeof import("../../Community/utils/channelSnapshotUtils");
const { toDiscordTimestamp, channelDisplay, channelTypeLabel, formatAuditActor, permissionList, permissionDiff, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { handleChannelOverwrite: antiNukeHandleChannelOverwrite } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const CHANNEL_UPDATE_ACTION = AuditLogEvent?.ChannelUpdate ?? 11;
const OVERWRITE_CREATE_ACTION = AuditLogEvent?.ChannelOverwriteCreate ?? 13;
const OVERWRITE_UPDATE_ACTION = AuditLogEvent?.ChannelOverwriteUpdate ?? 14;
const OVERWRITE_DELETE_ACTION = AuditLogEvent?.ChannelOverwriteDelete ?? 15;
const AUDIT_RETRY_ATTEMPTS = 4;
const AUDIT_RETRY_DELAY_MS = 900;

function collectOverwriteDiffs(oldChannel?, newChannel?) {
  const diffs = [];
  const oldMap = oldChannel?.permissionOverwrites?.cache || new Map();
  const newMap = newChannel?.permissionOverwrites?.cache || new Map();
  const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const id of allIds) {
    const before = oldMap.get(id) || null;
    const after = newMap.get(id) || null;
    if (!before && after) {
      diffs.push({ kind: "create", after, before: null });
      continue;
    }
    if (before && !after) {
      diffs.push({ kind: "delete", before, after: null });
      continue;
    }
    if (!before || !after) continue;
    const allowChanged = before.allow.bitfield !== after.allow.bitfield;
    const denyChanged = before.deny.bitfield !== after.deny.bitfield;
    if (allowChanged || denyChanged) {
      diffs.push({ kind: "update", before, after });
    }
  }
  return diffs;
}

function overwriteTypeLabel(overwrite?) {
  const t = Number(overwrite?.type ?? -1);
  if (t === OverwriteType.Member) return "Member";
  if (t === OverwriteType.Role) return "Role";
  return `Sconosciuto (${t})`;
}

function targetName(guild?, overwrite?) {
  if (!overwrite?.id) return "sconosciuto";
  if (Number(overwrite.type) === OverwriteType.Member) {
    const m = guild?.members?.cache?.get(overwrite.id);
    return m?.user ? `${m.user}` : `@${overwrite.id}`;
  }
  const role = guild?.roles?.cache?.get(overwrite.id);
  return role ? `${role}` : `@ruolo-${overwrite.id}`;
}

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveAuditWithRetry(guild?, actionType?, matcher?) {
  for (let attempt = 0; attempt < AUDIT_RETRY_ATTEMPTS; attempt += 1) {
    const audit = await resolveResponsible(guild, actionType, matcher);
    if (audit?.entry || audit?.executor) return audit;
    if (attempt < AUDIT_RETRY_ATTEMPTS - 1) {
      await wait(AUDIT_RETRY_DELAY_MS);
    }
  }
  return { executor: null, reason: null, entry: null };
}

async function sendChannelUpdateLog(oldChannel?, newChannel?) {
  const guild = newChannel?.guild || oldChannel?.guild;
  if (!guild) return;

  const nameChanged = oldChannel?.name !== newChannel?.name;
  const typeChanged = Number(oldChannel?.type) !== Number(newChannel?.type);
  const parentChanged = oldChannel?.parentId !== newChannel?.parentId;
  const rateLimitChanged = Number(oldChannel?.rateLimitPerUser || 0) !== Number(newChannel?.rateLimitPerUser || 0);

  if (!nameChanged && !typeChanged && !parentChanged && !rateLimitChanged) return;

  const logChannel = await resolveChannelRolesLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const audit = await resolveAuditWithRetry(guild, CHANNEL_UPDATE_ACTION, (entry?) => String(entry?.target?.id || "") === String(newChannel?.id || ""),);
  const responsible = formatAuditActor(audit?.executor || null);

  const lines = [
    `${E.VC_Staff} **Responsabile:** ${responsible}`,
    `${E.VC_User} **Utente:** ${channelDisplay(newChannel)} \`${newChannel.id}\``,
    `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
    "",
    `**${E.VC_Info} Cambiamenti**`,
  ];

  if (nameChanged) {
    lines.push(
      `${E.VC_Modifica} **Nome:** ${oldChannel?.name || "sconosciuto"} ${E.VC_Arrow} ${newChannel?.name || "sconosciuto"}`,
    );
  }
  if (typeChanged) {
    lines.push(
      `${E.VC_Channel} **Type:** ${channelTypeLabel(oldChannel)} ${E.VC_Arrow} ${channelTypeLabel(newChannel)}`,
    );
  }
  if (parentChanged) {
    const oldParent = oldChannel?.parent ? `${oldChannel.parent}` : "Nessuna";
    const newParent = newChannel?.parent ? `${newChannel.parent}` : "Nessuna";
    lines.push(`${E.VC_Info} **Parent:** ${oldParent} ${E.VC_Arrow} ${newParent}`);
  }
  if (rateLimitChanged) {
    const oldRate = Number(oldChannel?.rateLimitPerUser || 0) || "Nessuno";
    const newRate = Number(newChannel?.rateLimitPerUser || 0) || "Nessuno";
    lines.push(`${E.VC_Info} **RPM utente:** ${oldRate} ${E.VC_Arrow} ${newRate}`);
  }
  lines.push(
    ...buildAuditExtraLines(audit?.entry, [
      "name",
      "type",
      "parent_id",
      "rate_limit_per_user",
    ]),
  );

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${E.VC_Channel} Channel Update`)
    .setDescription(lines.join("\n"));

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

async function sendOverwriteLogs(oldChannel?, newChannel?) {
  const guild = newChannel?.guild || oldChannel?.guild;
  if (!guild) return;

  const diffs = collectOverwriteDiffs(oldChannel, newChannel);
  if (!diffs.length) return;

  const logChannel = await resolveChannelRolesLogChannel(guild);
  const canSendLogs = Boolean(logChannel?.isTextBased?.());

  for (const diff of diffs) {
    try {
      const kind = diff.kind;
      const actionType = kind === "create" ? OVERWRITE_CREATE_ACTION : kind === "delete" ? OVERWRITE_DELETE_ACTION : OVERWRITE_UPDATE_ACTION;
      const source = diff.after || diff.before;
      if (!source) continue;

      const audit = await resolveAuditWithRetry(guild, actionType, (entry?) => { const sameChannel = String(entry?.extra?.channel?.id || "") === String(newChannel?.id || ""); const sameTarget = String(entry?.target?.id || "") === String(source?.id || ""); return sameChannel || sameTarget; }); const responsible = formatAuditActor(audit?.executor || null);
      const executorId = String(audit?.executor?.id || "");

      const lines = [
        `${E.VC_Staff} **Responsabile:** ${responsible}`,
        `${E.VC_Channel} **Canale:** ${channelDisplay(newChannel)} \`${newChannel.id}\``,
        `${E.VC_User} **Utente:** ${targetName(guild, source)} \`${source?.id || "sconosciuto"}\``,
        `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
        "",
      ];

      if (kind === "create") {
        lines.push(
          `**${E.VC_tools} Impostazioni**`,
          `${E.VC_id} **ID:** \`${source.id}\``,
          `${E.VC_Channel} **Tipo:** ${overwriteTypeLabel(source)}`,
          `${E.VC_Info} **Permessi concessi:** ${permissionList(source.allow.bitfield)}`,
          `${E.VC_Info} **Permessi negati:** ${permissionList(source.deny.bitfield)}`,
        );
        lines.push(...buildAuditExtraLines(audit?.entry, ["allow", "deny", "type", "id"]));
      } else if (kind === "delete") {
        lines.push(
          `**${E.VC_tools} Informazioni aggiuntive**`,
          `${E.VC_id} **ID:** \`${source.id}\``,
          `${E.VC_Channel} **Tipo:** ${overwriteTypeLabel(source)}`,
        );
        lines.push(...buildAuditExtraLines(audit?.entry, ["type", "id"]));
      } else {
        const deniedDiff = permissionDiff(diff.before.deny.bitfield, diff.after.deny.bitfield,);
        const grantedDiff = permissionDiff(diff.before.allow.bitfield, diff.after.allow.bitfield,);
        lines.push(
          `**${E.VC_tools} Cambiamenti**`,
          `${E.VC_Cross} **Permessi negati:**`,
          `  ${E.VC_Info} **Rimozioni:** ${deniedDiff.removals}`,
          `  ${E.VC_Info} **Aggiunte:** ${deniedDiff.additions}`,
          `${E.VC_Verified} **Permessi concessi:**`,
          `  ${E.VC_Info} **Rimozioni:** ${grantedDiff.removals}`,
          `  ${E.VC_Info} **Aggiunte:** ${grantedDiff.additions}`,
          "",
          `**${E.VC_tools} Informazioni aggiuntive**`,
          `${E.VC_id} **ID:** \`${source.id}\``,
          `${E.VC_Channel} **Tipo:** ${overwriteTypeLabel(source)}`,
        );
        lines.push(...buildAuditExtraLines(audit?.entry, ["allow", "deny", "type", "id"]));
      }

      if (canSendLogs) {
        const embed = new EmbedBuilder()
          .setColor(kind === "create" ? "#57F287" : kind === "delete" ? "#ED4245" : "#F59E0B")
          .setTitle(kind === "create" ? `${E.VC_Channel} Channel Overwrite Create` : kind === "delete" ? `${E.VC_Channel} Channel Overwrite Delete` : `${E.VC_Channel} Channel Overwrite Update`)
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => { });
      }

      const beforeAllow = kind === "create" ? 0n : BigInt(diff.before?.allow?.bitfield || 0n);
      const afterAllow = kind === "delete" ? 0n : BigInt(diff.after?.allow?.bitfield || 0n);
      await antiNukeHandleChannelOverwrite({ guild: guild, channel: newChannel, overwrite: source, beforeAllow, afterAllow, executorId })
    } catch (error) {
      global.logger?.error?.("[channelUpdate] overwrite log failed:", error);
    }
  }
}

export = {
  name: "channelUpdate",
  async execute(oldChannel?, newChannel?, client?) {
    const guildId = newChannel?.guildId || oldChannel?.guildId;
    if (!guildId) return;
    if (!isViniliFullFeatureGuild(guildId)) return;

    try {
      const { handleStanzaChannelUpdate } = require("../../Voice/services/stanzaVoiceRoomsService") as typeof import("../../Voice/services/stanzaVoiceRoomsService");
      await handleStanzaChannelUpdate(oldChannel, newChannel);
    } catch (error) {
      global.logger?.warn?.("[channelUpdate] stanza name enforce:", error?.message || error);
    }

    try {
      await sendChannelUpdateLog(oldChannel, newChannel);
    } catch (error) {
      global.logger?.error?.("[channelUpdate] channel log failed:", error);
    }
    try {
      await sendOverwriteLogs(oldChannel, newChannel);
    } catch (error) {
      global.logger?.error?.("[channelUpdate] overwrite logs failed:", error);
    }

    const parentChanged = oldChannel?.parentId !== newChannel?.parentId;
    const positionChanged = oldChannel?.rawPosition !== newChannel?.rawPosition;
    const nameChanged = oldChannel?.name !== newChannel?.name;
    if (!parentChanged && !positionChanged && !nameChanged) return;

    await upsertChannelSnapshot(newChannel || oldChannel).catch(() => { });
    if (client) {
      const channelId = String(newChannel?.id || oldChannel?.id || "");
      const botRenamed = nameChanged && isCategoryNumberingBotRename(channelId);
      if (!botRenamed) {
        queueCategoryRenumber(client, guildId);
      }
      queueIdsCatalogSync(client, guildId, "channelUpdate");
    }
  },
};