/** Profilo staff: carriera nello staff (pex e depex, anzianità). */
const { viniliPath } = require("../../core/paths") as typeof import("../../core/paths");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { isHiddenManualStaffCareerReason } = require("../../Utils/Staff/staffTrackHistory") as typeof import("../../Utils/Staff/staffTrackHistory");
const { stripDiscordDecorations } = require("./staffProfilePauses") as typeof import("./staffProfilePauses");

function humanizeRoleKey(key?) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

let _roleIdRemapCache = null;
function loadRoleIdRemap() {
  if (_roleIdRemapCache) return _roleIdRemapCache;
  try {
    const fs = require("fs") as typeof import("fs");
    const fp = viniliPath("Data", "roleIdRemap.emergency.json");
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    const forward = raw?.idRemap && typeof raw.idRemap === "object" ? raw.idRemap : {};
    const reverse: Record<string, any> = {};
    for (const [oldId, newId] of Object.entries(forward)) {
      const o = String(oldId || "").trim();
      const n = String(newId || "").trim();
      if (o && n) reverse[n] = o;
    }
    _roleIdRemapCache = { forward, reverse };
  } catch (_) {
    _roleIdRemapCache = { forward: {}, reverse: {} };
  }
  return _roleIdRemapCache;
}

function resolveCanonicalRoleId(roleId?) {
  const raw = String(roleId || "").trim();
  if (!/^\d{16,22}$/.test(raw)) return raw;
  const { forward } = loadRoleIdRemap();
  const mapped = String(forward[raw] || "").trim();
  return mapped && /^\d{16,22}$/.test(mapped) ? mapped : raw;
}

function roleKeyFromId(roleId?) {
  const raw = resolveCanonicalRoleId(roleId);
  const roles = IDs.roles || {};
  for (const [key, val] of Object.entries(roles)) {
    if (String(val) === raw) return key;
  }
  return null;
}

function roleNameFromId(guild?, roleIdOrName?) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw || raw === "—" || raw === "-") return "—";
  if (!/^\d{16,22}$/.test(raw)) {
    return stripDiscordDecorations(raw) || raw;
  }
  const canonical = resolveCanonicalRoleId(raw);
  const live =
    guild?.roles?.cache?.get(canonical)?.name || guild?.roles?.cache?.get(raw)?.name;
  if (live) return stripDiscordDecorations(live) || live;
  const key = roleKeyFromId(canonical) || roleKeyFromId(raw);
  if (key) {
    const label = humanizeRoleKey(key);
    return label || raw;
  }
  return raw;
}

function normalizeCareerRoleToken(value?) {
  let s = stripDiscordDecorations(String(value || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!s) return "";
  if (/^\d{16,22}$/.test(s)) {
    const key = roleKeyFromId(s);
    if (key) {
      s = humanizeRoleKey(key).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }
  }
  const aliases = {
    mod: "moderator",
    mods: "moderator",
    moderator: "moderator",
    "senior moderator": "senior moderator",
    "sr moderator": "senior moderator",
    srmod: "senior moderator",
    "senior mod": "senior moderator",
    helper: "helper",
    "trial helper": "helper",
    "partner manager": "partner manager",
    pm: "partner manager",
    director: "director",
    admin: "admin",
    manager: "manager",
    founder: "founder",
    member: "member",
  };
  if (aliases[s]) return aliases[s];
  if (s.endsWith("s") && aliases[s.slice(0, -1)]) return aliases[s.slice(0, -1)];
  return s;
}

function careerDayKey(iso?) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function preferCareerRow(a?, b?) {
  const aLen = String(a?.newRole || "").length + String(a?.oldRole || "").length;
  const bLen = String(b?.newRole || "").length + String(b?.oldRole || "").length;
  if (bLen !== aLen) return bLen > aLen ? b : a;
  return a;
}

function isOnStaffCareerLadder(token?) {
  if (!token) return false;
  if (token === "member" || token === "community" || token === "partner manager") return false;
  const ladder = new Set([
    "helper",
    "moderator",
    "senior moderator",
    "director",
    "admin",
    "manager",
    "founder",
  ]);
  return ladder.has(token);
}

function isPartnerManagerRole(token?) {
  return token === "partner manager";
}

function isOutsideStaffCareerLadder(token?) {
  return !isOnStaffCareerLadder(token);
}

function isPexToPartnerManager(from?, to?) {
  return isPartnerManagerRole(to) && !isPartnerManagerRole(from);
}

function isPexToHelper(from?, to?) {
  /* Ultimo arrivo a Helper: Member→Helper o PM→Helper (non restare su Helper→Helper). */
  return to === "helper" && from !== "helper";
}

function rowCareerTokens(row?) {
  return {
    to: normalizeCareerRoleToken(row?.newRole || row?.to),
    from: normalizeCareerRoleToken(row?.oldRole || row?.from),
  };
}

function sliceLatestStaffLadderStint(chrono?, opts: Record<string, any> = {}) {
  const stillActive = Boolean(opts.stillActive);
  if (!Array.isArray(chrono) || !chrono.length) return [];
  let startIdx = 0;
  let found = false;
  let onLadder = false;
  for (let i = 0; i < chrono.length; i += 1) {
    const { to, from } = rowCareerTokens(chrono[i]);
    const toOn = isOnStaffCareerLadder(to);
    const fromOut = isOutsideStaffCareerLadder(from);
    if (toOn && (fromOut || !onLadder)) {
      startIdx = i;
      found = true;
      onLadder = true;
      continue;
    }
    if (onLadder && !toOn) onLadder = false;
  }
  if (!found) {
    if (!stillActive) return [];
    return [];
  }
  if (!onLadder && !stillActive) return [];
  const kept = [];
  for (let i = startIdx; i < chrono.length; i += 1) {
    const { to, from } = rowCareerTokens(chrono[i]);
    if (isOnStaffCareerLadder(to) || isOnStaffCareerLadder(from)) {
      kept.push(chrono[i]);
    }
  }
  return kept;
}

function pinLatestCareerPexRows(chrono?) {
  let lastPm = null;
  let lastHelper = null;
  for (let i = 0; i < chrono.length; i += 1) {
    const { to, from } = rowCareerTokens(chrono[i]);
    if (isPexToPartnerManager(from, to)) lastPm = chrono[i];
    if (isPexToHelper(from, to)) lastHelper = chrono[i];
  }
  return [lastPm, lastHelper].filter(Boolean);
}

function mergeCareerRowSets(sets?) {
  const out = [];
  const seen = new Set();
  for (const rows of sets) {
    for (const row of rows || []) {
      if (!row) continue;
      const { to, from } = rowCareerTokens(row);
      const day = careerDayKey(row.dateIso || row.date || row._iso || "");
      const key = `${day}|${from}|${to}|${String(row.reason || "").toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

function slicePartnerManagerCareer(rows?, opts: Record<string, any> = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const stillActive = Boolean(opts.stillActive);
  const chrono = rows.slice().sort((a?, b?) => (a._sort || 0) - (b._sort || 0));
  let startIdx = 0;
  let onPm = false;
  let found = false;
  for (let i = 0; i < chrono.length; i += 1) {
    const to = normalizeCareerRoleToken(chrono[i]?.newRole);
    const from = normalizeCareerRoleToken(chrono[i]?.oldRole);
    if (isPartnerManagerRole(to) && !isPartnerManagerRole(from)) {
      startIdx = i;
      found = true;
      onPm = true;
      continue;
    }
    if (onPm && isPartnerManagerRole(from) && !isPartnerManagerRole(to)) {
      onPm = false;
    }
  }
  if (!found) {
    if (!stillActive) return [];
        return [];
  }
  if (!onPm && !stillActive) return [];

  const kept = [];
  for (let i = startIdx; i < chrono.length; i += 1) {
    const to = normalizeCareerRoleToken(chrono[i]?.newRole);
    const from = normalizeCareerRoleToken(chrono[i]?.oldRole);
    if (isPartnerManagerRole(to)) {
      kept.push(chrono[i]);
      continue;
    }
        if (isPartnerManagerRole(from) && !isPartnerManagerRole(to)) break;
  }
  return kept.sort((a?, b?) => (b._sort || 0) - (a._sort || 0));
}

function sliceToLatestCareerStart(rows?, opts: Record<string, any> = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const stillActive = Boolean(opts.stillActive);
  const currentRole = normalizeCareerRoleToken(opts.currentRole || "");
  const track = String(opts.track || "").trim().toLowerCase();
  /* careerStaffPmFix1: Staff+PM ha track "staff" ma currentRole display = PM.
     Non forzare slice PM-only: serve scala staff + pin PM. Solo pm_only → track pm. */
  const forcePmOnly =
    track === "pm" || (isPartnerManagerRole(currentRole) && track !== "staff");
  if (forcePmOnly) {
    return slicePartnerManagerCareer(rows, opts);
  }
  const chrono = rows.slice().sort((a?, b?) => (a._sort || 0) - (b._sort || 0));
  /* careerPinRecentPex2: scala staff attuale + pin ultimo pex PM + ultimo pex →Helper */
  const scala = sliceLatestStaffLadderStint(chrono, { stillActive });
  const pins = pinLatestCareerPexRows(chrono);
  let merged = mergeCareerRowSets([scala, pins]);
  if (!merged.length) {
    /* Dual Staff+PM senza rung ladder: mostra almeno stint PM */
    const pmFallback = slicePartnerManagerCareer(rows, opts);
    if (pmFallback.length) return pmFallback;
    return [];
  }
  return merged.sort((a?, b?) => (b._sort || careerRowSortMsFallback(b)) - (a._sort || careerRowSortMsFallback(a)));
}

function careerRowSortMsFallback(row?) {
  const iso = row?.dateIso || row?.date || row?._iso;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function dedupeCareerHistoryRows(rows?) {
  const out = [];
  const seen = new Map();
  for (const row of rows) {
    const day = careerDayKey(row?.dateIso);
    const from = normalizeCareerRoleToken(row?.oldRole);
    const to = normalizeCareerRoleToken(row?.newRole);
    const reason = stripDiscordDecorations(row?.reason || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const tripKey = from && to ? `${day}|${from}|${to}` : "";
    const key = `${day}|${from}|${to}|${reason}`;
    if (!from && !to) {
      out.push(row);
      continue;
    }
        if (tripKey && seen.has(tripKey)) {
      const idx = seen.get(tripKey);
      out[idx] = preferCareerRow(out[idx], row);
      continue;
    }
    if (seen.has(key)) {
      const idx = seen.get(key);
      out[idx] = preferCareerRow(out[idx], row);
      continue;
    }
        const softKey = `${day}|*|${to}|${reason}`;
    if (to && reason && seen.has(softKey)) {
      const idx = seen.get(softKey);
      out[idx] = preferCareerRow(out[idx], row);
      continue;
    }
    const idx = out.length;
    if (tripKey) seen.set(tripKey, idx);
    seen.set(key, idx);
    if (to && reason) seen.set(softKey, idx);
    out.push(row);
  }
  return out;
}

/* careerRetentionMerge1: come organico — rolesHistory + retention + track pex/depex.
   Dopo archive (leave/depex) lo storico può restare solo in staffRolesHistoryRetention. */
function mergeStaffCareerHistoryRows(staffObj?, retentionRows?) {
  const fromStaff = Array.isArray(staffObj?.rolesHistory) ? staffObj.rolesHistory : [];
  const fromRetention = Array.isArray(retentionRows) ? retentionRows : [];
  const fromTrack = (Array.isArray(staffObj?.trackHistory) ? staffObj.trackHistory : [])
    .filter((row?) => {
      const k = String(row?.kind || "").toLowerCase();
      return k === "pex" || k === "depex";
    })
    .map((row?) => ({
      kind: String(row.kind || "").toLowerCase(),
      oldRole: row.oldRole,
      newRole: row.newRole,
      reason: row.reason,
      date: row.date,
      actorId: row.actorId,
      actorName: row.actorName,
    }));
  return fromStaff.concat(fromRetention).concat(fromTrack);
}

function serializeRolesHistory(guild?, staffObj?, limit = 20, opts: Record<string, any> = {}) {
  const stillActive = Boolean(opts.stillActive);
  const currentRole = opts.currentRole || "";
  const hist = mergeStaffCareerHistoryRows(staffObj, opts.retentionRows);
  const mapped = hist
    .filter((row?) => !isHiddenManualStaffCareerReason(row?.reason))
    .map((row?) => {
      const d = row?.date ? new Date(row.date) : null;
      const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
      return {
        oldRole: roleNameFromId(guild, row?.oldRole),
        newRole: roleNameFromId(guild, row?.newRole),
        reason: stripDiscordDecorations(row?.reason || "") || null,
        dateIso: iso,
        dateLabel: iso ? formatTenureLabel(iso) : null,
        _sort: iso ? new Date(iso).getTime() : 0,
      };
    })
    .sort((a?, b?) => b._sort - a._sort);
  const currentCareer = sliceToLatestCareerStart(mapped, {
    stillActive,
    currentRole,
    track: opts.track,
  });
  return dedupeCareerHistoryRows(currentCareer)
    .slice(0, limit)
    .map(({ _sort, ...rest }) => rest);
}

function resolveTenureIso(staffObj?, opts: Record<string, any> = {}) {
  const hist = mergeStaffCareerHistoryRows(staffObj, opts.retentionRows);
  const mapped = hist
    .filter((row?) => !isHiddenManualStaffCareerReason(row?.reason))
    .map((row?) => {
      const d = row?.date ? new Date(row.date) : null;
      const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
      return {
        oldRole: String(row?.oldRole || ""),
        newRole: String(row?.newRole || ""),
        _sort: iso ? new Date(iso).getTime() : 0,
        _iso: iso,
      };
    });
    const withNames = mapped.map((row?) => ({
    ...row,
    oldRole: normalizeCareerRoleToken(row.oldRole) || row.oldRole,
    newRole: normalizeCareerRoleToken(row.newRole) || row.newRole,
  }));
  const current = sliceToLatestCareerStart(withNames, {
    stillActive: true,
    currentRole: opts.currentRole || "",
    track: opts.track,
  });
  if (!current.length) return null;
    let earliest = null;
  for (const row of current) {
    if (!row?._iso) continue;
    const d = new Date(row._iso);
    if (!Number.isFinite(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest ? earliest.toISOString() : null;
}

function formatTenureLabel(iso?) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Rome",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export = { serializeRolesHistory, resolveTenureIso, formatTenureLabel };
