const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { JOIN_RAID_CONFIG } = require("./joinRaidConfig") as typeof import("./joinRaidConfig");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  getGuildState,
  loadGuildState,
  scheduleStateSave,
  pruneState,
  nowMs,
  TEMP_BAN_TIMERS,
  LAST_RESTORE_AT,
  RESTORE_COOLDOWN_MS,
} = require("./joinRaidState") as typeof import("./joinRaidState");
const { sendJoinRaidLog, scheduleJoinRaidReport } = require("./joinRaidReport") as typeof import("./joinRaidReport");
const { createModCase, getModConfig, logModCase } = require("../utils/moderation") as typeof import("../utils/moderation");

const ARROW = E.VC_right_arrow;

async function sendPunishDm(member?, action?, reasons?) {
  const readableAction =
    action === "ban"
      ? "banned"
      : action === "kick"
        ? "kicked"
        : action === "timeout"
          ? "timed out"
          : "flagged";
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(
      `${E.VC_Alert} **You have been ${readableAction} in ${member.guild.name}!**`,
    )
    .setDescription(
      [
        `${E.VC_reason} **Member:** ${member.user}[\`${member.user.id}\`]`,
        `${E.VC_reason} **Motivo:** Protezione raid attivata.`,
        `${E.VC_Alert} **Flag:** ${reasons.map((x?) => x.label).join(", ") || "N/A"}`,
      ].join("\n"),
    );
  try {
    const dmChannel =
      member.user.dmChannel || (await member.user.createDM().catch(() => null));
    if (!dmChannel) return false;
    await dmChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}

function joinRaidBanShortToken(guildId?, userId?) {
  return `[jr:${String(guildId || "").trim()}:${String(userId || "").trim()}:`;
}

function makeJoinRaidBanMarker(guildId?, userId?, unbanAt?) {
  return `[JR:${String(guildId || "")}:${String(userId || "")}:${Number(unbanAt || 0)}]`;
}

function buildJoinRaidBanReason(marker = "", guildId = "", userId = "") {
  const head =
    guildId && userId ? `${joinRaidBanShortToken(guildId, userId)} ` : "";
  const suffix = String(marker || "").trim();
  return suffix
    ? `${head}${E.VC_Alert} **Join Raid: flagged during raid ${suffix}**`
    : `${head}${E.VC_Alert} **Join Raid: flagged during raid**`;
}

async function shouldUnbanJoinRaidBan(guild?, userId?, marker = "") {
  if (!guild?.id || !userId) return false;
  const ban = await guild.bans.fetch(String(userId)).catch(() => null);
  if (!ban) return false;
  const reason = String(ban?.reason || "").toLowerCase();
  const short = joinRaidBanShortToken(guild.id, userId);
  if (reason.includes(short)) return true;
  const token = String(marker || "").trim().toLowerCase();
  if (token) {
    if (reason.includes(token)) return true;
    const m = token.match(/\[jr:([^:]+):([^:]+):/i);
    if (m) return reason.includes(joinRaidBanShortToken(m[1], m[2]));
  }
  if (!reason) return false;
  return reason.includes("join raid:");
}

async function scheduleTempUnban(guild?, userId?, reason?, marker = "") {
  const key = `${guild.id}:${userId}`;
  const old = TEMP_BAN_TIMERS.get(key);
  if (old) clearTimeout(old);
  const state = getGuildState(guild.id);
  const unbanAt = nowMs() + JOIN_RAID_CONFIG.raidDurationMs;
  const effectiveMarker =
    String(marker || "").trim() ||
    makeJoinRaidBanMarker(guild.id, userId, unbanAt);
  state.tempBans = (state.tempBans || []).filter(
    (x?) => String(x?.userId || "") !== String(userId),
  );
  state.tempBans.push({
    userId: String(userId),
    unbanAt,
    marker: effectiveMarker,
  });
  scheduleStateSave(guild.id);
  const timer = setTimeout(async () => {
    TEMP_BAN_TIMERS.delete(key);
    const shouldUnban = await shouldUnbanJoinRaidBan(
      guild,
      userId,
      effectiveMarker,
    );
    if (shouldUnban) {
      await guild.members.unban(userId, reason).catch(() => {});
    }
    const current = getGuildState(guild.id);
    current.tempBans = (current.tempBans || []).filter(
      (x?) => String(x?.userId || "") !== String(userId),
    );
    scheduleStateSave(guild.id);
  }, JOIN_RAID_CONFIG.raidDurationMs);
  if (typeof timer.unref === "function") timer.unref();
  TEMP_BAN_TIMERS.set(key, timer);
}

async function restoreTempBans(guild?, options: Record<string, any> = {}) {
  if (!guild?.id) return;
  const force = Boolean(options?.force);
  const at = nowMs();
  const guildId = String(guild.id);
  const lastAt = Number(LAST_RESTORE_AT.get(guildId) || 0);
  if (!force && at - lastAt < RESTORE_COOLDOWN_MS) return;
  LAST_RESTORE_AT.set(guildId, at);

  await loadGuildState(guild.id);
  const state = getGuildState(guild.id);
  const allTempBans = Array.isArray(state.tempBans) ? [...state.tempBans] : [];
  const expiredRows = allTempBans.filter(
    (row?) =>
      String(row?.userId || "").trim().length > 0 &&
      Number(row?.unbanAt || 0) > 0 &&
      Number(row?.unbanAt || 0) <= at,
  );
  if (expiredRows.length) {
    for (const row of expiredRows) {
      const userId = String(row?.userId || "").trim();
      if (!userId) continue;
      const shouldUnban = await shouldUnbanJoinRaidBan(
        guild,
        userId,
        String(row?.marker || ""),
      );
      if (shouldUnban) {
        await guild.members
          .unban(
            userId,
            `${E.VC_Alert} **Ban temporaneo Join Raid scaduto (ripristinato in ritardo)**`,
          )
          .catch(() => {});
      }
    }
  }

  const beforeTempBans = allTempBans.length;
  state.tempBans = allTempBans.filter(
    (row?) =>
      String(row?.userId || "").trim().length > 0 &&
      Number(row?.unbanAt || 0) > at,
  );
  pruneState(state, at);
  if (beforeTempBans !== state.tempBans.length || expiredRows.length) {
    scheduleStateSave(guild.id);
  }
  if (Number(state.raidUntil || 0) > at) {
    scheduleJoinRaidReport(guild);
  }
  if (!state.tempBans.length) return;

  for (const row of state.tempBans) {
    const userId = String(row?.userId || "");
    const unbanAt = Number(row?.unbanAt || 0);
    if (!userId || unbanAt <= at) continue;
    const key = `${guild.id}:${userId}`;
    if (TEMP_BAN_TIMERS.has(key)) continue;
    const timer = setTimeout(async () => {
      TEMP_BAN_TIMERS.delete(key);
      const shouldUnban = await shouldUnbanJoinRaidBan(
        guild,
        userId,
        String(row?.marker || ""),
      );
      if (shouldUnban) {
        await guild.members
          .unban(userId, "Join Raid temporary ban elapsed (restored)")
          .catch(() => {});
      }
      const current = getGuildState(guild.id);
      current.tempBans = (current.tempBans || []).filter(
        (x?) => String(x?.userId || "") !== String(userId),
      );
      scheduleStateSave(guild.id);
    }, Math.max(1_000, unbanAt - at));
    if (typeof timer.unref === "function") timer.unref();
    TEMP_BAN_TIMERS.set(key, timer);
  }
}

async function applyPunishment(member?, reasons?) {
  const configuredAction = String(
    JOIN_RAID_CONFIG.triggerAction || "log",
  ).toLowerCase();
  const action = ["ban", "kick", "timeout", "quarantine", "log"].includes(
    configuredAction,
  )
    ? configuredAction
    : "log";
  const guild = member.guild;
  const me = guild.members.me;
  const canBan =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) &&
    Boolean(member?.bannable);
  const canKick =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) &&
    Boolean(member?.kickable);
  const canTimeout =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) &&
    Boolean(member?.moderatable);
  const canQuarantine = true;
  let dmSent = false;
  if (action !== "log") {
    dmSent = await sendPunishDm(member, action, reasons);
  }

  let punished = false;
  let appliedAction = action;
  if (action === "ban") {
    if (canBan) {
      const marker = makeJoinRaidBanMarker(
        guild.id,
        member.id,
        nowMs() + JOIN_RAID_CONFIG.raidDurationMs,
      );
      punished = await guild.members
        .ban(member.id, {
          deleteMessageSeconds: 604800,
          reason: buildJoinRaidBanReason(marker, guild.id, member.id),
        })
        .then(() => true)
        .catch((err?) => {
          global.logger?.warn?.(
            "[joinRaid] applyPunishment ban failed:",
            guild.id,
            member.id,
            err?.message || err,
          );
          return false;
        });
      if (punished) {
        await scheduleTempUnban(
          guild,
          member.id,
          `${E.VC_Alert} **Ban temporaneo Join Raid scaduto**`,
          marker,
        );
      }
    }
  } else if (action === "kick") {
    if (canKick) {
      punished = await member
        .kick(
          `${E.VC_Alert} **Join Raid: flagged account during raid window**`,
        )
        .then(() => true)
        .catch((err?) => {
          global.logger?.warn?.(
            "[joinRaid] applyPunishment kick failed:",
            guild.id,
            member.id,
            err?.message || err,
          );
          return false;
        });
    }
  } else if (action === "timeout") {
    if (canTimeout) {
      const timeoutMs = Math.max(10 * 60_000, JOIN_RAID_CONFIG.raidDurationMs);
      punished = await member
        .timeout(
          timeoutMs,
          `${E.VC_Alert} **Join Raid: flagged account during raid window**`,
        )
        .then(() => true)
        .catch((err?) => {
          global.logger?.warn?.(
            "[joinRaid] applyPunishment timeout failed:",
            guild.id,
            member.id,
            err?.message || err,
          );
          return false;
        });
    }
  } else if (action === "quarantine") {
    const { quarantineExecutor } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
    const quarantine = await quarantineExecutor(
      guild,
      member.id,
      `${E.VC_Lock} Join Raid: suspicious join pattern`,
    ).catch(() => null);
    if (quarantine?.applied) {
      punished = true;
      appliedAction = "quarantine";
    }
  }

  if (!punished && action !== "log") {
    if (canTimeout) {
      const timeoutMs = Math.max(10 * 60_000, JOIN_RAID_CONFIG.raidDurationMs);
      punished = await member
        .timeout(
          timeoutMs,
          `${E.VC_Alert} **Join Raid: punitive fallback timeout**`,
        )
        .then(() => true)
        .catch((err?) => {
          global.logger?.warn?.(
            "[joinRaid] applyPunishment fallback timeout failed:",
            guild.id,
            member.id,
            err?.message || err,
          );
          return false;
        });
      if (punished) {
        appliedAction = "timeout";
      } else {
        appliedAction = "log";
      }
    } else {
      appliedAction = "log";
    }
  }

  if (punished && appliedAction !== "log" && guild?.client) {
    const caseReason = `${E.VC_Alert} **Join Raid: ${reasons.map((r?) => r.label || r).join(", ") || "flagged account during raid window"}**`;
    const caseDurationMs =
      appliedAction === "timeout" || appliedAction === "quarantine"
        ? Math.max(10 * 60_000, JOIN_RAID_CONFIG.raidDurationMs)
        : appliedAction === "ban"
          ? JOIN_RAID_CONFIG.raidDurationMs
          : null;
    const modAction =
      appliedAction === "timeout" || appliedAction === "quarantine"
        ? "MUTE"
        : appliedAction === "ban"
          ? "BAN"
          : "KICK";
    try {
      const config = await getModConfig(guild.id);
      const { doc, created } = await createModCase({
        guildId: guild.id,
        action: modAction,
        userId: member.id,
        modId: guild.client.user.id,
        reason: caseReason,
        durationMs: caseDurationMs,
        context: {},
        dedupe: { enabled: true, windowMs: 15_000, matchReason: true },
      });
      if (created) {
        await logModCase({ client: guild.client, guild, modCase: doc, config });
      }
    } catch (e) {
      global.logger?.warn?.(
        "[joinRaid] ModCase creation failed:",
        guild.id,
        member.id,
        e?.message || e,
      );
    }
  }

  if (!dmSent && punished && appliedAction !== "log") {
    dmSent = await sendPunishDm(member, appliedAction, reasons);
  }
  const actionWord =
    appliedAction === "ban"
      ? "banned"
      : appliedAction === "kick"
        ? "kicked"
        : appliedAction === "timeout"
          ? "timed out"
          : appliedAction === "quarantine"
            ? "quarantined"
            : "flagged";

  await sendJoinRaidLog(
    guild,
    `${E.VC_Alert} **${member.user.username} has been ${actionWord} by Join Raid!**`,
    [
      `${E.member_role_icon} **JoinRaid Filter:** ${reasons.map((x?) => x.label).join(", ") || "N/A"}`,
      `${E.VC_reason} **Member:** ${member.user} [\`${member.id}\`]`,
      `${E.VC_BanHammer} **Action:** ${appliedAction}${punished ? "" : " (fallback)"}`,
      `${E.VC_PinkQuestionMark} **Can Ban:** ${canBan ? "Yes" : "No"}`,
      `**Can Kick:** ${canKick ? "Yes" : "No"}`,
      `**Can Timeout:** ${canTimeout ? "Yes" : "No"}`,
      `**Can Quarantine:** ${canQuarantine ? "Yes" : "No"}`,
      appliedAction === "ban"
        ? `${ARROW} **Duration:** ${Math.round(
            JOIN_RAID_CONFIG.raidDurationMs / 60_000,
          )} minutes`
        : null,
      `${ARROW} **DM Sent:** ${dmSent ? "Yes" : "No"}`,
      `${ARROW} **Punished:** ${punished ? "Yes" : "No"}`,
    ],
    punished ? "#ED4245" : "#F59E0B",
  );
  return { punished, appliedAction };
}

export = {
  restoreTempBans,
  applyPunishment,
};
