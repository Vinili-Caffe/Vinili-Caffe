/** Antinuke: configurazione salvata e protezioni che non si possono spegnere. */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { CORE_EXEMPT_USER_IDS } = require("../../Moderation/services/joinGateExemptUtils") as typeof import("../../Moderation/services/joinGateExemptUtils");

const ANTINUKE_CONFIG_PATH = path.resolve(__dirname, "../config/antiNukeConfig.json",);
const ANTINUKE_CONFIG = { enabled: true, detectPrune: false, vanityGuard: true, autoQuarantine: { enabled: true, strictMode: true, strictMemberRoleAddition: true, monitorPublicRoles: true, monitorChannelPermissions: true, quarantineRoleId: "1442568884833095832", quarantineTimeoutMs: 24 * 60 * 60_000, whitelistUserIds: new Set(["610531025470095390", "700814270069342339",]), }, kickBanFilter: { enabled: true, minuteLimit: 5, hourLimit: 15, heatPerAction: 20, }, roleCreationFilter: { enabled: true, minuteLimit: 5, hourLimit: 15, heatPerAction: 10, }, roleDeletionFilter: { enabled: true, minuteLimit: 3, hourLimit: 10, heatPerAction: 25, }, channelCreationFilter: { enabled: true, minuteLimit: 4, hourLimit: 12, heatPerAction: 16, }, channelDeletionFilter: { enabled: true, minuteLimit: 3, hourLimit: 8, heatPerAction: 25, }, webhookCreationFilter: { enabled: true, minuteLimit: 3, hourLimit: 10, heatPerAction: 15, }, webhookUpdateFilter: { enabled: true, minuteLimit: 4, hourLimit: 12, heatPerAction: 12, }, webhookDeletionFilter: { enabled: true, minuteLimit: 3, hourLimit: 8, heatPerAction: 10, }, inviteCreationFilter: { enabled: true, minuteLimit: 4, hourLimit: 15, heatPerAction: 12, }, panicMode: { enabled: true, useHeatAlgorithm: true, thresholdHeat: 130, decayPerSec: 5, durationMs: 10 * 60_000, maxDurationMs: 45 * 60_000, extendByMsOnTrigger: 2 * 60_000, lockdown: { dangerousRoles: true, unlockDangerousRolesOnFinish: true, lockModerationCommands: true, lockAllCommands: true, channelLockdown: true, banAttackExecutor: false, roleAllowlistIds: new Set([]), }, warnedRoleIds: new Set([String(IDs.roles.HighStaff || ""),].filter(Boolean)), whitelistCategoryIds: new Set([]), autoBackupSync: { enabled: false, restoreDeletedRoles: true, deleteNewRoles: true, restoreDeletedChannels: true, deleteNewChannels: true, deleteNewWebhooks: true, }, instantRollbackWhileActive: { enabled: true, quarantineExecutor: true, deleteCreatedRoles: true, deleteCreatedChannels: true, deleteCreatedWebhooks: true, }, }, };
function readJsonSafe(filePath?, fallback?) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath?, value?) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function normalizeStringSet(input?, fallbackSet = new Set()) {
  if (!Array.isArray(input)) return new Set(fallbackSet);
  return new Set(
    input
      .map((x?) => String(x || "").trim())
      .filter(Boolean),
  );
}

function getSerializableAntiNukeConfig() {
  return {
    enabled: Boolean(ANTINUKE_CONFIG.enabled),
    detectPrune: Boolean(ANTINUKE_CONFIG.detectPrune),
    vanityGuard: Boolean(ANTINUKE_CONFIG.vanityGuard),
    autoQuarantine: {
      ...ANTINUKE_CONFIG.autoQuarantine,
      whitelistUserIds: Array.from(
        ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds || [],
      ),
    },
    kickBanFilter: { ...ANTINUKE_CONFIG.kickBanFilter },
    roleCreationFilter: { ...ANTINUKE_CONFIG.roleCreationFilter },
    roleDeletionFilter: { ...ANTINUKE_CONFIG.roleDeletionFilter },
    channelCreationFilter: { ...ANTINUKE_CONFIG.channelCreationFilter },
    channelDeletionFilter: { ...ANTINUKE_CONFIG.channelDeletionFilter },
    webhookCreationFilter: { ...ANTINUKE_CONFIG.webhookCreationFilter },
    webhookUpdateFilter: { ...ANTINUKE_CONFIG.webhookUpdateFilter },
    webhookDeletionFilter: { ...ANTINUKE_CONFIG.webhookDeletionFilter },
    inviteCreationFilter: { ...ANTINUKE_CONFIG.inviteCreationFilter },
    panicMode: {
      ...ANTINUKE_CONFIG.panicMode,
      warnedRoleIds: Array.from(ANTINUKE_CONFIG.panicMode.warnedRoleIds || []),
      whitelistCategoryIds: Array.from(
        ANTINUKE_CONFIG.panicMode.whitelistCategoryIds || [],
      ),
      lockdown: {
        ...ANTINUKE_CONFIG.panicMode.lockdown,
        roleAllowlistIds: Array.from(
          ANTINUKE_CONFIG.panicMode.lockdown?.roleAllowlistIds || [],
        ),
      },
    },
  };
}

function applyPersistentAntiNukeConfig(raw?) {
  if (!raw || typeof raw !== "object") return;
  const clamp = (value?, min?, max?, fallback?) => { const n = Number(value); if (!Number.isFinite(n)) return fallback; return Math.min(max, Math.max(min, n)); };
  const boolOr = (value?, fallback?) => typeof value === "boolean" ? value : fallback;
  const src = raw;
  ANTINUKE_CONFIG.enabled = boolOr(src.enabled, ANTINUKE_CONFIG.enabled);
  ANTINUKE_CONFIG.detectPrune = boolOr(
    src.detectPrune,
    ANTINUKE_CONFIG.detectPrune,
  );
  ANTINUKE_CONFIG.vanityGuard = boolOr(
    src.vanityGuard,
    ANTINUKE_CONFIG.vanityGuard,
  );

  const aq = src.autoQuarantine || {};
  Object.assign(ANTINUKE_CONFIG.autoQuarantine, aq);
  ANTINUKE_CONFIG.autoQuarantine.enabled = boolOr(
    aq.enabled,
    ANTINUKE_CONFIG.autoQuarantine.enabled,
  );
  ANTINUKE_CONFIG.autoQuarantine.strictMode = boolOr(
    aq.strictMode,
    ANTINUKE_CONFIG.autoQuarantine.strictMode,
  );
  ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition = boolOr(
    aq.strictMemberRoleAddition,
    ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition,
  );
  ANTINUKE_CONFIG.autoQuarantine.monitorPublicRoles = boolOr(
    aq.monitorPublicRoles,
    ANTINUKE_CONFIG.autoQuarantine.monitorPublicRoles,
  );
  ANTINUKE_CONFIG.autoQuarantine.monitorChannelPermissions = boolOr(
    aq.monitorChannelPermissions,
    ANTINUKE_CONFIG.autoQuarantine.monitorChannelPermissions,
  );
  ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs = clamp(
    aq.quarantineTimeoutMs,
    60_000,
    7 * 24 * 60 * 60_000,
    ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs,
  );
  ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds = (normalizeStringSet(
    aq.whitelistUserIds,
    ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds,
  ) as any);
  mergeCoreUsersIntoAutoQuarantineWhitelist();

  Object.assign(ANTINUKE_CONFIG.kickBanFilter, src.kickBanFilter || {});
  Object.assign(ANTINUKE_CONFIG.roleCreationFilter, src.roleCreationFilter || {});
  Object.assign(ANTINUKE_CONFIG.roleDeletionFilter, src.roleDeletionFilter || {});
  Object.assign(
    ANTINUKE_CONFIG.channelCreationFilter,
    src.channelCreationFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.channelDeletionFilter,
    src.channelDeletionFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.webhookCreationFilter,
    src.webhookCreationFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.webhookUpdateFilter,
    src.webhookUpdateFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.webhookDeletionFilter,
    src.webhookDeletionFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.inviteCreationFilter,
    src.inviteCreationFilter || {},
  );
  const filters = [ANTINUKE_CONFIG.kickBanFilter, ANTINUKE_CONFIG.roleCreationFilter, ANTINUKE_CONFIG.roleDeletionFilter, ANTINUKE_CONFIG.channelCreationFilter, ANTINUKE_CONFIG.channelDeletionFilter, ANTINUKE_CONFIG.webhookCreationFilter, ANTINUKE_CONFIG.webhookUpdateFilter, ANTINUKE_CONFIG.webhookDeletionFilter, ANTINUKE_CONFIG.inviteCreationFilter,];
  for (const f of filters) {
    f.enabled = boolOr(f.enabled, true);
    f.minuteLimit = clamp(f.minuteLimit, 1, 200, 5);
    f.hourLimit = clamp(f.hourLimit, 1, 5000, 20);
    f.heatPerAction = clamp(f.heatPerAction, 1, 200, 20);
  }

  const pm = src.panicMode || {};
  Object.assign(ANTINUKE_CONFIG.panicMode, pm);
  ANTINUKE_CONFIG.panicMode.enabled = boolOr(
    pm.enabled,
    ANTINUKE_CONFIG.panicMode.enabled,
  );
  ANTINUKE_CONFIG.panicMode.useHeatAlgorithm = boolOr(
    pm.useHeatAlgorithm,
    ANTINUKE_CONFIG.panicMode.useHeatAlgorithm,
  );
  ANTINUKE_CONFIG.panicMode.thresholdHeat = clamp(
    pm.thresholdHeat,
    1,
    500,
    ANTINUKE_CONFIG.panicMode.thresholdHeat,
  );
  ANTINUKE_CONFIG.panicMode.decayPerSec = clamp(
    pm.decayPerSec,
    0,
    100,
    ANTINUKE_CONFIG.panicMode.decayPerSec,
  );
  ANTINUKE_CONFIG.panicMode.durationMs = clamp(
    pm.durationMs,
    60_000,
    24 * 60 * 60_000,
    ANTINUKE_CONFIG.panicMode.durationMs,
  );
  ANTINUKE_CONFIG.panicMode.maxDurationMs = clamp(
    pm.maxDurationMs,
    ANTINUKE_CONFIG.panicMode.durationMs,
    24 * 60 * 60_000,
    Math.max(
      ANTINUKE_CONFIG.panicMode.maxDurationMs,
      ANTINUKE_CONFIG.panicMode.durationMs,
    ),
  );
  ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger = clamp(
    pm.extendByMsOnTrigger,
    0,
    12 * 60 * 60_000,
    ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger,
  );
  ANTINUKE_CONFIG.panicMode.warnedRoleIds = (normalizeStringSet(
    pm.warnedRoleIds,
    ANTINUKE_CONFIG.panicMode.warnedRoleIds,
  ) as any);
  ANTINUKE_CONFIG.panicMode.whitelistCategoryIds = normalizeStringSet(
    pm.whitelistCategoryIds,
    ANTINUKE_CONFIG.panicMode.whitelistCategoryIds,
  );
  Object.assign(ANTINUKE_CONFIG.panicMode.lockdown, pm.lockdown || {});
  ANTINUKE_CONFIG.panicMode.lockdown.roleAllowlistIds = normalizeStringSet(
    pm.lockdown?.roleAllowlistIds,
    ANTINUKE_CONFIG.panicMode.lockdown.roleAllowlistIds,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles = boolOr(
    pm.lockdown?.dangerousRoles,
    ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.unlockDangerousRolesOnFinish = boolOr(
    pm.lockdown?.unlockDangerousRolesOnFinish,
    ANTINUKE_CONFIG.panicMode.lockdown.unlockDangerousRolesOnFinish,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.lockModerationCommands = boolOr(
    pm.lockdown?.lockModerationCommands,
    ANTINUKE_CONFIG.panicMode.lockdown.lockModerationCommands,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.lockAllCommands = boolOr(
    pm.lockdown?.lockAllCommands,
    ANTINUKE_CONFIG.panicMode.lockdown.lockAllCommands,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown = boolOr(
    pm.lockdown?.channelLockdown,
    ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.banAttackExecutor = boolOr(
    pm.lockdown?.banAttackExecutor,
    ANTINUKE_CONFIG.panicMode.lockdown.banAttackExecutor,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.enabled = boolOr(
    pm.autoBackupSync?.enabled,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.enabled,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedRoles = boolOr(
    pm.autoBackupSync?.restoreDeletedRoles,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedRoles,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewRoles = boolOr(
    pm.autoBackupSync?.deleteNewRoles,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewRoles,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedChannels = boolOr(
    pm.autoBackupSync?.restoreDeletedChannels,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedChannels,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewChannels = boolOr(
    pm.autoBackupSync?.deleteNewChannels,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewChannels,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewWebhooks = boolOr(
    pm.autoBackupSync?.deleteNewWebhooks,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewWebhooks,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.enabled = boolOr(
    pm.instantRollbackWhileActive?.enabled,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.enabled,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.quarantineExecutor = boolOr(
    pm.instantRollbackWhileActive?.quarantineExecutor,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.quarantineExecutor,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedRoles = boolOr(
    pm.instantRollbackWhileActive?.deleteCreatedRoles,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedRoles,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedChannels = boolOr(
    pm.instantRollbackWhileActive?.deleteCreatedChannels,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedChannels,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedWebhooks = boolOr(
    pm.instantRollbackWhileActive?.deleteCreatedWebhooks,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedWebhooks,
  );
}

function saveAntiNukePersistentConfig() {
  return writeJsonSafe(ANTINUKE_CONFIG_PATH, getSerializableAntiNukeConfig());
}

function mergeCoreUsersIntoAutoQuarantineWhitelist() {
  const set = ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds;
  if (!(set instanceof Set)) return;
  for (const id of CORE_EXEMPT_USER_IDS) {
    set.add(String(id));
  }
}

function enforceCriticalAntiNukeGuards() {
  ANTINUKE_CONFIG.autoQuarantine.monitorPublicRoles = true;
  mergeCoreUsersIntoAutoQuarantineWhitelist();
  const highStaffId = String(IDs.roles.HighStaff || "");
  if (highStaffId) {
    ANTINUKE_CONFIG.panicMode.warnedRoleIds = new Set([highStaffId]);
  }
}

function setAntiNukeConfigSnapshot(rawConfig?) {
  try {
    applyPersistentAntiNukeConfig(rawConfig || {});
    enforceCriticalAntiNukeGuards();
    const saved = saveAntiNukePersistentConfig();
    return saved ? { ok: true, config: getSerializableAntiNukeConfig() } : { ok: false, reason: "save_failed" };
  } catch {
    return { ok: false, reason: "apply_failed" };
  }
}

export = { ANTINUKE_CONFIG_PATH, ANTINUKE_CONFIG, readJsonSafe, applyPersistentAntiNukeConfig, enforceCriticalAntiNukeGuards, setAntiNukeConfigSnapshot };
