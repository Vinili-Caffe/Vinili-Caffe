"use strict";

const PRESENCE_TTL_MS = 45_000;
const presenceByUserId = new Map();

function normalizeUserId(value) {
  const id = String(value || "").trim();
  return /^\d{16,22}$/.test(id) ? id : "";
}

function normalizeTicketId(value) {
  const id = String(value || "").trim();
  return /^[a-f0-9]{24}$/i.test(id) ? id.toLowerCase() : "";
}

function setWebTicketPagePresence(userId, { ticketId = "", inbox = false } = {}) {
  const uid = normalizeUserId(userId);
  if (!uid) return false;
  presenceByUserId.set(uid, {
    ticketId: normalizeTicketId(ticketId),
    inbox: Boolean(inbox),
    at: Date.now(),
  });
  return true;
}

function clearWebTicketPagePresence(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  presenceByUserId.delete(uid);
}

function getWebTicketPagePresence(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return null;
  const row = presenceByUserId.get(uid);
  if (!row) return null;
  if (Date.now() - Number(row.at || 0) > PRESENCE_TTL_MS) {
    presenceByUserId.delete(uid);
    return null;
  }
  return row;
}

function shouldSkipWebTicketInAppNotif(_userId, _ticketId, _mode) {
  return false;
}

module.exports = {
  PRESENCE_TTL_MS,
  setWebTicketPagePresence,
  clearWebTicketPagePresence,
  getWebTicketPagePresence,
  shouldSkipWebTicketInAppNotif,
};
