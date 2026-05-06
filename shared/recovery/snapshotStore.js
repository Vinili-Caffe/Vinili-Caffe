"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { reportRecoveryHealth } = require("./recoveryHealth");
const failureByKey = new Map();
const disabledKeys = new Set();
const FAILURE_LIMIT = 3;
function digest(payload) {
  return crypto.createHash("sha256").update(String(payload || ""), "utf8").digest("hex");
}
function markFailure(key, reason) {
  const next = Number(failureByKey.get(key) || 0) + 1;
  failureByKey.set(key, next);
  reportRecoveryHealth(key, "error", reason || "unknown_error");
  if (next >= FAILURE_LIMIT) {
    disabledKeys.add(key);
    reportRecoveryHealth(key, "disabled", "circuit_breaker_open");
  }
}
function markSuccess(key) {
  failureByKey.set(key, 0);
}
function readSnapshotWithMeta({
  filePath,
  key,
  version = 1,
  migrate = {},
  walPath = "",
  fallback = {},
}) {
  const id = String(key || filePath || "");
  try {
    if (!filePath || disabledKeys.has(id)) return fallback;
    if (!fs.existsSync(filePath)) {
      if (walPath && fs.existsSync(walPath)) {
        try {
          const lines = fs.readFileSync(walPath, "utf8").split(/\r?\n/).filter(Boolean);
          for (let i = lines.length - 1; i >= 0; i -= 1) {
            const row = JSON.parse(lines[i]);
            if (Number(row?.version || 1) !== version) continue;
            reportRecoveryHealth(id, "ok", "restored_from_wal");
            return row?.payload ?? fallback;
          }
        } catch (_) { }
      }
      reportRecoveryHealth(id, "miss", "snapshot_missing");
      return fallback;
    }
    const rawText = fs.readFileSync(filePath, "utf8");
    const raw = JSON.parse(rawText);
    const storedChecksum = String(raw?.checksum || "");
    const payload = raw?.payload;
    const payloadJson = JSON.stringify(payload ?? {});
    if (storedChecksum && storedChecksum !== digest(payloadJson)) {
      throw new Error("checksum_mismatch");
    }
    let currentVersion = Number(raw?.version || 1);
    let migrated = payload;
    while (currentVersion < version) {
      const migrateStep = migrate[currentVersion];
      if (typeof migrateStep !== "function") throw new Error(`missing_migrate_${currentVersion}`);
      migrated = migrateStep(migrated);
      currentVersion += 1;
    }
    markSuccess(id);
    reportRecoveryHealth(id, "ok", currentVersion === Number(raw?.version || 1) ? "loaded" : "migrated");
    return migrated ?? fallback;
  } catch (error) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.renameSync(filePath, `${filePath}.corrupt.${Date.now()}`);
      }
    } catch (_) { }
    markFailure(id, error?.message || "read_failed");
    return fallback;
  }
}
function writeSnapshotWithMeta({
  filePath,
  key,
  version = 1,
  walPath = "",
  payload = {},
}) {
  const id = String(key || filePath || "");
  try {
    if (!filePath || disabledKeys.has(id)) return false;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payloadJson = JSON.stringify(payload ?? {});
    const body = JSON.stringify({
      version: Number(version || 1),
      checksum: digest(payloadJson),
      payload: payload ?? {},
      updatedAt: Date.now(),
    });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, body, "utf8");
    fs.renameSync(tmp, filePath);
    if (walPath) {
      const walDir = path.dirname(walPath);
      if (!fs.existsSync(walDir)) fs.mkdirSync(walDir, { recursive: true });
      const line = JSON.stringify({ at: Date.now(), version: Number(version || 1), payload: payload ?? {} });
      fs.appendFileSync(walPath, `${line}\n`, "utf8");
      try {
        const stat = fs.statSync(walPath);
        if (Number(stat?.size || 0) > 512 * 1024) {
          const rows = fs.readFileSync(walPath, "utf8").split(/\r?\n/).filter(Boolean);
          const compact = rows.slice(-200).join("\n");
          fs.writeFileSync(walPath, compact ? `${compact}\n` : "", "utf8");
        }
      } catch (_) { }
    }
    markSuccess(id);
    return true;
  } catch (error) {
    markFailure(id, error?.message || "write_failed");
    return false;
  }
}
module.exports = {
  readSnapshotWithMeta,
  writeSnapshotWithMeta,
};
