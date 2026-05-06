"use strict";
const states = new Map();
let printed = false;
function reportRecoveryHealth(key, status, detail) {
  const id = String(key || "");
  if (!id) return;
  states.set(id, {
    status: String(status || "unknown"),
    detail: String(detail || ""),
    at: Date.now(),
  });
}
function printRecoveryHealthOnce(label = "RECOVERY_HEALTH") {
  if (printed) return;
  printed = true;
  const rows = Array.from(states.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, row]) => `${k}:${row.status}${row.detail ? `(${row.detail})` : ""}`);
  const text = rows.length ? rows.join(" | ") : "no_snapshot_events";
  global.logger?.info?.(`[${label}] ${text}`);
}
module.exports = {
  reportRecoveryHealth,
  printRecoveryHealthOnce,
};
