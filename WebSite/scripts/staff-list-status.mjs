// Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const botIds = require(path.join(ROOT, "..", "Vinyls", "Utils", "Config", "ids.js"));

const STAFF_NEW_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STAFF_LIST_ROLE_IDS = [
  botIds.roles?.PartnerManager,
  botIds.roles?.Helper,
  botIds.roles?.Mod,
  botIds.roles?.SeniorModerator,
  botIds.roles?.Director,
  botIds.roles?.Admin,
  botIds.roles?.Manager,
  botIds.roles?.Founder,
]
  .map((id) => String(id || "").trim())
  .filter(Boolean);
const STAFF_LIST_ROLE_ID_SET = new Set(STAFF_LIST_ROLE_IDS);
const MEMBER_ROLE_ID = String(botIds.roles?.Member || "").trim();
const PM_ROLE_ID = String(botIds.roles?.PartnerManager || "").trim();
const HIGH_STAFF_ROLE_ID = String(botIds.roles?.HighStaff || "").trim();
const STAFF_GENERIC_ROLE_ID = String(botIds.roles?.Staff || "").trim();

function emptyFlags() {
  return { paused: new Set(), newRolesByUser: new Map() };
}

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let day = null;
  let month = null;
  let year = null;
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function getTodayUtcRome() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (year && month && day) return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function pausePhase(startRaw, endRaw, today) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  if (!start || !end) return "active";
  if (today < start) return "planned";
  if (today > end) return "ended";
  return "active";
}

function hasActiveAcceptedStaffPause(pauses, today) {
  if (!Array.isArray(pauses)) return false;
  return pauses.some((pause) => {
    if (!pause || pause.status !== "accepted") return false;
    return pausePhase(pause.dataRichiesta, pause.dataRitorno, today) === "active";
  });
}

function userPreviouslyHeldStaffListRole(history, roleId, beforeWhen) {
  const rid = String(roleId || "").trim();
  if (!rid) return false;
  const beforeMs = beforeWhen instanceof Date ? beforeWhen.getTime() : Number(beforeWhen);
  if (!Number.isFinite(beforeMs)) return false;
  return (Array.isArray(history) ? history : []).some((row) => {
    if (String(row?.newRole || "").trim() !== rid) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    return when.getTime() < beforeMs;
  });
}

function rowQualifiesForStaffListNewBadge(row, history = []) {
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  if (!newRole || !STAFF_LIST_ROLE_ID_SET.has(newRole)) return false;
  const when = row?.date ? new Date(row.date) : null;
  if (when && !Number.isNaN(when.getTime()) && userPreviouslyHeldStaffListRole(history, newRole, when)) {
    return false;
  }
  const fromMember = MEMBER_ROLE_ID && oldRole === MEMBER_ROLE_ID;
  const oldWasStaffForPm =
    oldRole &&
    oldRole !== PM_ROLE_ID &&
    (STAFF_LIST_ROLE_ID_SET.has(oldRole) ||
      (HIGH_STAFF_ROLE_ID && oldRole === HIGH_STAFF_ROLE_ID) ||
      (STAFF_GENERIC_ROLE_ID && oldRole === STAFF_GENERIC_ROLE_ID));
  const staffToPm = newRole === PM_ROLE_ID && oldWasStaffForPm;
  const pmToStaffLadder =
    oldRole === PM_ROLE_ID && newRole !== PM_ROLE_ID && STAFF_LIST_ROLE_ID_SET.has(newRole);
  const ontoStaffListFromNonListRole =
    oldRole && !STAFF_LIST_ROLE_ID_SET.has(oldRole) && newRole !== PM_ROLE_ID;
  return Boolean(fromMember || staffToPm || pmToStaffLadder || ontoStaffListFromNonListRole);
}

function tryRequireMongoose() {
  const candidates = [path.join(ROOT, "..", "node_modules", "mongoose"), "mongoose"];
  for (const p of candidates) {
    try {
      return require(p);
    } catch {
          }
  }
  return null;
}

export async function fetchStaffListStatusFlags(guildId) {
  const gid = String(guildId || "").trim();
  const mongoUrl = String(
    process.env.MONGO_URL ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URL_LOCAL ||
      process.env.MONGODB_URI_LOCAL ||
      "",
  ).trim();
  if (!gid || !mongoUrl) {
    if (gid && !mongoUrl) console.warn("[build-site] Staff badge: manca MONGO_URL, salto nuovo/pausa.");
    return emptyFlags();
  }
  const mongoose = tryRequireMongoose();
  if (!mongoose) {
    console.warn("[build-site] Staff badge: mongoose non trovato, salto nuovo/pausa.");
    return emptyFlags();
  }
  const owned = mongoose.connection.readyState !== 1;
  try {
    if (owned) {
      await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection.db;
    if (!db) return emptyFlags();
    const docs = await db
      .collection("activityuserprofiles")
      .find(
        { guildId: gid, staff: { $exists: true } },
        { projection: { userId: 1, "staff.rolesHistory": 1, "staff.pauses": 1 } },
      )
      .toArray();
    const today = getTodayUtcRome();
    const cutoff = Date.now() - STAFF_NEW_DAYS_MS;
    const paused = new Set();
    const newRolesByUser = new Map();
    for (const doc of docs || []) {
      const uid = String(doc?.userId || "").trim();
      if (!uid) continue;
      if (hasActiveAcceptedStaffPause(doc?.staff?.pauses, today)) paused.add(uid);
      const history = Array.isArray(doc?.staff?.rolesHistory) ? doc.staff.rolesHistory : [];
      for (const row of history) {
        const when = row?.date ? new Date(row.date) : null;
        if (!when || Number.isNaN(when.getTime()) || when.getTime() < cutoff) continue;
        if (!rowQualifiesForStaffListNewBadge(row, history)) continue;
        const nr = String(row?.newRole || "");
        if (!STAFF_LIST_ROLE_ID_SET.has(nr)) continue;
        if (!newRolesByUser.has(uid)) newRolesByUser.set(uid, new Set());
        newRolesByUser.get(uid).add(nr);
      }
    }
    return { paused, newRolesByUser };
  } catch (err) {
    console.warn("[build-site] Staff badge Mongo:", err?.message || err);
    return emptyFlags();
  } finally {
    if (owned && mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => null);
    }
  }
}
