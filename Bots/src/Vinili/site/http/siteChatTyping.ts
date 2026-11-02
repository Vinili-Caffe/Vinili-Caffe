"use strict";

const { broadcastSiteRealtime } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");

const TYPING_TTL_MS = 4500;
const TYPING_MIN_INTERVAL_MS = 1800;
/** @type {Map<string, Map<string, { name: string, at: number, lastEmit: number }>>} */
const rooms = new Map();

function normalizeId(value?) {
  return String(value || "").trim();
}

function roomKey(kind?, id?) {
  return `${normalizeId(kind)}:${normalizeId(id)}`;
}

function pruneRoom(map?, now = Date.now()) {
  if (!map) return;
  for (const [uid, row] of map) {
    if (!row || now - Number(row.at || 0) > TYPING_TTL_MS) map.delete(uid);
  }
}

function setTyping({ kind, id, userId, userName, eventType, extra = {} }) {
  const k = roomKey(kind, id);
  const uid = normalizeId(userId);
  if (!normalizeId(kind) || !normalizeId(id) || !uid) {
    return { ok: false, skipped: true };
  }

  const now = Date.now();
  let map = rooms.get(k);
  if (!map) {
    map = new Map();
    rooms.set(k, map);
  }
  pruneRoom(map, now);

  const prev = map.get(uid);
  const lastEmit = Number(prev?.lastEmit || 0);
  const name = String(userName || prev?.name || "Utente").trim().slice(0, 80) || "Utente";
  const shouldEmit = !prev || now - lastEmit >= TYPING_MIN_INTERVAL_MS;

  map.set(uid, {
    name,
    at: now,
    lastEmit: shouldEmit ? now : lastEmit,
  });

  if (shouldEmit && eventType) {
    try {
      broadcastSiteRealtime({
        type: eventType,
        at: new Date().toISOString(),
        userId: uid,
        userName: name,
        ...extra,
      });
    } catch (_) {}
  }

  return { ok: true, emitted: shouldEmit };
}

function clearTyping({ kind, id, userId, eventType, extra = {} }) {
  const k = roomKey(kind, id);
  const uid = normalizeId(userId);
  const map = rooms.get(k);
  if (!map || !uid) return;
  map.delete(uid);
  if (!map.size) rooms.delete(k);
  if (eventType) {
    try {
      broadcastSiteRealtime({
        type: eventType,
        stop: true,
        at: new Date().toISOString(),
        userId: uid,
        ...extra,
      });
    } catch (_) {}
  }
}

export = {
  setTyping,
  clearTyping,
};
