/**
 * Punizione automatica al raggiungimento di N warn attivi.
 */
const { findActiveWarns } = require("../utils/modCaseStore") as typeof import("../utils/modCaseStore");
const { createModCase, logModCase, getModConfig, formatDuration } = require("../utils/moderation") as typeof import("../utils/moderation");
const { getTenantModerationExtras } = require("../../../MultiGuild/core/tenantModerationSettings") as typeof import("../../../MultiGuild/core/tenantModerationSettings");
const {
  executeGuildBan,
  resolveGuildMutedRoleId,
} = require("../utils/dynoModerationCommands/helpers") as typeof import("../utils/dynoModerationCommands/helpers");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");

function durationMsFromMinutes(minutes?) {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (!m) return null;
  return Math.min(m * 60 * 1000, 28 * 24 * 60 * 60 * 1000);
}

async function applyMute(member?, durationMs?, reason?) {
  const extras = await getTenantModerationExtras(member.guild.id).catch(() => null);
  const useTimeout = extras?.useDiscordTimeout !== false;
  try {
    const { captureMuteRoleSnapshot, applyActiveMuteMirror } = require("./mutedMirrorRoleService") as typeof import("./mutedMirrorRoleService");
    await captureMuteRoleSnapshot(member, { reason: `Auto-punish: ${reason}` }).catch(() => null);
    if (useTimeout && durationMs) {
      const ok = await member.timeout(durationMs, reason).then(() => true).catch(() => false);
      if (!ok) return false;
    } else {
      const mutedRoleId = resolveGuildMutedRoleId(member.guild);
      let ok = false;
      if (mutedRoleId) {
        ok = await member.roles.add(mutedRoleId, reason).then(() => true).catch(() => false);
      }
      if (!ok && durationMs) {
        ok = await member.timeout(durationMs, reason).then(() => true).catch(() => false);
      }
      if (!ok) return false;
    }
    const fresh = (await member.guild.members.fetch(member.id).catch(() => null)) || member;
    await applyActiveMuteMirror(fresh, { reason: `Auto-punish: ${reason}` }).catch(() => null);
    return true;
  } catch (err) {
    global.logger?.warn?.("[autoPunish] mute:", err?.message || err);
    return false;
  }
}

async function applyAutoPunishAfterWarn({ guild, member, userId, modId, client, channel }) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || member?.id || "").trim();
  if (!gid || !uid) return { applied: false };
  const extras = await getTenantModerationExtras(gid).catch(() => null);
  const rules = Array.isArray(extras?.autoPunishRules) ? extras.autoPunishRules : [];
  if (!rules.length) return { applied: false };

  const warns = await findActiveWarns(gid, uid, 100).catch(() => []);
  const warnCount = Array.isArray(warns) ? warns.length : 0;
  const rule = rules.find((r?) => Number(r.warnCount) === warnCount) || null;
  if (!rule) return { applied: false, warnCount };

  let targetMember = member || null;
  if (!targetMember && guild?.members) {
    targetMember = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
  }

  const reason = `Punizione automatica: ${warnCount} warn`;
  const durationMs = durationMsFromMinutes(rule.durationMinutes);
  const config = await getModConfig(gid).catch(() => null);
  let actionLabel = rule.action;
  let ok = false;
  let caseAction = null;
  let caseDuration = null;

  if (rule.action === "mute") {
    if (!targetMember) return { applied: false, warnCount, error: "member_missing" };
    ok = await applyMute(targetMember, durationMs, reason);
    caseAction = "MUTE";
    caseDuration = durationMs;
    actionLabel = "mute";
  } else if (rule.action === "kick") {
    if (!targetMember) return { applied: false, warnCount, error: "member_missing" };
    ok = await targetMember.kick(reason).then(() => true).catch(() => false);
    caseAction = "KICK";
  } else if (rule.action === "ban") {
    const deleteDays = extras?.keepMessagesOnBan === true ? 0 : Number(extras?.banDeleteDays);
    const deleteSeconds = Math.max(0, Math.min(7, Number.isFinite(deleteDays) ? deleteDays : 7)) * 86400;
    const banOut = await executeGuildBan(guild, uid, { reason, deleteMessageSeconds: deleteSeconds });
    ok = Boolean(banOut?.ok);
    caseAction = "BAN";
    caseDuration = durationMs;
  } else if (rule.action === "add_role") {
    if (!targetMember || !rule.roleId) return { applied: false, warnCount, error: "role_missing" };
    ok = await targetMember.roles.add(rule.roleId, reason).then(() => true).catch(() => false);
  } else if (rule.action === "remove_role") {
    if (!targetMember || !rule.roleId) return { applied: false, warnCount, error: "role_missing" };
    ok = await targetMember.roles.remove(rule.roleId, reason).then(() => true).catch(() => false);
  }

  if (!ok) return { applied: false, warnCount, action: rule.action, error: "action_failed" };

  let modCase = null;
  if (caseAction) {
    try {
      const created = await createModCase({
        guildId: gid,
        action: caseAction,
        userId: uid,
        modId: String(modId || client?.user?.id || "0"),
        reason,
        durationMs: caseDuration,
        context: { channelId: channel?.id || null, messageId: null },
        dedupe: { enabled: false },
      });
      modCase = created?.doc || null;
      if (created?.created && modCase) {
        await logModCase({ client, guild, modCase, config }).catch(() => null);
      }
    } catch (err) {
      global.logger?.warn?.("[autoPunish] case:", err?.message || err);
    }
  }

  if (channel?.send) {
    const durTxt = durationMs ? formatDuration(durationMs) : "permanente";
    const actionIt =
      rule.action === "mute"
        ? "silenziato"
        : rule.action === "kick"
          ? "espulso"
          : rule.action === "ban"
            ? "bannato"
            : rule.action === "add_role"
              ? "ruolo aggiunto"
              : "ruolo rimosso";
    await channel
      .send({
        content: `${E.VC_Alert} Punizione automatica: <@${uid}> ${actionIt} (${warnCount} warn${rule.action === "mute" || rule.action === "ban" ? `, ${durTxt}` : ""}).`,
      })
      .catch(() => null);
  }

  return { applied: true, warnCount, action: actionLabel, durationMs, caseId: modCase?.caseId || null };
}

export = { applyAutoPunishAfterWarn };
