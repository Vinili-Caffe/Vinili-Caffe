const mongoose = require("mongoose") as typeof import("mongoose");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const ROLE_COOLDOWN_BYPASS = IDs.roles.Staff;
const ROLE_DOUBLE_BOOSTER = IDs.roles.DoubleBooster;
const ROLE_SERVER_BOOSTER = IDs.roles.ServerBooster;
const ROLE_LEVEL_30 = IDs.roles.Level30;
const ROLE_LEVEL_50 = IDs.roles.Level50;
const ROLE_LEVEL_100 = IDs.roles.Level100;
const ROLE_VIP = IDs.roles.VIP;
const ROLE_VIP_PLUS = IDs.roles.VIPplus;
const COOLDOWN_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "commandCooldownSnapshot.json");
const COOLDOWN_SNAPSHOT_DEBOUNCE_MS = 2000;

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function readCooldownSnapshotFile() {
  return readSnapshotWithMeta({
    filePath: COOLDOWN_SNAPSHOT_PATH,
    walPath: `${COOLDOWN_SNAPSHOT_PATH}.wal`,
    key: "vinyls_command_cooldown",
    version: 1,
    fallback: {},
  });
}

function writeCooldownSnapshotFile(rows?) {
  writeSnapshotWithMeta({
    filePath: COOLDOWN_SNAPSHOT_PATH,
    walPath: `${COOLDOWN_SNAPSHOT_PATH}.wal`,
    key: "vinyls_command_cooldown",
    version: 1,
    payload: rows || {},
  });
}

function ensureCooldownBucketLoaded(client?) {
  if (client._commandCooldownLoaded) return;
  armShutdownCheckpoint();
  client._commandCooldownLoaded = true;
  const now = Date.now();
  const bucket = getBucket(client);
  const rows = readCooldownSnapshotFile();
  for (const [keyRaw, endsAtRaw] of Object.entries(rows)) {
    const key = String(keyRaw || "").trim();
    const endsAt = Number(endsAtRaw || 0);
    if (!key || !Number.isFinite(endsAt) || endsAt <= now) continue;
    bucket.set(key, endsAt);
  }
  if (!client._commandCooldownSnapshotFlushRegistered) {
    client._commandCooldownSnapshotFlushRegistered = true;
    registerShutdownFlush("vinyls_command_cooldown", () => flushCooldownBucketSnapshot(client));
  }
}

function flushCooldownBucketSnapshot(client?) {
  const bucket = getBucket(client);
  const now = Date.now();
  const out: Record<string, any> = {};
  for (const [keyRaw, endsAtRaw] of bucket.entries()) {
    const key = String(keyRaw || "").trim();
    const endsAt = Number(endsAtRaw || 0);
    if (!key || !Number.isFinite(endsAt) || endsAt <= now) continue;
    out[key] = endsAt;
  }
  writeCooldownSnapshotFile(out);
}

function scheduleCooldownSnapshotPersist(client?) {
  if (client._commandCooldownPersistTimer) return;
  const timer = setTimeout(() => {
    client._commandCooldownPersistTimer = null;
    flushCooldownBucketSnapshot(client);
  }, COOLDOWN_SNAPSHOT_DEBOUNCE_MS);
  timer.unref?.();
  client._commandCooldownPersistTimer = timer;
}

function getBucket(client?) {
  if (!client.commandCooldowns) {
    client.commandCooldowns = new Map();
  }
  return client.commandCooldowns;
}

function hasRole(member?, roleId?) {
  if (!member || !roleId) return false;
  const id = String(roleId);
  const roles = member.roles;
  if (!roles) return false;
  if (roles.cache && typeof roles.cache.has === "function") {
    return roles.cache.has(id);
  }
  if (typeof roles.has === "function") {
    return roles.has(id);
  }
  if (Array.isArray(roles)) {
    return roles.map(String).includes(id);
  }
  if (Array.isArray(roles._roles)) {
    return roles._roles.map(String).includes(id);
  }
  return false;
}

function getDashboardCommandCooldown(guildId?) {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const cfg = LVL.getConfigSync(String(guildId || ""));
    if (!cfg || !(cfg.userSaved || cfg.seedVersion > 0) || !cfg.commandCooldown) return null;
    return cfg.commandCooldown;
  } catch {
    return null;
  }
}

function computeLevelCooldownSeconds(level?, cd?) {
  if (!cd) return null;
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  for (const tier of Array.isArray(cd.tiers) ? cd.tiers : []) {
    if (lvl >= Number(tier.minLevel)) return Math.max(0, Math.floor(Number(tier.seconds) || 0));
  }
  return Math.max(0, Math.floor(Number(cd.defaultSeconds) || 0));
}

function computeCooldownSeconds(member?, level?, guildId?) {
  const cd = getDashboardCommandCooldown(guildId);
  const roleSecs = cd?.roles || { staff: 0, vipPlus: 5, vip: 15, doubleBooster: 5, booster: 15 };

  if (hasRole(member, ROLE_COOLDOWN_BYPASS)) {
    return Math.max(0, Math.floor(Number(roleSecs.staff) || 0));
  }

  let fromLevel = computeLevelCooldownSeconds(level, cd);
  if (fromLevel == null) {
    const hasRole100 = hasRole(member, ROLE_LEVEL_100);
    const hasRole50 = hasRole(member, ROLE_LEVEL_50);
    const hasRole30 = hasRole(member, ROLE_LEVEL_30);
    if (hasRole100 || level >= 100) fromLevel = 0;
    else if (hasRole50 || level >= 50) fromLevel = 5;
    else if (hasRole30 || level >= 30) fromLevel = 15;
    else fromLevel = 30;
  }

  /* VIP / boost: prendono il minore tra livello e ruolo (non peggiorano) */
  const hasVipPlus = hasRole(member, ROLE_VIP_PLUS) || hasRole(member, IDs.roles?.["VIP+"]);
  const hasDoubleBooster = hasRole(member, ROLE_DOUBLE_BOOSTER);
  const hasServerBooster = hasRole(member, ROLE_SERVER_BOOSTER);
  const hasVip = hasRole(member, ROLE_VIP);
  let fromRole = Number.POSITIVE_INFINITY;
  if (hasVipPlus) fromRole = Math.min(fromRole, Math.max(0, Math.floor(Number(roleSecs.vipPlus) || 0)));
  if (hasDoubleBooster) fromRole = Math.min(fromRole, Math.max(0, Math.floor(Number(roleSecs.doubleBooster) || 0)));
  if (hasVip) fromRole = Math.min(fromRole, Math.max(0, Math.floor(Number(roleSecs.vip) || 0)));
  if (hasServerBooster) fromRole = Math.min(fromRole, Math.max(0, Math.floor(Number(roleSecs.booster) || 0)));

  for (const row of Array.isArray(cd?.customRoles) ? cd.customRoles : []) {
    const roleId = String(row?.roleId || "").trim();
    if (!roleId || !hasRole(member, roleId)) continue;
    fromRole = Math.min(fromRole, Math.max(0, Math.floor(Number(row?.seconds) || 0)));
  }

  return Math.min(fromLevel, fromRole);
}

async function getUserCommandCooldownSeconds({ guildId, userId, member }) {
  let level = 0;
  if (guildId && userId && isDbReady()) {
    try {
      const profile: any = await ActivityUserProfile.findOne({ guildId, userId })
        .select("profile.totals.exp.level")
        .lean();
      level = Number(profile?.profile?.totals?.exp?.level || 0);
    } catch {
      level = 0;
    }
  }
  if (guildId) {
    try {
      const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
      if (!LVL.getConfigSync(String(guildId))) await LVL.getConfig(String(guildId));
    } catch (_) {}
  }
  let seconds = computeCooldownSeconds(member, level, guildId);
  if (seconds > 5 && guildId && userId && isDbReady()) {
    try {
      const { hasEventWeekWinnerGrant } = require("../../Community/services/weekWinnerGrantsService") as typeof import("../../Community/services/weekWinnerGrantsService");
      if (await hasEventWeekWinnerGrant(guildId, userId, 2)) seconds = 5;
    } catch (err) {
      global.logger?.warn?.("[commandCooldown] ", err?.message || err);
    }
  }
  return seconds;
}

function consumeUserCooldown({ client, guildId, userId, cooldownSeconds }) {
  const parsed = Number(cooldownSeconds);
  const seconds = Number.isFinite(parsed) ? parsed : 30;
  ensureCooldownBucketLoaded(client);
  if (seconds <= 0) {
    return { ok: true, remainingMs: 0 };
  }

  const bucket = getBucket(client);
  const key = `${guildId || "dm"}:${userId}`;
  const now = Date.now();
  const endsAt = bucket.get(key) || 0;

  if (endsAt > now) {
    scheduleCooldownSnapshotPersist(client);
    return {
      ok: false,
      remainingMs: endsAt - now,
    };
  }

  bucket.set(key, now + seconds * 1000);
  scheduleCooldownSnapshotPersist(client);
  return { ok: true, remainingMs: 0 };
}

export = { getUserCommandCooldownSeconds, consumeUserCooldown };