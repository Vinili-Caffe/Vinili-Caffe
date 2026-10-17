/**
 * siteUserPresence1 — chi è online/idle sul sito (non Discord).
 * Heartbeat dal browser → Map in site-api → query batch + WS.
 */
"use strict";

const ONLINE_TTL_MS = 55_000;
const IDLE_TTL_MS = 90_000;
const MAX_QUERY_IDS = 120;
const byUserId = new Map();

function snowflakeOk(id) {
  return /^\d{16,22}$/.test(String(id || "").trim());
}

function normalizeStatus(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "online" || v === "idle") return v;
  if (v === "offline" || v === "clear") return "offline";
  return "online";
}

function effectiveStatus(row, now = Date.now()) {
  if (!row) return "offline";
  const at = Number(row.at || 0);
  const st = normalizeStatus(row.status);
  if (st === "offline") return "offline";
  const ttl = st === "idle" ? IDLE_TTL_MS : ONLINE_TTL_MS;
  if (!at || now - at > ttl) return "offline";
  return st;
}

function setSitePresence(userId, status, meta = {}) {
  const id = String(userId || "").trim();
  if (!snowflakeOk(id)) return null;
  const st = normalizeStatus(status);
  const prev = byUserId.get(id);
  const prevEff = effectiveStatus(prev);
  if (st === "offline") {
    if (prev) byUserId.delete(id);
    if (prevEff === "offline") return null;
    return { userId: id, status: "offline", at: Date.now() };
  }
  const row = {
    status: st,
    at: Date.now(),
    path: String(meta.path || prev?.path || "").slice(0, 180),
    visible: meta.visible !== false,
  };
  byUserId.set(id, row);
  if (prevEff === st) return null;
  return { userId: id, status: st, at: row.at };
}

function clearSitePresence(userId) {
  return setSitePresence(userId, "offline");
}

function getSitePresence(userId) {
  const id = String(userId || "").trim();
  if (!snowflakeOk(id)) return "offline";
  return effectiveStatus(byUserId.get(id));
}

function getManySitePresence(ids) {
  const out = {};
  const now = Date.now();
  let n = 0;
  for (const raw of Array.isArray(ids) ? ids : []) {
    if (n >= MAX_QUERY_IDS) break;
    const id = String(raw || "").trim();
    if (!snowflakeOk(id)) continue;
    n += 1;
    out[id] = effectiveStatus(byUserId.get(id), now);
  }
  return out;
}

function pruneSitePresence(now = Date.now()) {
  for (const [id, row] of byUserId) {
    if (effectiveStatus(row, now) === "offline") byUserId.delete(id);
  }
  if (byUserId.size > 8000) {
    const arr = [...byUserId.entries()].sort((a, b) => Number(a[1].at || 0) - Number(b[1].at || 0));
    for (let i = 0; i < arr.length - 6000; i += 1) byUserId.delete(arr[i][0]);
  }
}

function parseIds(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    return input
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

let pruneTimer = null;
function armPrune() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    try {
      pruneSitePresence();
    } catch (_) {}
  }, 30_000);
  if (typeof pruneTimer.unref === "function") pruneTimer.unref();
}
armPrune();

module.exports = {
  ONLINE_TTL_MS,
  IDLE_TTL_MS,
  MAX_QUERY_IDS,
  setSitePresence,
  clearSitePresence,
  getSitePresence,
  getManySitePresence,
  parseIds,
  pruneSitePresence,
  effectiveStatus,
  normalizeStatus,
};
