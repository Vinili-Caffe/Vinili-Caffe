const {
  getJoinRaidConfigSnapshot,
  setJoinRaidConfigSnapshot,
  JOIN_RAID_CONFIG,
} = require("./joinRaidConfig") as typeof import("./joinRaidConfig");
const {
  withGuildLock,
  getGuildState,
  loadGuildState,
  scheduleStateSave,
  pruneState,
  nowMs,
  makeJoinRaidCaseCode,
  clearGuildState,
  CLEARED_GUILDS,
  RAID_REPORT_TIMERS,
  LOAD_SUCCEEDED_GUILDS,
  isDbReady,
  LOW_RISK_FLAG_LOG_COOLDOWN,
  LOW_RISK_FLAG_LOG_COOLDOWN_MS,
} = require("./joinRaidState") as typeof import("./joinRaidState");
const {
  usernameSkeleton,
  getFlagReasons,
  matchJoinRaidAccountType,
  isHighRiskJoinRaidReasons,
} = require("./joinRaidDetect") as typeof import("./joinRaidDetect");
const {
  buildInitialFlagRows,
  scheduleJoinRaidReport,
  doFinalizeJoinRaidReportLocked,
  sendJoinRaidLog,
  warnRaidRoles,
} = require("./joinRaidReport") as typeof import("./joinRaidReport");
const {
  restoreTempBans,
  applyPunishment,
} = require("./joinRaidPunish") as typeof import("./joinRaidPunish");
const { isSecurityProfileImmune, hasAdminsProfileCapability } = require("../../Security/services/securityProfilesService") as typeof import("../../Security/services/securityProfilesService");
const { CORE_EXEMPT_USER_IDS } = require("./joinGateExemptUtils") as typeof import("./joinGateExemptUtils");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function formatRaidHours(ms?) {
  const hours = Number(ms || 0) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return "0";
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

async function processJoinRaidForMember(member?, options: Record<string, any> = {}) {
  const joinGateFeedOnly = Boolean(options?.joinGateFeedOnly);
  if (!JOIN_RAID_CONFIG.enabled) return { blocked: false };
  if (!member?.guild || !member?.user) return { blocked: false };
  const guildKey = String(member.guild.id || "");
  if (CLEARED_GUILDS.has(guildKey)) return { blocked: false };
  if (member.user?.bot) return { blocked: false };
  const userId = String(member.id || "");
  if (CORE_EXEMPT_USER_IDS.has(userId)) return { blocked: false };
  if (String(member.guild.ownerId || "") === userId) return { blocked: false };
  if (isSecurityProfileImmune(String(member.guild?.id || ""), userId)) {
    return { blocked: false };
  }
  const memberForImmunity =
    (await getGuildMemberCached(member.guild, userId, { ttlMs: 15_000 }).catch(
      () => null,
    )) || member;
  if (hasAdminsProfileCapability(memberForImmunity, "fullImmunity")) {
    return { blocked: false };
  }

  await loadGuildState(member.guild.id);
  await restoreTempBans(member.guild);
  return withGuildLock(member.guild.id, async () => {
    const at = nowMs();
    const state = getGuildState(member.guild.id);
    const staleCooldownKeys = [];
    for (const [key, ts] of LOW_RISK_FLAG_LOG_COOLDOWN.entries()) {
      if (Number(ts || 0) + LOW_RISK_FLAG_LOG_COOLDOWN_MS < at)
        staleCooldownKeys.push(key);
    }
    for (const key of staleCooldownKeys) {
      LOW_RISK_FLAG_LOG_COOLDOWN.delete(key);
    }
    pruneState(state, at);
    if (
      Number(state.raidUntil || 0) > 0 &&
      Number(state.raidUntil || 0) <= at
    ) {
      await doFinalizeJoinRaidReportLocked(member.guild, "elapsed");
      pruneState(state, at);
    }

    const sample = {
      ts: at,
      userId: String(member.id),
      createdAt: new Date(member.user.createdAt).getTime(),
      skeleton: usernameSkeleton(
        member.user.globalName || member.displayName || member.user.username,
      ),
    };

    const reasons = await getFlagReasons(state, member, at);
    state.samples.push(sample);

    const highRisk = isHighRiskJoinRaidReasons(reasons);
    const qualifiesForTrigger = matchJoinRaidAccountType(member, reasons);
    if (qualifiesForTrigger) {
      state.flagged.push({
        ts: at,
        userId: String(member.id),
        reasons: reasons.map((x?) => x.key),
      });
    }
    pruneState(state, at);
    scheduleStateSave(member.guild.id);

    const flaggedCount = state.flagged.length;
    const uniqueFlaggedUsers = new Set(
      state.flagged.map((x?) => String(x?.userId || "")).filter(Boolean),
    ).size;
    const triggerCountNow =
      String(JOIN_RAID_CONFIG.triggerType || "unique") === "events"
        ? flaggedCount
        : uniqueFlaggedUsers;
    const wasActive = Number(state.raidUntil || 0) > at;
    if (!wasActive && triggerCountNow >= JOIN_RAID_CONFIG.triggerCount) {
      state.raidUntil = at + JOIN_RAID_CONFIG.raidDurationMs;
      state.raidStartedAt = at;
      state.raidCaseCode = makeJoinRaidCaseCode();
      state.raidCaughtUserIds = [];
      state.raidInitialFlaggedUserIds = Array.from(
        new Set(
          state.flagged.map((x?) => String(x?.userId || "")).filter(Boolean),
        ),
      ).slice(-8);
      const untilTs = Math.floor(state.raidUntil / 1000);
      const initialFlags = buildInitialFlagRows(member.guild, state, 8);
      const actionVerb =
        JOIN_RAID_CONFIG.triggerAction === "ban"
          ? "banned"
          : JOIN_RAID_CONFIG.triggerAction === "kick"
            ? "kicked"
            : JOIN_RAID_CONFIG.triggerAction === "timeout"
              ? "timed out"
              : JOIN_RAID_CONFIG.triggerAction === "quarantine"
                ? "quarantined"
                : "logged";
      await warnRaidRoles(member.guild, [
        `${E.VC_Alert} **Join Raid triggered: **${triggerCountNow}** flagged ${String(JOIN_RAID_CONFIG.triggerType || "unique") === "events"
          ? "events"
          : "users"
        } in the last **${formatRaidHours(
          JOIN_RAID_CONFIG.triggerWindowMs,
        )}h**.**`,
        `${E.VC_Alert} **Raid protection active until <t:${untilTs}:F>.**`,
      ]);
      await sendJoinRaidLog(
        member.guild,
        `${E.VC_Alert} **Join Raid Trigger!**`,
        [
          `${E.VC_Alert} **BotGuard has identified a weird join pattern.**`,
          `${E.VC_Alert} **Flagged accounts joining for the next **${Math.round(JOIN_RAID_CONFIG.raidDurationMs / 60_000)}m** will be **${actionVerb}**.**`,
          `${E.VC_Alert} **A full report will be posted once the duration ends.**`,
          "",
          `${E.VC_Alert} **Initial Flags:**`,
          ...(initialFlags.length ? initialFlags : ["`No record found.`"]),
          "",
          `${E.VC_Alert} **Code:** \`${state.raidCaseCode}\``,
        ],
        "#ED4245",
      );
      scheduleJoinRaidReport(member.guild);
      scheduleStateSave(member.guild.id);
    }

    const active = Number(state.raidUntil || 0) > at;
    const reasonKeys = new Set(reasons.map((x?) => String(x?.key || "")));
    const strongEvidence =
      reasonKeys.has("id_flag") ||
      (reasonKeys.has("age_flag") && reasonKeys.has("no_pfp"));
    const punishableDuringRaid =
      JOIN_RAID_CONFIG.punishOnActiveRaid &&
      reasons.length > 0 &&
      matchJoinRaidAccountType(member, reasons) &&
      (highRisk ||
        strongEvidence ||
        String(JOIN_RAID_CONFIG.accountType || "any") !== "id_flag");
    if (active && punishableDuringRaid) {
      if (joinGateFeedOnly) {
        state.raidCaughtUserIds.push(String(member.id));
        state.raidCaughtUserIds = Array.from(
          new Set(
            state.raidCaughtUserIds.map((x?) => String(x || "")).filter(Boolean),
          ),
        ).slice(-300);
        scheduleStateSave(member.guild.id);
        return { blocked: false, flagged: true, reasons };
      }
      const outcome = await applyPunishment(member, reasons);
      if (Boolean(outcome?.punished)) {
        state.raidCaughtUserIds.push(String(member.id));
        state.raidCaughtUserIds = Array.from(
          new Set(
            state.raidCaughtUserIds.map((x?) => String(x || "")).filter(Boolean),
          ),
        ).slice(-300);
        scheduleStateSave(member.guild.id);
      }
      return {
        blocked: true,
        punished: Boolean(outcome?.punished),
        action: outcome?.appliedAction || JOIN_RAID_CONFIG.triggerAction,
        reasons,
      };
    }
    if (active && reasons.length > 0) {
      const cooldownKey = `${member.guild.id}:${member.id}`;
      const lastSentAt = Number(LOW_RISK_FLAG_LOG_COOLDOWN.get(cooldownKey) || 0);
      if (at - lastSentAt >= LOW_RISK_FLAG_LOG_COOLDOWN_MS) {
        LOW_RISK_FLAG_LOG_COOLDOWN.set(cooldownKey, at);
        await sendJoinRaidLog(
          member.guild,
          `${E.VC_Alert} **Join Raid flagged account**`,
          [
            `${E.member_role_icon} **Member:** ${member.user} [\`${member.id}\`]`,
            `${E.VC_reason} **Reasons:** ${reasons.map((x?) => x.label).join(", ") || "N/A"}`,
            `${E.VC_BanHammer} **Action:** \`log\``,
          ],
          "#F59E0B",
        );
      }
    }
    return { blocked: false, flagged: reasons.length > 0, reasons };
  });
}

async function activateJoinRaidWindow(
  guild?,
  reason = "Security escalation",
  minDurationMs = 0,
) {
  if (!guild?.id) return { ok: false, reason: "missing_guild" };
  await loadGuildState(guild.id);
  return withGuildLock(guild.id, async () => {
    const at = nowMs();
    const state = getGuildState(guild.id);
    pruneState(state, at);
    const currentUntil = Number(state.raidUntil || 0);
    const requestedDuration = Math.max(
      Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
      Number(minDurationMs || 0),
    );
    const safeDuration = Math.max(60_000, requestedDuration);
    const targetUntil = at + safeDuration;
    const wasActive = currentUntil > at;
    const changed = !wasActive || targetUntil > currentUntil;
    if (!changed) {
      return { ok: true, activated: false, raidUntil: currentUntil };
    }
    state.raidUntil = Math.max(currentUntil, targetUntil);
    if (!wasActive) {
      state.raidStartedAt = at;
      state.raidCaseCode = makeJoinRaidCaseCode();
      state.raidCaughtUserIds = [];
      state.raidInitialFlaggedUserIds = [];
    }
    scheduleStateSave(guild.id);
    const untilTs = Math.floor(state.raidUntil / 1000);
    if (!wasActive) {
      await warnRaidRoles(guild, [
        `${E.VC_Alert} **Join Raid attivato da escalation sicurezza.**`,
        `${E.VC_Alert} **Protezione raid attiva fino a <t:${untilTs}:F>.**`,
      ]);
    }
    await sendJoinRaidLog(
      guild,
      `${E.VC_Alert} **Join Raid escalation attivata**`,
      [
        `${E.VC_reason} **Reason:** ${String(reason || "Security escalation")}`,
        `${E.VC_reason} **Code:** \`${state.raidCaseCode || "N/A"}\``,
        `${E.VC_Clock} **Raid Duration:** ${Math.round(
          safeDuration / 60_000,
        )} minutes`,
        `${E.VC_Clock} **Raid Until:** <t:${untilTs}:F>`,
      ],
      "#ED4245",
    );
    scheduleJoinRaidReport(guild);
    try {
      const { invalidateSecurityLockCache } = require("../../Security/services/securityOrchestratorService") as typeof import("../../Security/services/securityOrchestratorService");
      invalidateSecurityLockCache(guild.id);
    } catch (_) {}
    return { ok: true, activated: !wasActive, raidUntil: state.raidUntil };
  });
}

async function registerJoinRaidSecuritySignal(
  member?,
  options: Record<string, any> = {},
) {
  if (!member?.guild?.id || !member?.id)
    return { ok: false, reason: "missing_member" };
  if (!JOIN_RAID_CONFIG.enabled) return { ok: true, raid: { activated: false } };
  const reason = String(options?.reason || "Join Gate / security signal");
  const explicitMs = Math.max(0, Number(options?.minRaidDurationMs || 0));
  const raidBoostMinutes = Math.max(0, Math.floor(Number(options?.raidBoost || 0)));
  const minMs = explicitMs + raidBoostMinutes * 60_000;
  const raid = await activateJoinRaidWindow(member.guild, reason, minMs || 0);
  if (options?.enableAntiNuke && member.guild) {
    try {
      const { enableAntiNukePanic } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
      await enableAntiNukePanic(
        member.guild,
        reason,
        Number(options.antiNukeHeat || 0),
        {
          force: Boolean(options.antiNukeForce),
        },
      );
    } catch (_) {}
  }
  if (options?.enableAutoMod && member.guild?.id) {
    try {
      const { triggerAutoModPanicExternal } = require("./automodService") as typeof import("./automodService");
      triggerAutoModPanicExternal(
        String(member.guild.id),
        String(member.id || "external"),
        {
          activityBoost: Number(options.autoModActivityBoost || 0),
          dbBoost: Number(options.autoModDbBoost || 0),
          raidBoost: Number(options.autoModRaidBoost || 0),
        },
      );
    } catch (_) {}
  }
  try {
    const { invalidateSecurityLockCache } = require("../../Security/services/securityOrchestratorService") as typeof import("../../Security/services/securityOrchestratorService");
    invalidateSecurityLockCache(member.guild.id);
  } catch (_) {}
  return { ok: true, raid };
}

async function getJoinRaidStatusSnapshot(guildId?) {
  const key = String(guildId || "");
  if (!key) return null;
  await loadGuildState(key);
  const at = nowMs();
  const state = getGuildState(key);
  pruneState(state, at);
  return {
    enabled: Boolean(JOIN_RAID_CONFIG.enabled),
    lockCommands: Boolean(JOIN_RAID_CONFIG.lockCommands),
    raidActive: Number(state.raidUntil || 0) > at,
    raidUntil: Number(state.raidUntil || 0),
    raidRemainingMs: Math.max(0, Number(state.raidUntil || 0) - at),
    flaggedRecent: Array.isArray(state.flagged) ? state.flagged.length : 0,
    uniqueFlaggedRecent: new Set(
      (Array.isArray(state.flagged) ? state.flagged : [])
        .map((row?) => String(row?.userId || "").trim())
        .filter(Boolean),
    ).size,
    samplesRecent: Array.isArray(state.samples) ? state.samples.length : 0,
    tempBans: Array.isArray(state.tempBans) ? state.tempBans.length : 0,
    raidCaseCode: String(state.raidCaseCode || ""),
    raidCaughtCount: new Set(
      (Array.isArray(state.raidCaughtUserIds) ? state.raidCaughtUserIds : [])
        .map((x?) => String(x || ""))
        .filter(Boolean),
    ).size,
    config: {
      enabled: Boolean(JOIN_RAID_CONFIG.enabled),
      lockCommands: Boolean(JOIN_RAID_CONFIG.lockCommands),
      triggerAction: JOIN_RAID_CONFIG.triggerAction,
      triggerType: JOIN_RAID_CONFIG.triggerType,
      accountType: JOIN_RAID_CONFIG.accountType,
      punishOnActiveRaid: Boolean(JOIN_RAID_CONFIG.punishOnActiveRaid),
      triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
      triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
      raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
      warnedRoleIds: [
        ...new Set(
          (JOIN_RAID_CONFIG.warnedRoleIds || []).map(String).filter(Boolean),
        ),
      ],
      idFlag: {
        enabled: Boolean(JOIN_RAID_CONFIG.idFlag.enabled),
        categorization: String(
          JOIN_RAID_CONFIG.idFlag.categorization || "adaptive",
        ),
        minimumMatches: Number(JOIN_RAID_CONFIG.idFlag.minimumMatches || 0),
      },
      noPfpFlag: { enabled: Boolean(JOIN_RAID_CONFIG.noPfpFlag.enabled) },
      ageFlag: {
        enabled: Boolean(JOIN_RAID_CONFIG.ageFlag.enabled),
        minimumAgeMs: Number(JOIN_RAID_CONFIG.ageFlag.minimumAgeMs || 0),
      },
    },
  };
}

async function stopJoinRaidWindowForGuild(guildId?) {
  const key = String(guildId || "").trim();
  if (!key || CLEARED_GUILDS.has(key)) return;
  await loadGuildState(key);
  await withGuildLock(key, async () => {
    const reportTimer = RAID_REPORT_TIMERS.get(key);
    if (reportTimer) {
      clearTimeout(reportTimer);
      RAID_REPORT_TIMERS.delete(key);
    }
    const state = getGuildState(key);
    state.raidUntil = 0;
    state.raidCaseCode = "";
    state.raidStartedAt = 0;
    state.raidInitialFlaggedUserIds = [];
    state.raidCaughtUserIds = [];
    if (LOAD_SUCCEEDED_GUILDS.has(key) && isDbReady()) {
      scheduleStateSave(key);
    }
  });
  try {
    const { invalidateSecurityLockCache } = require("../../Security/services/securityOrchestratorService") as typeof import("../../Security/services/securityOrchestratorService");
    invalidateSecurityLockCache(key);
  } catch (_) {}
}

export = {
  getJoinRaidConfigSnapshot,
  setJoinRaidConfigSnapshot,
  processJoinRaidForMember,
  registerJoinRaidSecuritySignal,
  restoreTempBans,
  getJoinRaidStatusSnapshot,
  clearGuildState,
  stopJoinRaidWindowForGuild,
};
