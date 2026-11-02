const mongoose = require("mongoose") as typeof import("mongoose");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
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

function computeCooldownSeconds(member?, level?) {
  const hasBypassRole = hasRole(member, ROLE_COOLDOWN_BYPASS);
  const hasRole100 = hasRole(member, ROLE_LEVEL_100);
  const hasRole50 = hasRole(member, ROLE_LEVEL_50);
  const hasRole30 = hasRole(member, ROLE_LEVEL_30);
  const hasVipPlus = hasRole(member, ROLE_VIP_PLUS) || hasRole(member, IDs.roles?.["VIP+"]);
  const hasDoubleBooster = hasRole(member, ROLE_DOUBLE_BOOSTER);
  const hasServerBooster = hasRole(member, ROLE_SERVER_BOOSTER);
  const hasVip = hasRole(member, ROLE_VIP);
  if (hasBypassRole) return 0;
  if (hasRole100 || level >= 100) return 0;
    if (hasVipPlus || hasDoubleBooster || hasRole50 || level >= 50) return 5;
    if (hasServerBooster || hasVip || hasRole30 || level >= 30) return 15;
  return 30;
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
  let seconds = computeCooldownSeconds(member, level);
  if (seconds > 5 && guildId && userId && isDbReady()) {
    try {
      const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService") as typeof import("../../Services/Community/weekWinnerGrantsService");
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