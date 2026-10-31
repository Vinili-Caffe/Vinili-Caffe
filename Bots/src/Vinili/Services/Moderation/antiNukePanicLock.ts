/** Antinuke: blocco e sblocco di ruoli e canali durante il panico. */
const { PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");

const DANGEROUS_PERMS = [PermissionsBitField.Flags.Administrator, PermissionsBitField.Flags.ManageGuild, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageWebhooks, PermissionsBitField.Flags.BanMembers, PermissionsBitField.Flags.KickMembers,];
const LOCKDOWN_CHANNEL_PERMISSION_FLAGS = [["SendMessages", PermissionsBitField.Flags.SendMessages], ["AddReactions", PermissionsBitField.Flags.AddReactions], ["CreatePublicThreads", PermissionsBitField.Flags.CreatePublicThreads], ["CreatePrivateThreads", PermissionsBitField.Flags.CreatePrivateThreads], ["SendMessagesInThreads", PermissionsBitField.Flags.SendMessagesInThreads], ["Connect", PermissionsBitField.Flags.Connect], ["Speak", PermissionsBitField.Flags.Speak], ["Stream", PermissionsBitField.Flags.Stream], ["UseApplicationCommands", PermissionsBitField.Flags.UseApplicationCommands],].filter(([, bit]) => Boolean(bit));
const LOCKDOWN_EXTRA_ROLE_IDS = [IDs.roles?.Member, IDs.roles?.Staff,].map((id?) => String(id || "").trim()).filter(Boolean);
const ANTINUKE_PANIC_STATE = new Map();
const ANTINUKE_PANIC_SNAPSHOT_PATH = path.resolve(__dirname, "..", "..", "Data", "antiNukePanicSnapshot.json");
let antinukePanicLoaded = false;

function getDangerMask(flags = DANGEROUS_PERMS) {
  let mask = 0n;
  for (const flag of flags) mask |= BigInt(flag);
  return mask;
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, Math.max(0, Number(ms || 0)));
    timer.unref?.();
  });
}

function getLockdownDenyMask() {
  return LOCKDOWN_CHANNEL_PERMISSION_FLAGS.reduce(
    (mask, [, bit]) => mask | BigInt(bit || 0n),
    0n,
  );
}

function getPanicState(guildId?) {
  ensureAntiNukePanicLoaded();
  const now = Date.now();
  for (const [gid, state] of ANTINUKE_PANIC_STATE.entries()) {
    const idleFor = now - Number(state?.lastAt || 0);
    const active = Number(state?.activeUntil || 0) > now;
    const hasArtifacts = Number(state?.lockedRoles?.size || 0) > 0 || Number(state?.lockedChannels?.size || 0) > 0 || Number(state?.createdRoleIds?.size || 0) > 0 || Number(state?.createdChannelIds?.size || 0) > 0 || Number(state?.createdWebhookIds?.size || 0) > 0 || Number(state?.deletedRoleSnapshots?.size || 0) > 0 || Number(state?.deletedChannelSnapshots?.size || 0) > 0;
    if (!active && !hasArtifacts && idleFor > 6 * 60 * 60_000) {
      ANTINUKE_PANIC_STATE.delete(gid);
    }
  }
  const key = String(guildId || "");
  const existing = ANTINUKE_PANIC_STATE.get(key);
  if (existing) return existing;
  const initial = { heat: 0, panicTriggerHeat: 0, lastAt: Date.now(), panicStartedAt: 0, activeUntil: 0, lockedRoles: new Map(), lockedChannels: new Map(), createdRoleIds: new Set(), createdChannelIds: new Set(), createdWebhookIds: new Set(), deletedRoleSnapshots: new Map(), deletedChannelSnapshots: new Map(), unlockTimer: null, restoreRetryTimer: null, restoreRetryCount: 0, panicCaseId: "", panicReport: null, };
  ANTINUKE_PANIC_STATE.set(key, initial);
  return initial;
}

function persistAntiNukePanicSnapshotNow() {
  const now = Date.now();
  const payload: Record<string, any> = {};
  for (const [guildId, state] of ANTINUKE_PANIC_STATE.entries()) {
    const activeUntil = Number(state?.activeUntil || 0);
    const lastAt = Number(state?.lastAt || 0);
    if (activeUntil <= now && now - lastAt > 6 * 60 * 60_000) continue;
    payload[String(guildId)] = {
      heat: Number(state?.heat || 0),
      panicTriggerHeat: Number(state?.panicTriggerHeat || 0),
      lastAt: Number(state?.lastAt || now),
      panicStartedAt: Number(state?.panicStartedAt || 0),
      activeUntil,
      panicCaseId: String(state?.panicCaseId || ""),
    };
  }
  writeSnapshotWithMeta({
    filePath: ANTINUKE_PANIC_SNAPSHOT_PATH,
    walPath: `${ANTINUKE_PANIC_SNAPSHOT_PATH}.wal`,
    key: "vinyls_antinuke_panic",
    version: 1,
    payload,
  });
}

function ensureAntiNukePanicLoaded() {
  if (antinukePanicLoaded) return;
  antinukePanicLoaded = true;
  const raw = readSnapshotWithMeta({
    filePath: ANTINUKE_PANIC_SNAPSHOT_PATH,
    walPath: `${ANTINUKE_PANIC_SNAPSHOT_PATH}.wal`,
    key: "vinyls_antinuke_panic",
    version: 1,
    fallback: {},
  });
  const now = Date.now();
  for (const [guildId, row] of Object.entries(raw || {})) {
    const gid = String(guildId || "").trim();
    if (!gid) continue;
    const base = getPanicState(gid);
    base.heat = Math.max(0, Number(row?.heat || 0));
    base.panicTriggerHeat = Math.max(0, Number(row?.panicTriggerHeat || 0));
    base.lastAt = Number(row?.lastAt || now);
    base.panicStartedAt = Number(row?.panicStartedAt || 0);
    base.activeUntil = Number(row?.activeUntil || 0);
    base.panicCaseId = String(row?.panicCaseId || "");
  }
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_antinuke_panic", () => persistAntiNukePanicSnapshotNow());
}

function createPanicCaseId() {
  const base = Date.now().toString(36).slice(-6);
  const rand = Math.floor(Math.random() * 46656).toString(36).padStart(3, "0");
  return `${base}${rand}`;
}

function ensurePanicReport(state?) {
  if (!state.panicReport || typeof state.panicReport !== "object") {
    state.panicReport = {
      quarantinedUserIds: new Set(),
      roles: { deleted: 0, recovered: 0, edited: 0 },
      channels: { deleted: 0, recovered: 0, edited: 0 },
      categories: { deleted: 0, recovered: 0, edited: 0 },
      webhooks: { deleted: 0 },
      backup: {
        enabled: Boolean(ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled),
        loaded: false,
      },
      settings: {
        server: Boolean(ANTINUKE_CONFIG.panicMode.lockdown?.lockAllCommands),
        wick: Boolean(ANTINUKE_CONFIG.panicMode.lockdown?.lockModerationCommands),
      },
    };
  }
  if (!(state.panicReport.quarantinedUserIds instanceof Set)) {
    state.panicReport.quarantinedUserIds = new Set(
      Array.isArray(state.panicReport.quarantinedUserIds)
        ? state.panicReport.quarantinedUserIds
        : [],
    );
  }
  return state.panicReport;
}

function incrementPanicMetric(state?, bucket?, field?, value = 1) {
  const report = ensurePanicReport(state);
  if (!report?.[bucket] || typeof report[bucket] !== "object") return;
  const prev = Number(report[bucket][field] || 0);
  report[bucket][field] = Math.max(0, prev + Number(value || 0));
}

async function sendPanicModeDetailedReport(
  guild?,
  state?,
  {
    reason = "panic_end",
    backupSummary = null,
  } = {},
) {
  if (!guild || !state) return;
  const report = ensurePanicReport(state);
  if (backupSummary) {
    report.backup.loaded = Boolean(backupSummary.loaded);
    incrementPanicMetric(state, "roles", "deleted", Number(backupSummary.rolesDeleted || 0));
    incrementPanicMetric(state, "roles", "recovered", Number(backupSummary.rolesRecovered || 0));
    incrementPanicMetric(state, "channels", "deleted", Number(backupSummary.channelsDeleted || 0));
    incrementPanicMetric(state, "channels", "recovered", Number(backupSummary.channelsRecovered || 0));
    incrementPanicMetric(state, "categories", "deleted", Number(backupSummary.categoriesDeleted || 0));
    incrementPanicMetric(state, "categories", "recovered", Number(backupSummary.categoriesRecovered || 0));
    incrementPanicMetric(state, "webhooks", "deleted", Number(backupSummary.webhooksDeleted || 0));
  }

  const caseId = String(state.panicCaseId || createPanicCaseId());
  const quarantinedCount = Number(report.quarantinedUserIds?.size || 0);
  const backupEnabled = Boolean(ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled);
  const backupLabel = backupEnabled ? report.backup.loaded ? "<:success:1461731530333229226> Backup/restore completato." : "<:cancel:1461730653677551691> Backup abilitato ma senza modifiche applicate." : "<:cancel:1461730653677551691> Backup disabilitato.";

  const lines = [
    `<a:VC_Alert:1482706673176150077> **Panic Mode Triggered! [Anti Nuke]**`,
    `<:VC_reason:1478517122929004544> Attivato monitoraggio anomalo e lockdown.`,
    "",
    `<a:VC_Alert:1482706673176150077> **Panic Mode Report**`,
    `<a:VC_Alert:1482706673176150077> **CASE:**\`${caseId}\``,
    `<a:VC_reason:1478517122929004544> **Reason:** ${String(reason || "panic_end")}`,
    `<:member_role_icon:1330530086792728618> **Members Quarantined:** ${quarantinedCount}`,
    "",
    `<a:VC_Alert:1482706673176150077> **Backup System Report**`,
    `<:VC_reason:1478517122929004544>${backupLabel}`,
    "",
    `<:VC_Mention:1482526855289634997> **Roles**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.roles.deleted || 0)}`,
    `<:success:1461731530333229226> Recovered: ${Number(report.roles.recovered || 0)}`,
    `Edited: ${Number(report.roles.edited || 0)}`,
    `<:channeltext:1443247599752470551> **Channels**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.channels.deleted || 0)}`,
    `<:success:1461731530333229226> Recovered: ${Number(report.channels.recovered || 0)}`,
    `<:VC_right_arrow:1482459908245815296> Edited: ${Number(report.channels.edited || 0)}`,
    `<:VC_category:1478836096669581505> **Categories**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.categories.deleted || 0)}`,
    `<:success:1461731530333229226> Recovered: ${Number(report.categories.recovered || 0)}`,
    `<:VC_right_arrow:1482459908245815296> Edited: ${Number(report.categories.edited || 0)}`,
    `<:VC_webhooks:1478515450769047704> **Webhooks**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.webhooks.deleted || 0)}`,
    `<:VC_tools:1478862265305272364> **Settings**`,
    `<:VC_tools:1478862265305272364> Server: ${report.settings.server ? "ON" : "OFF"}`,
    `Bot: ${report.settings.wick ? "ON" : "OFF"}`,
  ];

  await sendAntiNukeLog(guild, "<a:VC_Alert:1482706673176150077> AntiNuke Panic Mode Report", lines, "#57F287");
}

async function lockDangerousRolesForPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles) return;
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  const allowlist = ANTINUKE_CONFIG.panicMode.lockdown.roleAllowlistIds;
  const dangerMask = getDangerMask(DANGEROUS_PERMS);
  for (const role of guild.roles.cache.values()) {
    if (!role || role.managed || role.id === guild.id) continue;
    if (allowlist?.size && allowlist.has(String(role.id))) continue;
    if (role.position >= me.roles.highest.position) continue;
    const current = BigInt(role.permissions?.bitfield || 0n);
    if ((current & dangerMask) === 0n) continue;
    if (!state.lockedRoles.has(role.id)) {
      state.lockedRoles.set(role.id, String(current));
    }
    const safeBits = current & ~dangerMask;
    if (safeBits !== current) {
      const ok = await role
        .setPermissions(
          safeBits,
          "<:VC_Lock:1482526739044368476> AntiNuke Panic: lock dangerous role permissions",
        )
        .then(() => true)
        .catch(() => false);
      if (ok) incrementPanicMetric(state, "roles", "edited", 1);
    }
  }
}

function scheduleAntiNukePanicUnlock(guild?, state?) {
  if (!guild?.id || !state) return;
  if (state.unlockTimer) clearTimeout(state.unlockTimer);
  const now = Date.now();
  const delay = Math.max(1_000, Number(state.activeUntil || 0) - now);
  state.unlockTimer = setTimeout(async () => {
    const current = getPanicState(guild.id);
    current.unlockTimer = null;
    if (Number(current.activeUntil || 0) > Date.now()) return;
    current.panicStartedAt = 0;
    current.panicTriggerHeat = 0;
    persistAntiNukePanicSnapshotNow();
    try {
      const { invalidateSecurityLockCache } = require("./securityOrchestratorService") as typeof import("./securityOrchestratorService");
      invalidateSecurityLockCache(guild.id);
    } catch (_) {}
    const roleResult = await unlockDangerousRolesAfterPanic(guild, current);
    const channelResult = await unlockGuildChannelsAfterPanic(guild, current);
    const backupSummary = await runAutoBackupSyncAfterPanic(guild, current);
    const restored = Boolean(roleResult?.completed) && Boolean(channelResult?.completed) && Number(current.lockedRoles?.size || 0) === 0 && Number(current.lockedChannels?.size || 0) === 0;
    if (!restored) {
      schedulePanicRestoreRetry(guild, current, "panic_end");
    }
    await sendPanicModeDetailedReport(guild, current, {
      reason: "panic_duration_ended",
      backupSummary,
    });
  }, delay);
  if (typeof state.unlockTimer?.unref === "function") {
    state.unlockTimer.unref();
  }
}

async function unlockDangerousRolesAfterPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.unlockDangerousRolesOnFinish) {
    state?.lockedRoles?.clear?.();
    return { completed: true };
  }
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { completed: false, reason: "missing_manage_roles" };
  }

  for (const [roleId, oldBitsStr] of state.lockedRoles.entries()) {
    const role = await getGuildRoleCached(guild, roleId, { ttlMs: 30_000 });
    if (!role) continue;
    if (role.position >= me.roles.highest.position) continue;
    const oldBits = BigInt(oldBitsStr || 0n);
    await role
      .setPermissions(oldBits, "<a:VC_Unlock:1482532082466029608> AntiNuke Panic: restore role permissions")
      .catch(() => { });
  }
  state.lockedRoles.clear();
  return { completed: true };
}

function buildLockdownRestorePayload(snapshot?) {
  const allowBits = BigInt(snapshot?.allowBits || 0n);
  const denyBits = BigInt(snapshot?.denyBits || 0n);
  const payload: Record<string, any> = {};
  for (const [name, bit] of LOCKDOWN_CHANNEL_PERMISSION_FLAGS) {
    const f = BigInt(bit || 0n);
    if ((allowBits & f) !== 0n) payload[(name as any)] = true;
    else if ((denyBits & f) !== 0n) payload[(name as any)] = false;
    else payload[(name as any)] = null;
  }
  return payload;
}

function getLockdownTargetIds(guild?) {
  const everyoneId = String(guild?.id || "").trim();
  return Array.from(
    new Set(
      [everyoneId, ...LOCKDOWN_EXTRA_ROLE_IDS]
        .map((id?) => String(id || "").trim())
        .filter(Boolean),
    ),
  );
}

async function lockGuildChannelsForPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown) return;
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return;
  const targetIds = getLockdownTargetIds(guild);
  if (!targetIds.length) return;
  const denyMask = getLockdownDenyMask();
  let ops = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel?.permissionOverwrites?.edit) continue;
    if (!state.lockedChannels.has(String(channel.id))) {
      state.lockedChannels.set(String(channel.id), {
        targets: {},
      });
    }
    const channelSnapshot = state.lockedChannels.get(String(channel.id));
    if (
      !channelSnapshot ||
      typeof channelSnapshot !== "object" ||
      Array.isArray(channelSnapshot)
    ) {
      continue;
    }
    if (
      !channelSnapshot.targets ||
      typeof channelSnapshot.targets !== "object" ||
      Array.isArray(channelSnapshot.targets)
    ) {
      channelSnapshot.targets = {};
    }

    for (const targetId of targetIds) {
      const current = channel.permissionOverwrites.cache.get(targetId) || null;
      const currentDeny = BigInt(current?.deny?.bitfield || 0n);
      if (!channelSnapshot.targets[targetId]) {
        channelSnapshot.targets[targetId] = {
          hadOverwrite: Boolean(current),
          allowBits: String(BigInt(current?.allow?.bitfield || 0n)),
          denyBits: String(BigInt(current?.deny?.bitfield || 0n)),
        };
      }
      if ((currentDeny & denyMask) === denyMask) continue;
      const edited = await channel.permissionOverwrites
        .edit(
          targetId,
          Object.fromEntries(
            LOCKDOWN_CHANNEL_PERMISSION_FLAGS.map(([name]) => [name, false]),
          ),
          { reason: "<:VC_Lock:1482526739044368476> AntiNuke Panic: global channel lockdown" },
        )
        .then(() => true)
        .catch(() => false);
      if (edited) {
        incrementPanicMetric(
          state,
          Number(channel.type) === 4 ? "categories" : "channels",
          "edited",
          1,
        );
        ops += 1;
        if (ops % 8 === 0) {
          await sleep(125);
        }
      }
    }
  }
}

async function unlockGuildChannelsAfterPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown) {
    state?.lockedChannels?.clear?.();
    return { completed: true };
  }
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    return { completed: false, reason: "missing_manage_channels" };
  }
  const targetIds = getLockdownTargetIds(guild);
  if (!targetIds.length) {
    return { completed: false, reason: "missing_everyone_id" };
  }

  let ops = 0;
  for (const [channelId, snapshot] of state.lockedChannels.entries()) {
    const channel = await getGuildChannelCached(guild, String(channelId), { ttlMs: 30_000, });
    if (!channel?.permissionOverwrites) continue;
    const targetsSnapshot = snapshot?.targets && typeof snapshot.targets === "object" ? snapshot.targets : { [String(guild.id || "")]: snapshot, };
    const restoreTargetIds = Array.from(new Set(Object.keys(targetsSnapshot || {}).concat(targetIds).filter(Boolean),),);
    for (const targetId of restoreTargetIds) {
      const targetSnapshot = targetsSnapshot?.[targetId];
      if (!targetSnapshot) continue;
      if (!targetSnapshot?.hadOverwrite) {
        await channel.permissionOverwrites
          .delete(targetId, "<a:VC_Unlock:1482532082466029608> AntiNuke Panic: restore channel overwrite")
          .catch(() => { });
        ops += 1;
        if (ops % 8 === 0) {
          await sleep(125);
        }
        continue;
      }
      await channel.permissionOverwrites
        .edit(
          targetId,
          buildLockdownRestorePayload(targetSnapshot),
          { reason: "<a:VC_Unlock:1482532082466029608> AntiNuke Panic: restore channel permissions" },
        )
        .catch(() => { });
      ops += 1;
      if (ops % 8 === 0) {
        await sleep(125);
      }
    }
  }
  state.lockedChannels.clear();
  return { completed: true };
}

function schedulePanicRestoreRetry(guild?, state?, reason = "retry") {
  if (!guild?.id || !state) return;
  if (state.restoreRetryTimer) return;
  const maxTries = 30;
  const delayMs = 60_000;
  state.restoreRetryTimer = setTimeout(async () => {
    state.restoreRetryTimer = null;
    if (Number(state.activeUntil || 0) > Date.now()) {
      schedulePanicRestoreRetry(guild, state, "still_active");
      return;
    }
    state.restoreRetryCount = Number(state.restoreRetryCount || 0) + 1;
    const roleResult = await unlockDangerousRolesAfterPanic(guild, state);
    const channelResult = await unlockGuildChannelsAfterPanic(guild, state);
    const done = Boolean(roleResult?.completed) && Boolean(channelResult?.completed) && Number(state.lockedRoles?.size || 0) === 0 && Number(state.lockedChannels?.size || 0) === 0;
    if (done) {
      state.restoreRetryCount = 0;
      return;
    }
    if (state.restoreRetryCount < maxTries) {
      schedulePanicRestoreRetry(guild, state, reason);
      return;
    }
    await sendAntiNukeLog(
      guild,
      "<a:VC_Alert:1482706673176150077> AntiNuke Panic Restore Pending",
      [
        `<:VC_reason:1478517122929004544> **Reason:** restore retry limit reached`,
        `<:VC_reason:1478517122929004544> **Locked Roles Pending:** ${Number(state.lockedRoles?.size || 0)}`,
        `<:VC_reason:1478517122929004544> **Locked Channels Pending:** ${Number(state.lockedChannels?.size || 0)}`,
      ],
      "#F59E0B",
    );
  }, delayMs);
  if (typeof state.restoreRetryTimer?.unref === "function") {
    state.restoreRetryTimer.unref();
  }
}

async function restoreDeletedRoleSnapshots(guild?, state?) {
  const pending = Array.from(state?.deletedRoleSnapshots?.values?.() || []);
  if (!pending.length) return { restored: 0, failed: 0 };
  const me = guild?.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { restored: 0, failed: pending.length, reason: "missing_manage_roles" };
  }
  let restored = 0;
  let failed = 0;
  pending.sort((a?: any, b?: any) => Number(a.position || 0) - Number(b.position || 0));
  for (const snap of pending) {
    const payload = {
      name: String((snap as any).name || "restored-role"),
      colors: { primaryColor: Number((snap as any).color || 0) },
      hoist: Boolean((snap as any).hoist),
      mentionable: Boolean((snap as any).mentionable),
      permissions: BigInt(String((snap as any).permissions || "0")),
      reason: "AntiNuke restore: deleted role snapshot",
    };
    const role = await guild.roles.create(payload).catch(() => null);
    if (!role) {
      failed += 1;
      continue;
    }
    const targetPosition = Math.max(1, Number((snap as any).position || 1));
    await role.setPosition(targetPosition, { reason: "<a:VC_Unlock:1482532082466029608> AntiNuke restore: role position" }).catch(() => { });
    restored += 1;
  }
  state.deletedRoleSnapshots?.clear?.();
  return { restored, failed };
}

async function restoreDeletedChannelSnapshots(guild?, state?) {
  const pending = Array.from(state?.deletedChannelSnapshots?.values?.() || []);
  if (!pending.length) return { restored: 0, failed: 0 };
  const me = guild?.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) {
    return { restored: 0, failed: pending.length, reason: "missing_manage_channels" };
  }
  let restored = 0;
  let failed = 0;
  for (const snap of pending) {
    const type = Number((snap as any).type ?? 0);
    if ([10, 11, 12, 14].includes(type)) {
      failed += 1;
      continue;
    }
    const parentId = String((snap as any).parentId || "").trim();
    const parentChannel = parentId ? await getGuildChannelCached(guild, parentId, { ttlMs: 30_000 }) : null;
    const overwritePayload = (Array.isArray((snap as any).permissionOverwrites) ? (snap as any).permissionOverwrites : []).map((ov?) => ({ id: String(ov?.id || ""), type: Number(ov?.type ?? 0), allow: BigInt(String(ov?.allow || "0")), deny: BigInt(String(ov?.deny || "0")), })).filter((ov?) => { if (!ov.id) return false; if (ov.type === OverwriteType.Role) { return ov.id === String(guild.id || "") || guild.roles.cache.has(ov.id); } if (ov.type === OverwriteType.Member) { return guild.members.cache.has(ov.id); } return false; }).filter((ov?) => ov.id);

    const createPayload: Record<string, any> = { name: String((snap as any).name || "restored-channel"), type, parent: parentChannel?.type === 4 ? String(parentChannel.id) : null, permissionOverwrites: overwritePayload, reason: "AntiNuke restore: deleted channel snapshot", };
    if (typeof (snap as any).nsfw === "boolean") createPayload.nsfw = (snap as any).nsfw;
    if (typeof (snap as any).topic === "string" && [0, 5, 15, 16].includes(type)) createPayload.topic = (snap as any).topic;
    if (Number.isFinite(Number((snap as any).rateLimitPerUser)) && [0, 5, 15, 16].includes(type)) {
      createPayload.rateLimitPerUser = Math.max(0, Number((snap as any).rateLimitPerUser || 0));
    }
    if (Number.isFinite(Number((snap as any).bitrate)) && [2, 13].includes(type)) {
      createPayload.bitrate = Number((snap as any).bitrate || 0);
    }
    if (Number.isFinite(Number((snap as any).userLimit)) && [2, 13].includes(type)) {
      createPayload.userLimit = Math.max(0, Number((snap as any).userLimit || 0));
    }
    if ((snap as any).rtcRegion && [2, 13].includes(type)) createPayload.rtcRegion = (snap as any).rtcRegion;
    if (Number.isFinite(Number((snap as any).videoQualityMode)) && [2, 13].includes(type)) {
      createPayload.videoQualityMode = Number((snap as any).videoQualityMode || 1);
    }
    if (Number.isFinite(Number((snap as any).defaultAutoArchiveDuration)) && [0, 5, 15, 16].includes(type)) {
      createPayload.defaultAutoArchiveDuration = Number((snap as any).defaultAutoArchiveDuration || 1440);
    }

    const restoredChannel = await guild.channels.create(createPayload).catch(() => null);
    if (!restoredChannel) {
      failed += 1;
      continue;
    }
    const position = Number((snap as any).position || 0);
    if (Number.isFinite(position) && position >= 0) {
      await restoredChannel.setPosition(position, { reason: "<a:VC_Unlock:1482532082466029608> AntiNuke restore: channel position" }).catch(() => { });
    }
    restored += 1;
  }
  state.deletedChannelSnapshots?.clear?.();
  return { restored, failed };
}

async function runAutoBackupSyncAfterPanic(guild?, state?) {
  const cfg = ANTINUKE_CONFIG.panicMode.autoBackupSync;
  if (!guild || !state) return;
  const me = guild.members?.me;
  const enabled = Boolean(cfg?.enabled);

  let channelsDeleted = 0;
  let categoriesDeleted = 0;
  let rolesDeleted = 0;
  let webhooksDeleted = 0;
  if (enabled && cfg.deleteNewChannels && me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    let isProtectedStage = () => false;
    try {
      ({ isProtectedStreamerStageChannelId: isProtectedStage } = require("../Community/streamerStageGuardService"));
    } catch {
      isProtectedStage = () => false;
    }
    for (const channelId of state.createdChannelIds) {
      if ((isProtectedStage as any)(channelId, guild.client)) {
        global.logger?.warn?.("[AntiNuke] skip delete protected streamer stage:", channelId);
        continue;
      }
      const channel = await getGuildChannelCached(guild, String(channelId), { ttlMs: 30_000 });
      if (!channel) continue;
      const deleted = await channel.delete("<a:VC_Unlock:1482532082466029608> AntiNuke panic cleanup: delete new channel").then(() => true).catch(() => false);
      if (deleted) {
        if (Number(channel.type) === 4) categoriesDeleted += 1;
        else channelsDeleted += 1;
      }
    }
  }

  if (enabled && cfg.deleteNewRoles && me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    for (const roleId of state.createdRoleIds) {
      const role = await getGuildRoleCached(guild, String(roleId), { ttlMs: 30_000 });
      if (!role) continue;
      if (role.managed) continue;
      if (role.position >= me.roles.highest.position) continue;
      const deleted = await role.delete("<a:VC_Unlock:1482532082466029608> AntiNuke panic cleanup: delete new role").then(() => true).catch(() => false);
      if (deleted) rolesDeleted += 1;
    }
  }

  if (enabled && cfg.deleteNewWebhooks && me?.permissions?.has(PermissionsBitField.Flags.ManageWebhooks)) {
    const webhooks = typeof guild.fetchWebhooks === "function"
      ? await guild.fetchWebhooks().catch(() => null)
      : null;
    for (const webhook of webhooks?.values?.() || []) {
      if (!state.createdWebhookIds.has(String(webhook.id))) continue;
      const deleted = await webhook.delete("<a:VC_Unlock:1482532082466029608> AntiNuke panic cleanup: delete new webhook").then(() => true).catch(() => false);
      if (deleted) webhooksDeleted += 1;
    }
  }

  state.createdRoleIds.clear();
  state.createdChannelIds.clear();
  state.createdWebhookIds.clear();

  const pendingCategorySnapshots = Array.from(state?.deletedChannelSnapshots?.values?.() || [],).filter((snap?: any) => Number(snap?.type) === 4).length;
  const restoredRoles = enabled && cfg.restoreDeletedRoles ? await restoreDeletedRoleSnapshots(guild, state) : { restored: 0, failed: 0 };
  const restoredChannels = enabled && cfg.restoreDeletedChannels ? await restoreDeletedChannelSnapshots(guild, state) : { restored: 0, failed: 0 };

  const recoveredCategories = pendingCategorySnapshots;
  const recoveredChannels = Math.max(0, Number(restoredChannels.restored || 0) - recoveredCategories,);

  if (!enabled) {
    state.deletedRoleSnapshots?.clear?.();
    state.deletedChannelSnapshots?.clear?.();
  }

  if (
    Number(restoredRoles.restored || 0) > 0 ||
    Number(restoredRoles.failed || 0) > 0 ||
    Number(restoredChannels.restored || 0) > 0 ||
    Number(restoredChannels.failed || 0) > 0
  ) {
    await sendAntiNukeLog(
      guild,
      "<a:VC_Alert:1482706673176150077> AntiNuke: Restore System",
      [
        `<:VC_reason:1478517122929004544> **Roles ripristinati:** ${Number(restoredRoles.restored || 0)}`,
        `<:VC_reason:1478517122929004544> **Ruoli falliti:** ${Number(restoredRoles.failed || 0)}`,
        `<:VC_reason:1478517122929004544> **Canali ripristinati:** ${Number(restoredChannels.restored || 0)}`,
        `<:VC_reason:1478517122929004544> **Canali falliti:** ${Number(restoredChannels.failed || 0)}`,
        `<:VC_reason:1478517122929004544> Per ripristino completo canali/ruoli usa **+backup** → **Carica backup**.`,
      ],
      Number(restoredRoles.failed || 0) > 0 || Number(restoredChannels.failed || 0) > 0
        ? "#F59E0B"
        : "#57F287",
    );
  }
  return {
    loaded: enabled,
    rolesDeleted,
    rolesRecovered: Number(restoredRoles.restored || 0),
    channelsDeleted,
    channelsRecovered: recoveredChannels,
    categoriesDeleted,
    categoriesRecovered: recoveredCategories,
    webhooksDeleted,
  };
}

export = { DANGEROUS_PERMS, getPanicState, persistAntiNukePanicSnapshotNow, createPanicCaseId, ensurePanicReport, sendPanicModeDetailedReport, lockDangerousRolesForPanic, scheduleAntiNukePanicUnlock, unlockDangerousRolesAfterPanic, lockGuildChannelsForPanic, unlockGuildChannelsAfterPanic, schedulePanicRestoreRetry, runAutoBackupSyncAfterPanic };
