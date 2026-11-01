"use strict";

const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { stripDiscordDecorations } = require("../../features/staff/siteStaffRosterCache") as typeof import("../../features/staff/siteStaffRosterCache");

const TRACK_KINDS = new Set([
  "pex",
  "depex",
  "val_pos",
  "val_neg",
  "warn",
  "val_pos_rm",
  "val_neg_rm",
  "warn_rm",
]);

function isHiddenManualStaffCareerReason(reason?) {
  const r = String(reason || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!r) return false;
  if (!/\bmanualmente\b/.test(r)) return false;
    if (/\b(aggiunt[oa]|aggunto|rimoss[oa])\b/.test(r)) return true;
  return /\bruolo\b/.test(r);
}

function actorLabelFromUser(userOrMember?, fallbackId = "") {
  try {
    const u = userOrMember?.user || userOrMember;
    const name =
      String(userOrMember?.displayName || u?.globalName || u?.username || "").trim() ||
      String(fallbackId || u?.id || "").trim();
    return name.slice(0, 128) || null;
  } catch (_) {
    return String(fallbackId || "").trim().slice(0, 128) || null;
  }
}

function normalizeTrackEntry(raw?) {
  const kind = String(raw?.kind || "").trim().toLowerCase();
  if (!TRACK_KINDS.has(kind)) return null;
  const dateRaw = raw?.date != null ? new Date(raw.date) : new Date();
  const date = dateRaw instanceof Date && Number.isFinite(dateRaw.getTime()) ? dateRaw : new Date();
  const entry: Record<string, any> = {
    kind,
    reason: String(raw?.reason || "").trim().slice(0, 500),
    date,
    actorId: String(raw?.actorId || "").trim() || null,
    actorName: String(raw?.actorName || "").trim().slice(0, 128) || null,
  };
  if (raw?.oldRole != null) entry.oldRole = String(raw.oldRole || "").trim() || null;
  if (raw?.newRole != null) entry.newRole = String(raw.newRole || "").trim() || null;
  const entryId = Math.floor(Number(raw?.entryId || 0));
  if (Number.isInteger(entryId) && entryId > 0) entry.entryId = entryId;
  return entry;
}

async function appendStaffTrackHistory(guildId?, userId?, rawEntry?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const entry = normalizeTrackEntry(rawEntry);
  if (!gid || !uid || !/^\d{16,22}$/.test(uid) || !entry) return false;
  try {
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $push: { "staff.trackHistory": entry },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    global.logger?.warn?.("[staffTrackHistory] append failed:", uid, err?.message || err);
    return false;
  }
}

function roleNameFromId(guild?, roleId?) {
  const id = String(roleId || "").trim();
  if (!id) return "—";
  if (guild?.roles?.cache) {
    const role = guild.roles.cache.get(id);
    if (role) return stripDiscordDecorations(role.name) || role.name || id;
  }
  return id;
}

function fingerprint(row?) {
  return [
    String(row.kind || ""),
    String(row.date || "").slice(0, 16),
    String(row.reason || "").slice(0, 80),
    String(row.oldRole || ""),
    String(row.newRole || ""),
    String(row.entryId || ""),
  ].join("|");
}

function buildStaffTrackTimeline(guild?, staff?, { limit = 400 } = {}) {
  const items = [];
  const seen = new Set();

  const push = (row?) => {
    if (!row) return;
    const kind = String(row.kind || "").toLowerCase();
    if ((kind === "pex" || kind === "depex") && isHiddenManualStaffCareerReason(row.reason)) return;
    const fp = fingerprint(row);
    if (seen.has(fp)) return;
    seen.add(fp);
    items.push(row);
  };

  const track = Array.isArray(staff?.trackHistory) ? staff.trackHistory : [];
  for (let i = track.length - 1; i >= 0; i -= 1) {
    const row = track[i];
    if (!row) continue;
    const kind = String(row.kind || "").toLowerCase();
    if (!TRACK_KINDS.has(kind)) continue;
    const date = row.date ? new Date(row.date) : null;
    push({
      kind,
      reason: stripDiscordDecorations(row.reason || "") || null,
      date: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
      actorId: String(row.actorId || "").trim() || null,
      actorName: String(row.actorName || "").trim() || null,
      from: row.oldRole != null ? roleNameFromId(guild, row.oldRole) : null,
      to: row.newRole != null ? roleNameFromId(guild, row.newRole) : null,
      entryId: Number.isInteger(Number(row.entryId)) && Number(row.entryId) > 0 ? Number(row.entryId) : null,
      source: "track",
    });
  }

  const hist = Array.isArray(staff?.rolesHistory) ? staff.rolesHistory : [];
  for (let i = hist.length - 1; i >= 0; i -= 1) {
    const row = hist[i];
    if (!row) continue;
    let kind = String(row.kind || "").toLowerCase();
    if (kind !== "pex" && kind !== "depex") {
      const oldId = String(row.oldRole || "").trim();
      const newId = String(row.newRole || "").trim();
      kind = !newId || newId === "0" ? "depex" : "pex";
    }
    const date = row.date ? new Date(row.date) : null;
    push({
      kind,
      reason: stripDiscordDecorations(row.reason || "") || null,
      date: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
      actorId: String(row.actorId || "").trim() || null,
      actorName: String(row.actorName || "").trim() || null,
      from: roleNameFromId(guild, row.oldRole),
      to: roleNameFromId(guild, row.newRole),
      entryId: null,
      source: "roles",
    });
  }

  function pushValLogs(list?, kind?) {
    const rows = Array.isArray(list) ? list : [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (!row) continue;
      const date = row.createdAt ? new Date(row.createdAt) : null;
      const entryId =
        Number.isInteger(Number(row.sectionId)) && Number(row.sectionId) > 0
          ? Number(row.sectionId)
          : Number.isInteger(Number(row.globalId)) && Number(row.globalId) > 0
            ? Number(row.globalId)
            : i + 1;
      push({
        kind,
        reason: stripDiscordDecorations(row.reason || "") || null,
        date: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
        actorId: String(row.actorId || "").trim() || null,
        actorName: String(row.actorName || "").trim() || null,
        from: null,
        to: null,
        entryId,
        source: "val",
      });
    }
  }
  pushValLogs(staff?.positiveValutazioni, "val_pos");
  pushValLogs(staff?.negativeValutazioni, "val_neg");

    const existingWarnText = new Set(
    items
      .filter((r?) => r && (r.kind === "warn" || r.kind === "warn_rm"))
      .map((r?) => String(r.reason || "").trim().slice(0, 120).toLowerCase())
      .filter(Boolean),
  );
  const warnReasons = Array.isArray(staff?.warnReasons) ? staff.warnReasons : [];
  for (let i = warnReasons.length - 1; i >= 0; i -= 1) {
    const raw = warnReasons[i];
    const reason =
      typeof raw === "string"
        ? stripDiscordDecorations(raw)
        : stripDiscordDecorations(raw?.reason || raw?.text || raw?.motivo || "");
    const key = String(reason || "").trim().slice(0, 120).toLowerCase();
    if (key && existingWarnText.has(key)) continue;
    if (key) existingWarnText.add(key);
    const dateRaw = raw && typeof raw === "object" ? raw.date || raw.createdAt || raw.at : null;
    const date = dateRaw ? new Date(dateRaw) : null;
    push({
      kind: "warn",
      reason: reason || null,
      date: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
      actorId: String(raw?.actorId || "").trim() || null,
      actorName: String(raw?.actorName || "").trim() || null,
      from: null,
      to: null,
      entryId: i + 1,
      source: "warn",
    });
  }

  function timelineSortKey(row?) {
    const dated = String(row?.date || "").trim();
    if (dated) return dated;
    const kind = String(row?.kind || "").toLowerCase();
    // Undated active warns must stay visible (localeCompare("") buried them under old vals).
    if (kind === "warn") {
      const id = Math.max(0, Math.floor(Number(row?.entryId) || 0));
      return `9999-12-31T23:59:${String(Math.min(59, id)).padStart(2, "0")}.000Z`;
    }
    return "";
  }

  items.sort((a?, b?) => timelineSortKey(b).localeCompare(timelineSortKey(a)));
  return items.slice(0, Math.max(1, Math.min(800, Number(limit) || 400)));
}

export = {
  actorLabelFromUser,
  appendStaffTrackHistory,
  buildStaffTrackTimeline,
  isHiddenManualStaffCareerReason,
};
