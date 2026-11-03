const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");

const ANTINUKE_PANIC_STATE = new Map();
const ANTINUKE_PANIC_SNAPSHOT_PATH = path.resolve(__dirname, "..", "..", "Data", "antiNukePanicSnapshot.json");
let antinukePanicLoaded = false;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, Math.max(0, Number(ms || 0)));
    timer.unref?.();
  });
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

export = {
  sleep,
  getPanicState,
  persistAntiNukePanicSnapshotNow,
  ensureAntiNukePanicLoaded,
};
