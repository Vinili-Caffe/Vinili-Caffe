"use strict";

const presenceByUserId = new Map();

function normalizeUserId(value?) {
  const id = String(value || "").trim();
  return /^\d{16,22}$/.test(id) ? id : "";
}

function normalizeTicketId(value?) {
  const id = String(value || "").trim();
  return /^[a-f0-9]{24}$/i.test(id) ? id.toLowerCase() : "";
}

function setWebTicketPagePresence(userId?, { ticketId = "", inbox = false } = {}) {
  const uid = normalizeUserId(userId);
  if (!uid) return false;
  presenceByUserId.set(uid, {
    ticketId: normalizeTicketId(ticketId),
    inbox: Boolean(inbox),
    at: Date.now(),
  });
  return true;
}

function clearWebTicketPagePresence(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  presenceByUserId.delete(uid);
}

function shouldSkipWebTicketInAppNotif(_userId?, _ticketId?, _mode?) {
  return false;
}

export = {
  setWebTicketPagePresence,
  clearWebTicketPagePresence,
  shouldSkipWebTicketInAppNotif,
};
