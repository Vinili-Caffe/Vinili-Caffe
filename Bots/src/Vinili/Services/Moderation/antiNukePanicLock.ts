/** Antinuke: blocco e sblocco di ruoli e canali durante il panico. */
const { DANGEROUS_PERMS, lockDangerousRolesForPanic, unlockDangerousRolesAfterPanic } = require("./antiNukePanicRoleLock") as typeof import("./antiNukePanicRoleLock");
const { getPanicState, persistAntiNukePanicSnapshotNow } = require("./antiNukePanicState") as typeof import("./antiNukePanicState");
const { createPanicCaseId, ensurePanicReport, sendPanicModeDetailedReport } = require("./antiNukePanicReport") as typeof import("./antiNukePanicReport");
const { lockGuildChannelsForPanic, unlockGuildChannelsAfterPanic } = require("./antiNukePanicChannelLock") as typeof import("./antiNukePanicChannelLock");
const { scheduleAntiNukePanicUnlock, schedulePanicRestoreRetry } = require("./antiNukePanicUnlock") as typeof import("./antiNukePanicUnlock");
const { runAutoBackupSyncAfterPanic } = require("./antiNukePanicBackupSync") as typeof import("./antiNukePanicBackupSync");

export = { DANGEROUS_PERMS, getPanicState, persistAntiNukePanicSnapshotNow, createPanicCaseId, ensurePanicReport, sendPanicModeDetailedReport, lockDangerousRolesForPanic, scheduleAntiNukePanicUnlock, unlockDangerousRolesAfterPanic, lockGuildChannelsForPanic, unlockGuildChannelsAfterPanic, schedulePanicRestoreRetry, runAutoBackupSyncAfterPanic };
