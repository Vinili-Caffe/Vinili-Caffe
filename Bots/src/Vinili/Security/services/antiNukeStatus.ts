/** Antinuke: stato da mostrare nei comandi e nella dashboard. */
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { MAINTENANCE_ALLOWLIST, cleanupMaintenanceAllowlist } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { getPanicState } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");
const { isAntiNukePanicActive } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { KICK_BAN_TRACKER, ROLE_CREATION_TRACKER, ROLE_DELETION_TRACKER, CHANNEL_CREATION_TRACKER, CHANNEL_DELETION_TRACKER } = require("./antiNukeRoleChannelActions") as typeof import("./antiNukeRoleChannelActions");
const { WEBHOOK_CREATION_TRACKER, WEBHOOK_UPDATE_TRACKER, WEBHOOK_DELETION_TRACKER, INVITE_CREATION_TRACKER } = require("./antiNukeWebhookInviteActions") as typeof import("./antiNukeWebhookInviteActions");

function getAntiNukeStatusSnapshot(guildId = "") {
  const now = Date.now();
  const panicState = guildId ? getPanicState(guildId) : null;
  const activeUntil = Number(panicState?.activeUntil || 0);
  const maintenanceEntries = [];
  if (guildId) {
    cleanupMaintenanceAllowlist(guildId, now);
    const bucket = MAINTENANCE_ALLOWLIST.get(String(guildId || ""));
    if (bucket?.size) {
      for (const [userId, expiresAt] of bucket.entries()) {
        maintenanceEntries.push({
          userId: String(userId),
          expiresAt: Number(expiresAt || 0),
          remainingMs: Math.max(0, Number(expiresAt || 0) - now),
        });
      }
      maintenanceEntries.sort((a?, b?) => a.expiresAt - b.expiresAt);
    }
  }

  const trackerSizes = { kickBan: KICK_BAN_TRACKER.size, roleCreate: ROLE_CREATION_TRACKER.size, roleDelete: ROLE_DELETION_TRACKER.size, channelCreate: CHANNEL_CREATION_TRACKER.size, channelDelete: CHANNEL_DELETION_TRACKER.size, webhookCreate: WEBHOOK_CREATION_TRACKER.size, webhookUpdate: WEBHOOK_UPDATE_TRACKER.size, webhookDelete: WEBHOOK_DELETION_TRACKER.size, inviteCreate: INVITE_CREATION_TRACKER.size, };

  return {
    enabled: Boolean(ANTINUKE_CONFIG.enabled),
    panicModeEnabled: Boolean(ANTINUKE_CONFIG.panicMode.enabled),
    panicActive: guildId ? isAntiNukePanicActive(guildId) : false,
    panicActiveUntil: activeUntil,
    panicRemainingMs: guildId ? Math.max(0, activeUntil - now) : 0,
    maintenanceEntries,
    trackerSizes,
    config: {
      enabled: Boolean(ANTINUKE_CONFIG.enabled),
      detectPrune: Boolean(ANTINUKE_CONFIG.detectPrune),
      vanityGuard: Boolean(ANTINUKE_CONFIG.vanityGuard),
      autoQuarantine: {
        enabled: Boolean(ANTINUKE_CONFIG.autoQuarantine?.enabled),
        strictMode: Boolean(ANTINUKE_CONFIG.autoQuarantine?.strictMode),
        strictMemberRoleAddition: Boolean(
          ANTINUKE_CONFIG.autoQuarantine?.strictMemberRoleAddition,
        ),
        monitorPublicRoles: Boolean(
          ANTINUKE_CONFIG.autoQuarantine?.monitorPublicRoles,
        ),
        monitorChannelPermissions: Boolean(
          ANTINUKE_CONFIG.autoQuarantine?.monitorChannelPermissions,
        ),
        quarantineRoleId: String(
          ANTINUKE_CONFIG.autoQuarantine?.quarantineRoleId || "",
        ),
        quarantineTimeoutMs: Number(
          ANTINUKE_CONFIG.autoQuarantine?.quarantineTimeoutMs || 0,
        ),
        whitelistUserIds: Array.from(
          ANTINUKE_CONFIG.autoQuarantine?.whitelistUserIds || [],
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
        enabled: Boolean(ANTINUKE_CONFIG.panicMode.enabled),
        useHeatAlgorithm: Boolean(ANTINUKE_CONFIG.panicMode.useHeatAlgorithm),
        thresholdHeat: Number(ANTINUKE_CONFIG.panicMode.thresholdHeat || 0),
        decayPerSec: Number(ANTINUKE_CONFIG.panicMode.decayPerSec || 0),
        durationMs: Number(ANTINUKE_CONFIG.panicMode.durationMs || 0),
        maxDurationMs: Number(ANTINUKE_CONFIG.panicMode.maxDurationMs || 0),
        extendByMsOnTrigger: Number(ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger || 0),
        warnedRoleIds: Array.from(ANTINUKE_CONFIG.panicMode.warnedRoleIds || []),
        whitelistCategoryIds: Array.from(
          ANTINUKE_CONFIG.panicMode.whitelistCategoryIds || [],
        ),
        lockdown: {
          dangerousRoles: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.dangerousRoles,
          ),
          lockModerationCommands: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.lockModerationCommands,
          ),
          lockAllCommands: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.lockAllCommands,
          ),
          channelLockdown: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.channelLockdown,
          ),
          banAttackExecutor: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.banAttackExecutor,
          ),
          unlockDangerousRolesOnFinish: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.unlockDangerousRolesOnFinish,
          ),
          roleAllowlistIds: Array.from(
            ANTINUKE_CONFIG.panicMode.lockdown?.roleAllowlistIds || [],
          ),
        },
        autoBackupSync: {
          enabled: Boolean(ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled),
          restoreDeletedRoles: Boolean(
            ANTINUKE_CONFIG.panicMode.autoBackupSync?.restoreDeletedRoles,
          ),
          restoreDeletedChannels: Boolean(
            ANTINUKE_CONFIG.panicMode.autoBackupSync?.restoreDeletedChannels,
          ),
          deleteNewRoles: Boolean(
            ANTINUKE_CONFIG.panicMode.autoBackupSync?.deleteNewRoles,
          ),
          deleteNewChannels: Boolean(
            ANTINUKE_CONFIG.panicMode.autoBackupSync?.deleteNewChannels,
          ),
          deleteNewWebhooks: Boolean(
            ANTINUKE_CONFIG.panicMode.autoBackupSync?.deleteNewWebhooks,
          ),
        },
        instantRollbackWhileActive: {
          enabled: Boolean(
            ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive?.enabled,
          ),
          quarantineExecutor: Boolean(
            ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive?.quarantineExecutor,
          ),
          deleteCreatedRoles: Boolean(
            ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive?.deleteCreatedRoles,
          ),
          deleteCreatedChannels: Boolean(
            ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive?.deleteCreatedChannels,
          ),
          deleteCreatedWebhooks: Boolean(
            ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive?.deleteCreatedWebhooks,
          ),
        },
      },
    },
  };
}

export = { getAntiNukeStatusSnapshot };
