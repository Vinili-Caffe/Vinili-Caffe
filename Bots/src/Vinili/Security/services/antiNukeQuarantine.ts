/** Antinuke: quarantena di chi fa azioni pericolose (e ripristino dei ruoli). */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { isJoinGateSuspiciousAccount } = require("../../Moderation/services/joinGateSuspiciousService") as typeof import("../../Moderation/services/joinGateSuspiciousService");
const { getGuildMemberCached, getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { createModCase, getModConfig, logModCase } = require("../../Moderation/utils/moderation") as typeof import("../../Moderation/utils/moderation");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { UNKNOWN_EXECUTOR_ID, isWhitelistedExecutorAsync } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { getPanicState, ensurePanicReport } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");

const QUARANTINE_ROLE_TIMERS = new Map();
const QUARANTINE_ROLE_SNAPSHOTS = new Map();
/* rebootDurability1: quarantine role timers/snapshots → disk */
const ANTINUKE_QUARANTINE_SNAPSHOT_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "Data",
  "antiNukeQuarantineSnapshot.json",
);
let antinukeQuarantineFlushRegistered = false;
let antinukeQuarantineRestored = false;

function isAntiNukeScopeGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
    return isViniliFullFeatureGuild(guildId);
  } catch {
    return true;
  }
}

function hasStaffProtection(member?) {
  if (!member?.roles?.cache) return false;
  const protectedRoleIds = [IDs.roles.Founder].map((id?) => String(id || "").trim()).filter(Boolean);
  if (!protectedRoleIds.length) return false;
  return protectedRoleIds.some((roleId?) => member.roles.cache.has(roleId));
}

function isAntiNukePanicActive(guildId?) {
  if (!isAntiNukeScopeGuild(guildId)) return false;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.panicMode.enabled) return false;
  const state = getPanicState(guildId);
  return Number(state.activeUntil || 0) > Date.now();
}

function persistAntiNukeQuarantineSnapshotNow() {
  const now = Date.now();
  const payload: Record<string, any> = {};
  for (const [key, row] of QUARANTINE_ROLE_TIMERS.entries()) {
    const fireAt = Number(row?.fireAt || 0);
    if (!key || !Number.isFinite(fireAt) || fireAt <= now - 60_000) continue;
    const parts = String(key).split(":");
    const guildId = String(parts[0] || "").trim();
    const userId = String(parts[1] || "").trim();
    const roleId = String(parts[2] || "").trim();
    if (!guildId || !userId || !roleId) continue;
    const snapshot = Array.isArray(QUARANTINE_ROLE_SNAPSHOTS.get(key))
      ? QUARANTINE_ROLE_SNAPSHOTS.get(key).map(String).filter(Boolean)
      : [];
    payload[key] = { guildId, userId, roleId, fireAt, snapshot };
  }
  // Keep snapshots that still have a live timer row (already covered) — also
  // keep orphan snapshots only while a matching timer exists.
  writeSnapshotWithMeta({
    filePath: ANTINUKE_QUARANTINE_SNAPSHOT_PATH,
    walPath: `${ANTINUKE_QUARANTINE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_antinuke_quarantine",
    version: 1,
    payload,
  });
}

function ensureAntiNukeQuarantineFlushRegistered() {
  if (antinukeQuarantineFlushRegistered) return;
  antinukeQuarantineFlushRegistered = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_antinuke_quarantine", () => persistAntiNukeQuarantineSnapshotNow());
}

async function runQuarantineRoleRollback(guild?, userId?, roleId?, keyOverride = "") {
  const key =
    String(keyOverride || "").trim() ||
    `${String(guild?.id || "")}:${String(userId || "")}:${String(roleId || "")}`;
  QUARANTINE_ROLE_TIMERS.delete(key);
  try {
    const member = await getGuildMemberCached(guild, String(userId), { ttlMs: 30_000 });
    const snapshot = QUARANTINE_ROLE_SNAPSHOTS.get(key) || [];
    QUARANTINE_ROLE_SNAPSHOTS.delete(key);
    persistAntiNukeQuarantineSnapshotNow();
    if (!member) return;
    if (!member.roles.cache.has(String(roleId))) return;
    const me = guild?.members?.me || null;
    const highestPosition = Number(me?.roles?.highest?.position || 0);
    const restoreRoleIds = snapshot
      .map((id?) => String(id || "").trim())
      .filter(Boolean)
      .filter((id?) => id !== String(guild.id) && id !== String(roleId))
      .filter((id?) => {
        const role = guild.roles.cache.get(id);
        if (!role) return false;
        if (role.managed) return false;
        return Number(role.position || 0) < highestPosition;
      });
    const reasonRollback = "<:cancel:1461730653677551691> AntiNuke quarantine timeout elapsed";
    if (restoreRoleIds.length > 0) {
      await member.roles.set(restoreRoleIds, reasonRollback).catch(async () => {
        await member.roles.remove(String(roleId), reasonRollback).catch(() => { });
      });
    } else {
      await member.roles.remove(String(roleId), reasonRollback).catch(() => { });
    }
  } catch (err) {
    global.logger?.warn?.("[antiNuke] ", err?.message || err);
  }
}

function scheduleQuarantineRoleRollback(guild?, userId?, roleId?, durationMs?, fireAtMs = null) {
  const key = `${String(guild?.id || "")}:${String(userId || "")}:${String(roleId || "")}`;
  if (!guild?.id || !userId || !roleId) return;
  ensureAntiNukeQuarantineFlushRegistered();
  const old = QUARANTINE_ROLE_TIMERS.get(key);
  if (old?.timer) clearTimeout(old.timer);
  else if (old) clearTimeout(old);
  const fireAt = Number.isFinite(Number(fireAtMs))
    ? Number(fireAtMs)
    : Date.now() + Math.max(1_000, Number(durationMs || 0));
  const delay = Math.max(1_000, fireAt - Date.now());
  const timer = setTimeout(() => {
    void runQuarantineRoleRollback(guild, userId, roleId, key);
  }, delay);
  if (typeof timer.unref === "function") timer.unref();
  QUARANTINE_ROLE_TIMERS.set(key, { timer, fireAt });
  persistAntiNukeQuarantineSnapshotNow();
}

function restoreAntiNukeQuarantineTimersOnStartup(client?) {
  if (!client || antinukeQuarantineRestored) return { restored: 0, expired: 0 };
  antinukeQuarantineRestored = true;
  ensureAntiNukeQuarantineFlushRegistered();
  const raw = readSnapshotWithMeta({
    filePath: ANTINUKE_QUARANTINE_SNAPSHOT_PATH,
    walPath: `${ANTINUKE_QUARANTINE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_antinuke_quarantine",
    version: 1,
    fallback: {},
  });
  let restored = 0;
  let expired = 0;
  const now = Date.now();
  for (const [key, row] of Object.entries(raw || {})) {
    const guildId = String(row?.guildId || String(key).split(":")[0] || "").trim();
    const userId = String(row?.userId || String(key).split(":")[1] || "").trim();
    const roleId = String(row?.roleId || String(key).split(":")[2] || "").trim();
    const fireAt = Number(row?.fireAt || 0);
    if (!guildId || !userId || !roleId || !Number.isFinite(fireAt)) continue;
    const mapKey = `${guildId}:${userId}:${roleId}`;
    if (QUARANTINE_ROLE_TIMERS.has(mapKey)) continue;
    const snapshot = Array.isArray(row?.snapshot) ? row.snapshot.map(String).filter(Boolean) : [];
    if (snapshot.length) QUARANTINE_ROLE_SNAPSHOTS.set(mapKey, snapshot);

    const guild =
      client.guilds?.cache?.get(guildId) ||
      null;
    const runWithGuild = async () => {
      const g =
        guild ||
        (await client.guilds?.fetch?.(guildId).catch(() => null));
      if (!g) {
        QUARANTINE_ROLE_TIMERS.delete(mapKey);
        QUARANTINE_ROLE_SNAPSHOTS.delete(mapKey);
        persistAntiNukeQuarantineSnapshotNow();
        return;
      }
      await runQuarantineRoleRollback(g, userId, roleId, mapKey);
    };

    if (fireAt <= now) {
      expired += 1;
      void runWithGuild();
      continue;
    }

    if (!guild) {
      // Re-arm with a stub that fetches guild at fire time.
      const delay = Math.max(1_000, fireAt - now);
      const timer = setTimeout(() => {
        void runWithGuild();
      }, delay);
      timer.unref?.();
      QUARANTINE_ROLE_TIMERS.set(mapKey, { timer, fireAt });
      restored += 1;
      continue;
    }

    scheduleQuarantineRoleRollback(guild, userId, roleId, fireAt - now, fireAt);
    restored += 1;
  }
  persistAntiNukeQuarantineSnapshotNow();
  if (restored || expired) {
    global.logger?.info?.(
      `[antiNuke] quarantine restore: restored=${restored} expiredNow=${expired}`,
    );
  }
  return { restored, expired };
}

function quarantineOutcomeLabel(outcome?) {
  const suspiciousSuffix = outcome?.joinGateSuspicious ? " | <:VC_right_arrow:1482459908245815296> JoinGate suspicious: YES" : "";
  if (!outcome?.applied) return "<:cancel:1461730653677551691> Quarantine not applied";
  if (outcome.method === "ban") return `<:VC_Lock:1482526739044368476> Banned ${suspiciousSuffix}`;
  if (outcome.method === "already_role") {
    return `<:VC_Lock:1482526739044368476> Quarantine active ${suspiciousSuffix}`;
  }
  if (outcome.method === "role") return `<:VC_Lock:1482526739044368476> Quarantined via role ${suspiciousSuffix}`;
  if (outcome.method === "timeout") return `<:VC_Lock:1482526739044368476> Quarantined via timeout ${suspiciousSuffix}`;
  return `<:VC_Lock:1482526739044368476> Quarantined${suspiciousSuffix}`;
}

async function quarantineExecutor(guild?, executorId?, reason?) {
  if (!ANTINUKE_CONFIG.autoQuarantine.enabled) {
    return { applied: false, method: "disabled" };
  }
  const userId = String(executorId || "");
  if (userId === UNKNOWN_EXECUTOR_ID) {
    return { applied: false, method: "missing_executor_audit" };
  }
  if (!userId) return { applied: false, method: "missing_user" };
  if (ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds?.has?.(userId)) {
    return { applied: false, method: "whitelisted" };
  }
  const joinGateSuspicious = await isJoinGateSuspiciousAccount(guild?.id, userId).catch(() => false,);
  if (await isWhitelistedExecutorAsync(guild, userId)) {
    return { applied: false, method: "whitelisted" };
  }
  const member = await getGuildMemberCached(guild, userId, { ttlMs: 30_000 });
  if (!member) return { applied: false, method: "missing_member" };
  if (hasStaffProtection(member)) {
    return { applied: false, method: "staff_protected" };
  }
  const panicActive = isAntiNukePanicActive(guild.id);
  const panicState = getPanicState(guild.id);
  const thresholdH = Number(ANTINUKE_CONFIG.panicMode.thresholdHeat || 100);
  const heatForBan = Math.max(Number(panicState?.panicTriggerHeat || 0), Number(panicState?.heat || 0));
  const highConfidenceHeat = heatForBan >= thresholdH;
  if (
    panicActive &&
    highConfidenceHeat &&
    ANTINUKE_CONFIG.panicMode.lockdown.banAttackExecutor &&
    member?.bannable &&
    guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.BanMembers) &&
    String(guild?.ownerId || "") !== userId
  ) {
    const banReason = `<:VC_Lock:1482526739044368476> AntiNuke panic: ${String(reason || "malicious executor")}`;
    const banned = await guild.members.ban(userId, { deleteMessageSeconds: 604800, reason: banReason, }).then(() => true).catch(() => false);
    if (banned) {
      ensurePanicReport(getPanicState(guild?.id)).quarantinedUserIds.add(String(userId));
      if (guild?.client) {
        try {
          const config = await getModConfig(guild.id);
          const { doc, created } = await createModCase({ guildId: guild.id, action: "BAN", userId, modId: guild.client.user.id, reason: banReason, durationMs: null, context: {}, dedupe: { enabled: true, windowMs: 15_000, matchReason: true }, });
          if (created) {
            await logModCase({ client: guild.client, guild, modCase: doc, config });
          }
        } catch (e) {
          global.logger?.warn?.("[antiNuke] ModCase creation (ban) failed:", guild.id, userId, e?.message || e);
        }
      }
      return { applied: true, method: "ban", joinGateSuspicious };
    }
  }

  const me = guild?.members?.me || null;
  const quarantineRoleId = String(ANTINUKE_CONFIG.autoQuarantine.quarantineRoleId || "",);

  if (
    quarantineRoleId &&
    me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)
  ) {
    const role = await getGuildRoleCached(guild, quarantineRoleId, { ttlMs: 30_000 });
    if (role && role.position < me.roles.highest.position) {
      if (member.roles.cache.has(role.id)) {
        return { applied: true, method: "already_role", joinGateSuspicious };
      }
      const key = `${String(guild?.id || "")}:${String(userId || "")}:${String(role.id || "")}`;
      const snapshotRoleIds = member.roles.cache
        .filter((memberRole?) => {
          if (!memberRole?.id) return false;
          if (String(memberRole.id) === String(guild.id)) return false;
          if (String(memberRole.id) === String(role.id)) return false;
          if (memberRole.managed) return false;
          return Number(memberRole.position || 0) < Number(me.roles.highest.position || 0);
        })
        .map((memberRole?) => String(memberRole.id));
      QUARANTINE_ROLE_SNAPSHOTS.set(key, snapshotRoleIds);
      const roleApplied = await member.roles.set([String(role.id)], reason).then(() => true).catch(() => false);
      if (!roleApplied) {
        QUARANTINE_ROLE_SNAPSHOTS.delete(key);
      }
      if (roleApplied) {
        const refreshedMember = await getGuildMemberCached(guild, String(userId), { ttlMs: 1 });
        const roleIds = refreshedMember?.roles?.cache ? Array.from(refreshedMember.roles.cache.keys()) : [];
        if (!roleIds.includes(String(role.id)) || roleIds.some((id?) => String(id) !== String(guild.id) && String(id) !== String(role.id))) {
          QUARANTINE_ROLE_SNAPSHOTS.delete(key);
          return { applied: false, method: "role_add_not_persisted", joinGateSuspicious };
        }
        ensurePanicReport(getPanicState(guild?.id)).quarantinedUserIds.add(String(userId));
        scheduleQuarantineRoleRollback(
          guild,
          userId,
          role.id,
          ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs,
        );
        return { applied: true, method: "role", joinGateSuspicious };
      }
    }
  }

  if (!member.moderatable) return { applied: false, method: "not_moderatable" };
  const quarantineTimeoutMs = ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs || 0;
  try {
    const { captureMuteRoleSnapshot } = require("../../Moderation/services/mutedMirrorRoleService") as typeof import("../../Moderation/services/mutedMirrorRoleService");
    await captureMuteRoleSnapshot(member, { reason: "AntiNuke quarantine (pre-timeout)" });
  } catch (err) {
    global.logger?.warn?.("[antiNuke] pre-timeout snapshot:", userId, err?.message || err);
  }
  const timeoutApplied = await member.timeout(quarantineTimeoutMs, reason).then(() => true).catch(() => false);
  if (timeoutApplied) {
    ensurePanicReport(getPanicState(guild?.id)).quarantinedUserIds.add(String(userId));
    if (guild?.client && quarantineTimeoutMs > 0) {
      try {
        const config = await getModConfig(guild.id);
        const { doc, created } = await createModCase({ guildId: guild.id, action: "MUTE", userId, modId: guild.client.user.id, reason: String(reason || "AntiNuke quarantine"), durationMs: quarantineTimeoutMs, context: {}, dedupe: { enabled: true, windowMs: 15_000, matchReason: true }, });
        if (created) {
          await logModCase({ client: guild.client, guild, modCase: doc, config });
        }
      } catch (e) {
        global.logger?.warn?.("[antiNuke] ModCase creation (timeout) failed:", guild.id, userId, e?.message || e);
      }
    }
    return { applied: true, method: "timeout", joinGateSuspicious };
  }
  return { applied: false, method: "timeout_failed" };
}

export = { isAntiNukeScopeGuild, isAntiNukePanicActive, restoreAntiNukeQuarantineTimersOnStartup, quarantineOutcomeLabel, quarantineExecutor };
