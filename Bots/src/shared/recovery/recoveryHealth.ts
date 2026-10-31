"use strict";
const states = new Map();
let printed = false;
function reportRecoveryHealth(key?, status?, detail?) {
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
  const entries = Array.from(states.entries()).sort((a?, b?) => a[0].localeCompare(b[0]));
  const bad = entries.filter(([, row]) => String(row.status || "").toLowerCase() !== "ok");
  if (!bad.length) return;
  const text = bad
    .map(([k, row]) => `${k}:${row.status}${row.detail ? `(${row.detail})` : ""}`)
    .join(" | ");
  global.logger?.warn?.(`[${label}] ${text}`);
}
export = {
  reportRecoveryHealth,
  printRecoveryHealthOnce,
};