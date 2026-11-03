const { AuditLogEvent, EmbedBuilder, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { queueCategoryRenumber, isCategoryNumberingBotRename, } = require("../Community/services/communityOpsService") as typeof import("../Community/services/communityOpsService");
const { queueIdsCatalogSync } = require("../Config/idsAutoSync") as typeof import("../Config/idsAutoSync");
const { upsertChannelSnapshot, } = require("../Community/utils/channelSnapshotUtils") as typeof import("../Community/utils/channelSnapshotUtils");
const { toDiscordTimestamp, channelDisplay, channelTypeLabel, formatAuditActor, permissionList, permissionDiff, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible } = require("../Moderation/utils/channelRolesLogUtils") as typeof import("../Moderation/utils/channelRolesLogUtils");
const { handleChannelOverwrite: antiNukeHandleChannelOverwrite } = require("../Security/services/antiNukeService") as typeof import("../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
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
    `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
    `<:VC_User:1482527453586002103> **Utente:** ${channelDisplay(newChannel)} \`${newChannel.id}\``,
    `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
    "",
    "**<:VC_Info:1482526956703580372> Cambiamenti**",
  ];

  if (nameChanged) {
    lines.push(
      `<:VC_Modifica:1478859646587633717> **Nome:** ${oldChannel?.name || "sconosciuto"} <a:VC_Arrow:1482706699365257397> ${newChannel?.name || "sconosciuto"}`,
    );
  }
  if (typeChanged) {
    lines.push(
      `<a:VC_Channel:1482534583944871996> **Type:** ${channelTypeLabel(oldChannel)} <a:VC_Arrow:1482706699365257397> ${channelTypeLabel(newChannel)}`,
    );
  }
  if (parentChanged) {
    const oldParent = oldChannel?.parent ? `${oldChannel.parent}` : "Nessuna";
    const newParent = newChannel?.parent ? `${newChannel.parent}` : "Nessuna";
    lines.push(`<:VC_Info:1482526956703580372> **Parent:** ${oldParent} <a:VC_Arrow:1482706699365257397> ${newParent}`);
  }
  if (rateLimitChanged) {
    const oldRate = Number(oldChannel?.rateLimitPerUser || 0) || "Nessuno";
    const newRate = Number(newChannel?.rateLimitPerUser || 0) || "Nessuno";
    lines.push(`<:VC_Info:1482526956703580372> **RPM utente:** ${oldRate} <a:VC_Arrow:1482706699365257397> ${newRate}`);
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
    .setTitle("<a:VC_Channel:1482534583944871996> Channel Update")
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
        `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
        `<a:VC_Channel:1482534583944871996> **Canale:** ${channelDisplay(newChannel)} \`${newChannel.id}\``,
        `<:VC_User:1482527453586002103> **Utente:** ${targetName(guild, source)} \`${source?.id || "sconosciuto"}\``,
        `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
      ];

      if (kind === "create") {
        lines.push(
          "**<:VC_tools:1478862265305272364> Impostazioni**",
          `<:VC_id:1478517313618575419> **ID:** \`${source.id}\``,
          `<a:VC_Channel:1482534583944871996> **Tipo:** ${overwriteTypeLabel(source)}`,
          `<:VC_Info:1482526956703580372> **Permessi concessi:** ${permissionList(source.allow.bitfield)}`,
          `<:VC_Info:1482526956703580372> **Permessi negati:** ${permissionList(source.deny.bitfield)}`,
        );
        lines.push(...buildAuditExtraLines(audit?.entry, ["allow", "deny", "type", "id"]));
      } else if (kind === "delete") {
        lines.push(
          "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
          `<:VC_id:1478517313618575419> **ID:** \`${source.id}\``,
          `<a:VC_Channel:1482534583944871996> **Tipo:** ${overwriteTypeLabel(source)}`,
        );
        lines.push(...buildAuditExtraLines(audit?.entry, ["type", "id"]));
      } else {
        const deniedDiff = permissionDiff(diff.before.deny.bitfield, diff.after.deny.bitfield,);
        const grantedDiff = permissionDiff(diff.before.allow.bitfield, diff.after.allow.bitfield,);
        lines.push(
          "**<:VC_tools:1478862265305272364> Cambiamenti**",
          `<a:VC_Cross:1482532424570376253> **Permessi negati:**`,
          `  <:VC_Info:1482526956703580372> **Rimozioni:** ${deniedDiff.removals}`,
          `  <:VC_Info:1482526956703580372> **Aggiunte:** ${deniedDiff.additions}`,
          `<a:VC_Verified:1482532479637127188> **Permessi concessi:**`,
          `  <:VC_Info:1482526956703580372> **Rimozioni:** ${grantedDiff.removals}`,
          `  <:VC_Info:1482526956703580372> **Aggiunte:** ${grantedDiff.additions}`,
          "",
          "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
          `<:VC_id:1478517313618575419> **ID:** \`${source.id}\``,
          `<a:VC_Channel:1482534583944871996> **Tipo:** ${overwriteTypeLabel(source)}`,
        );
        lines.push(...buildAuditExtraLines(audit?.entry, ["allow", "deny", "type", "id"]));
      }

      if (canSendLogs) {
        const embed = new EmbedBuilder()
          .setColor(kind === "create" ? "#57F287" : kind === "delete" ? "#ED4245" : "#F59E0B")
          .setTitle(kind === "create" ? "<a:VC_Channel:1482534583944871996> Channel Overwrite Create" : kind === "delete" ? "<a:VC_Channel:1482534583944871996> Channel Overwrite Delete" : "<a:VC_Channel:1482534583944871996> Channel Overwrite Update")
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