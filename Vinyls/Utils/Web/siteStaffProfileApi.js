const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const {
  accountUsername,
  memberDisplayName,
  userAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlForSite,
  discordDefaultAvatarUrl,
} = require("../Discord/guildDiscordIdentity");
const { summarizeModActionsByModWindows } = require("../Moderation/modCaseStore");
const {
  computeConsumedPauseDays,
  getBasePauseLimit,
  getStaffPauseBonusDaysTotal,
  getValPosTradedPauseBonusDays,
  computeStaffPauseDayBudget,
  getBestStaffWeekPauseBonusDaysRemaining,
  getPausePhase,
  getPauseStatusLabel,
  getTodayUtc,
  parseItalianDate,
  PAUSE_ROLE_STAFF,
  PAUSE_ROLE_PM,
  roleChoiceAppliesTo,
} = require("../Pause/pauseHandlersUtils");
const {
  resolveStaffProfileKind,
  buildFullProfileRoleLabelForEmbed,
  buildStaffProfileRoleBadges,
  resolveStaffProfileDisplayRoleId,
  viewerIsFounder,
  targetIsFounder,
  PROFILE_FULL,
  PROFILE_PM_ONLY,
  PROFILE_PROSPECT,
} = require("../Staff/staffProfilePanelRuntime");
const { resolvePartnerPointsShown, resolvePartnerTotalEarned } = require("../Staff/partnerPointsDisplayUtils");
const { applyPronounGenderToTextForMember } = require("../Community/pronounGenderUtils");
const { resolveSerataFilmAttendanceForWeek } = require("../Staff/serataFilmAttendanceUtils");
const { loadLegacyStaffByUserIds, mergeStaffEmbedded } = require("../Staff/staffLegacyMerge");
const { isHiddenManualStaffCareerReason } = require("../Staff/staffTrackHistory");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const {
  fetchWebsiteGuildMember,
  readCachedWebsiteMember,
  clearWebsiteMemberCaches,
} = require("./websiteGuildMemberFetch");
const { memberIsHighStaffEligible } = require("./siteStaffDashboardApi");

const PROFILE_CACHE_TTL_MS = 120_000;
const PROFILE_STALE_CACHE_MS = 45 * 60 * 1000;
const PROFILE_CACHE_MAX = 200;
const profileCache = new Map();
/* careerPinRecentPex2: ultimo pex Helper = qualsiasi →Helper (anche PM→Helper); niente Member→Helper stale */
const PROFILE_PAYLOAD_VERSION = 25;
const STAFF_MEMBER_SOFT_TIMEOUT_MS = 8000;
const STAFF_MEMBER_HARD_TIMEOUT_MS = 14000;
const STAFF_LEGACY_SOFT_TIMEOUT_MS = 350;

function stripDiscordDecorations(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function profileCacheKey(viewerUserId, targetUserId) {
  const guild = String(IDs.guilds.main || "");
  const target = String(targetUserId || "").trim();
  const viewer = String(viewerUserId || "").trim();
  if (!target) return "";
  if (viewer && viewer !== target) {
    return `v${PROFILE_PAYLOAD_VERSION}:${guild}:${viewer}->${target}`;
  }
  return `v${PROFILE_PAYLOAD_VERSION}:${guild}:${target}`;
}

function readProfileCache(viewerUserId, targetUserId) {
  const key = profileCacheKey(viewerUserId, targetUserId);
  if (!key) return null;
  const entry = profileCache.get(key);
  if (!entry || !entry.payload) return null;
  if (Number(entry.exp || 0) <= Date.now()) return null;
  return entry.payload;
}

function readStaleProfileCache(viewerUserId, targetUserId) {
  const key = profileCacheKey(viewerUserId, targetUserId);
  if (!key) return null;
  const entry = profileCache.get(key);
  if (!entry || !entry.payload) return null;
  const age = Date.now() - Number(entry.writtenAt || 0);
  if (!Number.isFinite(age) || age > PROFILE_STALE_CACHE_MS) return null;
  return { ...entry.payload, cached: true, stale: true };
}

/* peerProfileTimeout1: se Discord timeout, riusa qualsiasi payload fresco per lo stesso target
   (anche cache di un altro viewer) così i peer-switch non restano vuoti. */
function readAnyStaleProfileCacheForTarget(targetUserId) {
  const uid = String(targetUserId || "").trim();
  if (!uid) return null;
  const guild = String(IDs.guilds.main || "");
  const prefix = `v${PROFILE_PAYLOAD_VERSION}:${guild}:`;
  let best = null;
  for (const [key, entry] of profileCache) {
    if (!entry?.payload?.ok || entry.payload.prospect) continue;
    if (!String(key || "").startsWith(prefix)) continue;
    if (!(key === `${prefix}${uid}` || key.endsWith(`->${uid}`))) continue;
    const age = Date.now() - Number(entry.writtenAt || 0);
    if (!Number.isFinite(age) || age > PROFILE_STALE_CACHE_MS) continue;
    if (!best || age < best.age) best = { age, payload: entry.payload };
  }
  return best ? { ...best.payload, cached: true, stale: true } : null;
}

async function warmStaffRosterMembers(client, preferUserId) {
  try {
    const { getCachedStaffRoster } = require("./siteStaffRosterCache");
    await Promise.race([
      getCachedStaffRoster(client).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 2800)),
    ]);
  } catch (_) {}
  const uid = String(preferUserId || "").trim();
  if (!uid) return null;
  return readCachedWebsiteMember(uid) || null;
}

function writeProfileCache(viewerUserId, targetUserId, payload) {
  const key = profileCacheKey(viewerUserId, targetUserId);
  if (!key) return;
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const first = profileCache.keys().next().value;
    if (first) profileCache.delete(first);
  }
  profileCache.set(key, {
    exp: Date.now() + PROFILE_CACHE_TTL_MS,
    writtenAt: Date.now(),
    payload,
  });
}

function clearStaffProfileCacheForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    const prefix = `v${PROFILE_PAYLOAD_VERSION}:${String(IDs.guilds.main || "")}:`;
    for (const key of profileCache.keys()) {
      if (key === `${prefix}${uid}` || key.endsWith(`->${uid}`) || key.startsWith(`${prefix}${uid}->`)) {
        profileCache.delete(key);
      }
    }
  } catch (e) {}
}

function recentReasonLines(list, limit = 5) {
  if (!Array.isArray(list) || !list.length) return [];
  const out = [];
  for (let i = list.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const raw = list[i];
    const text =
      typeof raw === "string"
        ? stripDiscordDecorations(raw)
        : stripDiscordDecorations(raw?.reason || raw?.text || raw?.motivo || "");
    if (text) out.push(text);
  }
  return out;
}

function indexedReasonLines(list, limit = 80) {
  if (!Array.isArray(list) || !list.length) return [];
  const out = [];
  const start = Math.max(0, list.length - limit);
  for (let i = start; i < list.length; i += 1) {
    const raw = list[i];
    const text =
      typeof raw === "string"
        ? stripDiscordDecorations(raw)
        : stripDiscordDecorations(raw?.reason || raw?.text || raw?.motivo || "");
    out.push({
      id: i + 1,
      text: text || `(voce #${i + 1})`,
    });
  }
  return out.reverse();
}

function toIsoDay(date) {
  if (!date || !(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolvePauseSnapshot(staffObj, profileKind) {
  const allPauses = Array.isArray(staffObj?.pauses) ? staffObj.pauses : [];
  const pauses =
    profileKind === PROFILE_PM_ONLY
      ? allPauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto))
      : allPauses;

  let active = null;
  let planned = null;
  let recentlyReturned = null;
  for (const p of pauses) {
    if (!p || String(p.status || "") !== "accepted") continue;
    const phase = getPausePhase(p.dataRichiesta, p.dataRitorno);
    if (phase === "active") {
      if (!active) active = p;
      continue;
    }
    if (phase === "planned") {
      if (!planned) planned = p;
      continue;
    }
    if (phase === "ended") {
      const end = parseItalianDate(p.dataRitorno);
      if (!end) continue;
      const ageMs = Date.now() - end.getTime();
      if (ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) {
        if (!recentlyReturned || end > parseItalianDate(recentlyReturned.dataRitorno)) {
          recentlyReturned = p;
        }
      }
    }
  }

  if (active) {
    return {
      phase: "active",
      statusLine: `In pausa fino al ${String(active.dataRitorno || "").trim()}`,
      start: String(active.dataRichiesta || "").trim() || null,
      end: String(active.dataRitorno || "").trim() || null,
      motivazione: stripDiscordDecorations(active.motivazione || "") || null,
    };
  }
  if (planned) {
    return {
      phase: "planned",
      statusLine: `Pausa programmata dal ${String(planned.dataRichiesta || "").trim()} al ${String(planned.dataRitorno || "").trim()}`,
      start: String(planned.dataRichiesta || "").trim() || null,
      end: String(planned.dataRitorno || "").trim() || null,
      motivazione: stripDiscordDecorations(planned.motivazione || "") || null,
    };
  }
  if (recentlyReturned) {
    return {
      phase: "recently_returned",
      statusLine: `Rientrato/a il ${String(recentlyReturned.dataRitorno || "").trim()}`,
      start: String(recentlyReturned.dataRichiesta || "").trim() || null,
      end: String(recentlyReturned.dataRitorno || "").trim() || null,
      motivazione: null,
    };
  }
  return {
    phase: "none",
    statusLine: "Nessuna pausa in corso",
    start: null,
    end: null,
    motivazione: null,
  };
}

function serializePauseHistory(staffObj, profileKind, limit = 48) {
  const today = getTodayUtc();
  const allPauses = Array.isArray(staffObj?.pauses) ? staffObj.pauses : [];
  const pauses =
    profileKind === PROFILE_PM_ONLY
      ? allPauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto))
      : allPauses;

  const rows = pauses
    .filter((p) => p && ["accepted", "pending", "cancelled", "rejected"].includes(String(p.status || "")))
    .map((p) => {
      const start = parseItalianDate(p.dataRichiesta);
      const end = parseItalianDate(p.dataRitorno);
      return {
        start: String(p.dataRichiesta || "").trim(),
        end: String(p.dataRitorno || "").trim(),
        startIso: toIsoDay(start),
        endIso: toIsoDay(end),
        status: String(p.status || ""),
        statusLabel: getPauseStatusLabel(p, today),
        phase: getPausePhase(p.dataRichiesta, p.dataRitorno),
        motivazione: stripDiscordDecorations(p.motivazione || "") || null,
        ruolo: String(p.ruolo || p.ruoloRichiesto || "").trim() || null,
        _sort: start ? start.getTime() : 0,
      };
    })
    .sort((a, b) => b._sort - a._sort)
    .slice(0, limit)
    .map(({ _sort, ...rest }) => rest);

  return rows;
}

function humanizeRoleKey(key) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

let _roleIdRemapCache = null;
function loadRoleIdRemap() {
  if (_roleIdRemapCache) return _roleIdRemapCache;
  try {
    const fs = require("fs");
    const path = require("path");
    const fp = path.join(__dirname, "../../Data/roleIdRemap.emergency.json");
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    const forward = raw?.idRemap && typeof raw.idRemap === "object" ? raw.idRemap : {};
    const reverse = {};
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

function resolveCanonicalRoleId(roleId) {
  const raw = String(roleId || "").trim();
  if (!/^\d{16,22}$/.test(raw)) return raw;
  const { forward } = loadRoleIdRemap();
  const mapped = String(forward[raw] || "").trim();
  return mapped && /^\d{16,22}$/.test(mapped) ? mapped : raw;
}

function roleKeyFromId(roleId) {
  const raw = resolveCanonicalRoleId(roleId);
  const roles = IDs.roles || {};
  for (const [key, val] of Object.entries(roles)) {
    if (String(val) === raw) return key;
  }
  return null;
}

function roleNameFromId(guild, roleIdOrName) {
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

function normalizeCareerRoleToken(value) {
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

function careerDayKey(iso) {
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

function preferCareerRow(a, b) {
  const aLen = String(a?.newRole || "").length + String(a?.oldRole || "").length;
  const bLen = String(b?.newRole || "").length + String(b?.oldRole || "").length;
  if (bLen !== aLen) return bLen > aLen ? b : a;
  return a;
}

function isOnStaffCareerLadder(token) {
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

function isPartnerManagerRole(token) {
  return token === "partner manager";
}

/* careerPinRecentPex2: scala attuale + ultimo pex PM + ultimo pex →Helper (anche da PM) */
function isCareerTrackRole(token) {
  return isOnStaffCareerLadder(token) || isPartnerManagerRole(token);
}

function isOutsideStaffCareerLadder(token) {
  return !isOnStaffCareerLadder(token);
}

function isPexToPartnerManager(from, to) {
  return isPartnerManagerRole(to) && !isPartnerManagerRole(from);
}

function isPexToHelper(from, to) {
  /* Ultimo arrivo a Helper: Member→Helper o PM→Helper (non restare su Helper→Helper). */
  return to === "helper" && from !== "helper";
}

function rowCareerTokens(row) {
  return {
    to: normalizeCareerRoleToken(row?.newRole || row?.to),
    from: normalizeCareerRoleToken(row?.oldRole || row?.from),
  };
}

function sliceLatestStaffLadderStint(chrono, opts = {}) {
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

function pinLatestCareerPexRows(chrono) {
  let lastPm = null;
  let lastHelper = null;
  for (let i = 0; i < chrono.length; i += 1) {
    const { to, from } = rowCareerTokens(chrono[i]);
    if (isPexToPartnerManager(from, to)) lastPm = chrono[i];
    if (isPexToHelper(from, to)) lastHelper = chrono[i];
  }
  return [lastPm, lastHelper].filter(Boolean);
}

function mergeCareerRowSets(sets) {
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

function slicePartnerManagerCareer(rows, opts = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const stillActive = Boolean(opts.stillActive);
  const chrono = rows.slice().sort((a, b) => (a._sort || 0) - (b._sort || 0));
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
  return kept.sort((a, b) => (b._sort || 0) - (a._sort || 0));
}

function sliceToLatestCareerStart(rows, opts = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const stillActive = Boolean(opts.stillActive);
  const currentRole = normalizeCareerRoleToken(opts.currentRole || "");
  if (isPartnerManagerRole(currentRole) || opts.track === "pm") {
    return slicePartnerManagerCareer(rows, opts);
  }
  const chrono = rows.slice().sort((a, b) => (a._sort || 0) - (b._sort || 0));
  /* careerPinRecentPex2: scala staff attuale + pin ultimo pex PM + ultimo pex →Helper */
  const scala = sliceLatestStaffLadderStint(chrono, { stillActive });
  const pins = pinLatestCareerPexRows(chrono);
  const merged = mergeCareerRowSets([scala, pins]);
  if (!merged.length) {
    if (!stillActive) return [];
    return [];
  }
  return merged.sort((a, b) => (b._sort || careerRowSortMsFallback(b)) - (a._sort || careerRowSortMsFallback(a)));
}

function careerRowSortMsFallback(row) {
  const iso = row?.dateIso || row?.date || row?._iso;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function dedupeCareerHistoryRows(rows) {
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

function serializeRolesHistory(guild, staffObj, limit = 20, opts = {}) {
  const stillActive = Boolean(opts.stillActive);
  const currentRole = opts.currentRole || "";
  const hist = Array.isArray(staffObj?.rolesHistory) ? staffObj.rolesHistory : [];
  const mapped = hist
    .filter((row) => !isHiddenManualStaffCareerReason(row?.reason))
    .map((row) => {
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
    .sort((a, b) => b._sort - a._sort);
  const currentCareer = sliceToLatestCareerStart(mapped, {
    stillActive,
    currentRole,
    track: opts.track,
  });
  return dedupeCareerHistoryRows(currentCareer)
    .slice(0, limit)
    .map(({ _sort, ...rest }) => rest);
}

function resolveTenureIso(staffObj, opts = {}) {
  const hist = Array.isArray(staffObj?.rolesHistory) ? staffObj.rolesHistory : [];
  const mapped = hist
    .filter((row) => !isHiddenManualStaffCareerReason(row?.reason))
    .map((row) => {
      const d = row?.date ? new Date(row.date) : null;
      const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
      return {
        oldRole: String(row?.oldRole || ""),
        newRole: String(row?.newRole || ""),
        _sort: iso ? new Date(iso).getTime() : 0,
        _iso: iso,
      };
    });
    const withNames = mapped.map((row) => ({
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

function formatTenureLabel(iso) {
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

const MODSTATS_BUDGET_MS = 250;

async function buildModstatsWithBudget(guildId, userId) {
  try {
    return await Promise.race([
      buildModstats(guildId, userId),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), MODSTATS_BUDGET_MS);
      }),
    ]);
  } catch {
    return null;
  }
}

async function buildModstats(guildId, userId) {
  const buckets = await summarizeModActionsByModWindows(guildId, userId);
  const pack = (windowKey) => {
    const mute = Number(buckets.MUTE?.[windowKey]) || 0;
    const ban = Number(buckets.BAN?.[windowKey]) || 0;
    const kick = Number(buckets.KICK?.[windowKey]) || 0;
    const warn = Number(buckets.WARN?.[windowKey]) || 0;
    return {
      mute,
      ban,
      kick,
      warn,
      total: mute + ban + kick + warn,
    };
  };
  return {
    d7: pack("d7"),
    d30: pack("d30"),
    all: pack("all"),
  };
}

async function resolveStaffProfileAvatarUrl(client, guild, member, user, userId) {
  const uid = String(userId || "").trim();
  if (!uid) return discordDefaultAvatarUrl(null, { size: 256 });

  let avatarSubject = member;
  let targetUser = member?.user || user || null;

  // avatarAnimRestore1: preferisci GIF sito (guild → user), non PNG embed-static.
  const fromSite = guildMemberDisplayAvatarUrlForSite(avatarSubject || targetUser, {
    size: 256,
    preferAnimated: true,
  });
  if (fromSite) return fromSite;

  const fromMember =
    avatarSubject?.avatar != null && avatarSubject.avatar !== ""
      ? userAvatarUrlDynamic(avatarSubject, { size: 256 })
      : null;
  if (fromMember) return fromMember;

  const fromUser = userAvatarUrlDynamic(targetUser || avatarSubject, { size: 256 });
  if (fromUser) return fromUser;

  return discordDefaultAvatarUrl(targetUser || { id: uid }, { size: 256 });
}

function buildProspectPexOptions(viewerMember) {
  const founder = viewerIsFounder(viewerMember);
  const staffRoles = [
    { action: "pex_helper", label: "Helper", hint: "Pex → Helper" },
  ];
  if (founder) {
    staffRoles.push(
      { action: "pex_mod", label: "Moderator", hint: "Pex → Moderator" },
      { action: "pex_senior_moderator", label: "Senior Moderator", hint: "Pex → Senior Moderator" },
      { action: "pex_director", label: "Director", hint: "Pex → Director" },
      { action: "pex_admin", label: "Admin", hint: "Pex → Admin" },
      { action: "pex_manager", label: "Manager", hint: "Pex → Manager" },
    );
  }
  return {
    staff: staffRoles.filter((r) => {
      if (r.action === "pex_helper") return Boolean(IDs.roles?.Helper);
      if (r.action === "pex_mod") return Boolean(IDs.roles?.Mod);
      if (r.action === "pex_senior_moderator") return Boolean(IDs.roles?.SeniorModerator);
      if (r.action === "pex_director") return Boolean(IDs.roles?.Director);
      if (r.action === "pex_admin") return Boolean(IDs.roles?.Admin);
      if (r.action === "pex_manager") return Boolean(IDs.roles?.Manager);
      return false;
    }),
    pm: IDs.roles?.PartnerManager
      ? { action: "pex_pm", label: "Partner Manager", hint: "Member → Partner Manager" }
      : null,
    viewerIsFounder: founder,
  };
}

async function buildProspectProfilePayloadForWeb(client, member, user, viewerMember) {
  const guildId = String(IDs.guilds.main || member?.guild?.id || "").trim();
  const userId = String(member?.id || user?.id || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "no_guild", message: "Guild principale non configurata." };
  }
  const guild = member.guild || client.guilds.cache.get(guildId) || null;
  let targetUser = member?.user || user || null;
  if (!targetUser?.avatar && typeof targetUser?.displayAvatarURL !== "function" && client?.users?.fetch) {
    targetUser = (await client.users.fetch(userId).catch(() => null)) || targetUser;
  }
  const username = accountUsername(targetUser) || accountUsername(member) || userId;
  const displayName = memberDisplayName(member, targetUser) || username;
  const avatarUrl = await resolveStaffProfileAvatarUrl(client, guild, member, targetUser, userId);
  const avatarHash = String(targetUser?.avatar || member?.user?.avatar || "").trim();
  return {
    ok: true,
    prospect: true,
    canProspectPex: true,
    identity: {
      userId,
      username,
      displayName,
      avatarUrl,
      ...(avatarHash ? { avatar: avatarHash } : {}),
    },
    pexOptions: buildProspectPexOptions(viewerMember),
  };
}

async function buildStaffProfilePayloadForWeb(client, member, user, opts = {}) {
  const guildId = String(IDs.guilds.main || member?.guild?.id || "").trim();
  const userId = String(member?.id || user?.id || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "no_guild", message: "Guild principale non configurata." };
  }

  const guild = member.guild || client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  let targetUser = member?.user || user || null;
    const username = accountUsername(targetUser) || accountUsername(member) || userId;
  const displayName = memberDisplayName(member, targetUser) || username;

  const profileKind = resolveStaffProfileKind(member);
  if (profileKind === PROFILE_PROSPECT) {
    if (opts.allowProspectPex && opts.viewerMember) {
      return buildProspectProfilePayloadForWeb(client, member, targetUser, opts.viewerMember);
    }
    return {
      ok: false,
      status: 403,
      error: "not_staff_profile",
      message: "Non hai un profilo staff attivo.",
    };
  }

    const showModstats = profileKind === PROFILE_FULL;
  const avatarPromise = resolveStaffProfileAvatarUrl(client, guild, member, targetUser, userId);
  const modstatsPromise = showModstats ? buildModstatsWithBudget(guildId, userId) : Promise.resolve(null);
  const activityPromise = ActivityUserProfile.findOne({ guildId, userId })
    .select("staff")
    .lean()
    .catch(() => null);
  const legacyPromise = Promise.race([
    loadLegacyStaffByUserIds(guildId, [userId]).catch(() => new Map()),
    new Promise((resolve) => setTimeout(() => resolve(new Map()), STAFF_LEGACY_SOFT_TIMEOUT_MS)),
  ]);
  const dbPromise = Promise.all([activityPromise, legacyPromise]);

  const pmRoleId = String(IDs.roles.PartnerManager || "").trim();
  const isPm = Boolean(pmRoleId && member.roles?.cache?.has(pmRoleId));
  const isFounder = targetIsFounder(member);
  const displayRoleId = resolveStaffProfileDisplayRoleId(member);
  const displayRole = displayRoleId ? guild?.roles?.cache?.get(displayRoleId) : null;
  let roleLabel = "—";
  let roleBadges = [];
  if (profileKind === PROFILE_PM_ONLY) {
    roleLabel = displayRole?.name || guild?.roles?.cache?.get(pmRoleId)?.name || "Partner Manager";
    roleBadges = [
      {
        kind: "pm",
        icon: "fa-handshake-o",
        label: roleLabel,
        color:
          displayRole?.hexColor && displayRole.hexColor !== "#000000"
            ? displayRole.hexColor
            : "#e8c49c",
        roleId: pmRoleId || null,
      },
    ];
  } else {
    roleBadges = buildStaffProfileRoleBadges(guild, member);
    roleLabel = buildFullProfileRoleLabelForEmbed(guild, member);
  }
  roleLabel = stripDiscordDecorations(roleLabel) || roleLabel;
  roleBadges = roleBadges.map((b) => ({
    kind: b.kind || "staff",
    icon: b.icon || "fa-shield",
    label: stripDiscordDecorations(b.label) || b.label || "—",
    color: b.color || "#d4a888",
    roleId: b.roleId || null,
  }));
  const roleColor =
    displayRole?.hexColor && displayRole.hexColor !== "#000000"
      ? displayRole.hexColor
      : "#d4a888";

  const [[doc, legacyMap], avatarUrl, modstats] = await Promise.all([
    dbPromise,
    avatarPromise,
    modstatsPromise,
  ]);
  const staff = mergeStaffEmbedded(doc?.staff || {}, legacyMap.get(userId) || null);

  const pauseRole = profileKind === PROFILE_PM_ONLY ? PAUSE_ROLE_PM : PAUSE_ROLE_STAFF;
  const budget = computeStaffPauseDayBudget(member, doc || { staff }, pauseRole);
  const baseLimit = budget.baseLimit;
  const bonus = budget.annualBonus + budget.weekRemaining;
  const tradedBonus = getValPosTradedPauseBonusDays(doc || { staff });
  const weekBonus = budget.weekRemaining;
  const maxDays = Math.max(0, budget.maxGiorni);
  const usedDays = Math.max(0, budget.usedDays);
  const remainingDays = Math.max(0, budget.remaining);
  const pauseSnap = resolvePauseSnapshot(staff, profileKind);
  if (pauseSnap?.statusLine) {
    pauseSnap.statusLine = applyPronounGenderToTextForMember(pauseSnap.statusLine, member);
  }

  const pos = Math.max(0, Math.floor(Number(staff.positiveCount || 0)));
  const neg = Math.max(0, Math.floor(Number(staff.negativeCount || 0)));
  const warns = Math.max(0, Math.floor(Number(staff.warnCount || 0)));

  const careerCurrentRole =
    profileKind === PROFILE_PM_ONLY
      ? displayRole?.name || guild?.roles?.cache?.get(pmRoleId)?.name || "Partner Manager"
      : displayRole?.name || roleLabel || null;
  const tenureIso = resolveTenureIso(staff, {
    currentRole: careerCurrentRole,
    track: profileKind === PROFILE_PM_ONLY ? "pm" : "staff",
  });

  let serataFilm = null;
  if (profileKind === PROFILE_FULL) {
    const sf = resolveSerataFilmAttendanceForWeek(staff);
    if (sf) {
      serataFilm = {
        willAttend: Boolean(sf.willAttend),
        label: sf.willAttend ? "Presente alla Serata Film di sabato" : "Non segnato / assente alla Serata Film",
        editable: Boolean(sf.editable),
        saturdayKey: sf.saturdayKey || null,
      };
    }
  }

  return {
    ok: true,
    status: 200,
    version: PROFILE_PAYLOAD_VERSION,
    identity: {
      userId,
      displayName,
      username,
      avatarUrl,
      ...(String(targetUser?.avatar || member?.user?.avatar || "").trim()
        ? { avatar: String(targetUser?.avatar || member?.user?.avatar || "").trim() }
        : {}),
    },
    role: {
      label: roleLabel,
      badges: roleBadges,
      kind: profileKind === PROFILE_PM_ONLY ? "pm_only" : "full",
      isPm,
      isFounder,
      color: roleColor,
      roleId: displayRoleId || null,
    },
    pause: {
      ...pauseSnap,
      quota: {
        used: usedDays,
        max: maxDays,
        remaining: remainingDays,
        bonus,
        base: baseLimit,
        tradedBonus,
        weekBonus,
      },
      history: serializePauseHistory(staff, profileKind, 48),
      pendingCount: Math.max(
        0,
        (
          profileKind === PROFILE_PM_ONLY
            ? (Array.isArray(staff?.pauses) ? staff.pauses : []).filter((p) =>
                roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto),
              )
            : Array.isArray(staff?.pauses)
              ? staff.pauses
              : []
        ).filter((p) => p && String(p.status || "").toLowerCase() === "pending").length,
      ),
      calendarPath: "/staff/pause/",
    },
    valutazioni: {
      positive: pos,
      negative: neg,
      recentPositive: recentReasonLines(staff.positiveReasons, 5),
      recentNegative: recentReasonLines(staff.negativeReasons, 5),
      positiveEntries: indexedReasonLines(staff.positiveReasons, 80),
      negativeEntries: indexedReasonLines(staff.negativeReasons, 80),
    },
    warn: {
      count: warns,
      recent: recentReasonLines(staff.warnReasons, 5),
      entries: indexedReasonLines(staff.warnReasons, 80),
    },
    partner: isPm
      ? (() => {
          /* Punti PM = saldo spendibile (earned − spesi), non il totale guadagnato.
             Altrimenti rimuovi/aggiungi punti non muove la card (solo Spesi in shop). */
          const points = Math.max(0, Math.floor(Number(resolvePartnerPointsShown(staff) || 0)));
          const pointsEarned = Math.max(0, Math.floor(Number(resolvePartnerTotalEarned(staff) || 0)));
          const partnerCount = Math.max(0, Math.floor(Number(staff.partnerCount || 0)));
          const redeemSpend = Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0)));
          const { buildPmShopCatalogForWeb } = require("./siteStaffPmShopApi");
          return {
            points,
            pointsEarned,
            partnerCount,
            redeemSpend,
            shop: buildPmShopCatalogForWeb(points, { member, lean: { staff } }),
          };
        })()
      : null,
    modstats,
    serataFilm,
    career: {
      tenure: tenureIso
        ? {
            sinceIso: tenureIso,
            label: formatTenureLabel(tenureIso),
          }
        : null,
      rolesHistory: serializeRolesHistory(guild, staff, 20, {
        stillActive: profileKind === PROFILE_FULL || profileKind === PROFILE_PM_ONLY,
        currentRole: careerCurrentRole,
        track: profileKind === PROFILE_PM_ONLY ? "pm" : "staff",
      }),
      currentRole: careerCurrentRole,
    },
  };
}

async function handleSiteStaffProfileGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const viewerUserId = String(access.member?.id || access.user?.id || "").trim();
    const requestedUserId = String(req.query?.userId || req.query?.id || "").trim();
    const targetUserId =
      requestedUserId && /^\d{17,20}$/.test(requestedUserId) ? requestedUserId : viewerUserId;
    const isSelf = targetUserId === viewerUserId;
    const wantFresh =
      String(req.query?.fresh || req.query?.nocache || "").trim() === "1" ||
      String(req.query?.fresh || req.query?.nocache || "").trim().toLowerCase() === "true";
    if (wantFresh) {
      clearStaffProfileCacheForUser(targetUserId);
      clearWebsiteMemberCaches(targetUserId);
    }

    const cached = wantFresh ? null : readProfileCache(viewerUserId, targetUserId);
    if (cached) {
      res.setHeader("Cache-Control", "private, max-age=15");
      return res.status(200).json({ ...cached, cached: true });
    }

    let targetMember = access.member;
    let targetUser = access.member?.user || access.user || null;
            if (!isSelf) {
      const guildId = String(IDs.guilds.main || access.member?.guild?.id || "").trim();
      const guild =
        access.member?.guild ||
        client.guilds.cache.get(guildId) ||
        (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) {
        return res.status(503).json({
          ok: false,
          error: "guild_unavailable",
          message: "Server Discord temporaneamente non disponibile.",
        });
      }
      /* peerProfileTimeout1: warm roster (riempie guild.members.cache) prima del fetch peer */
      const warmed = wantFresh ? null : await warmStaffRosterMembers(client, targetUserId);
      const cachedMember = wantFresh
        ? null
        : guild.members.cache.get(targetUserId) ||
          readCachedWebsiteMember(targetUserId) ||
          warmed ||
          null;
            if (cachedMember) {
        targetMember = cachedMember;
      } else {
        // Soft probe first (no negative-cache poison). Fresh/Riprova skips straight to hard+force.
        if (!wantFresh) {
          targetMember = await fetchWebsiteGuildMember(guild, targetUserId, {
            timeoutMs: STAFF_MEMBER_SOFT_TIMEOUT_MS,
            retry: true,
            soft: true,
          }).catch(() => null);
        }
                if (!targetMember) {
          // Await a longer resolve before 503 — fire-and-forget left peer switches empty.
          targetMember = await fetchWebsiteGuildMember(guild, targetUserId, {
            timeoutMs: STAFF_MEMBER_HARD_TIMEOUT_MS,
            retry: true,
            soft: true,
            force: Boolean(wantFresh),
          }).catch(() => null);
        }
      }
      if (!targetMember) {
        const { isOnNegativeCache, isUnknownMemberError } = require("./websiteGuildMemberFetch");
        /* leaveProfileLive1: known leave / unknown member → not staff (no stale paint) */
        if (isOnNegativeCache(targetUserId)) {
          return res.status(404).json({
            ok: false,
            error: "not_in_guild",
            message: "Questo utente non è più nel server.",
          });
        }
        /* One hard force resolve before declaring left vs Discord timeout. */
        const forced = await fetchWebsiteGuildMember(guild, targetUserId, {
          timeoutMs: STAFF_MEMBER_HARD_TIMEOUT_MS,
          retry: true,
          soft: false,
          force: true,
        }).catch((err) => {
          if (isUnknownMemberError(err)) return null;
          return undefined;
        });
        if (forced) {
          targetMember = forced;
        } else if (forced === null || isOnNegativeCache(targetUserId)) {
          return res.status(404).json({
            ok: false,
            error: "not_in_guild",
            message: "Questo utente non è più nel server.",
          });
        } else {
          const stale =
            readStaleProfileCache(viewerUserId, targetUserId) ||
            readAnyStaleProfileCacheForTarget(targetUserId);
          if (stale) {
            res.setHeader("Cache-Control", "private, max-age=5");
            return res.status(200).json({
              ...stale,
              isSelf: false,
              viewerUserId,
              targetUserId,
            });
          }
          return res.status(503).json({
            ok: false,
            error: "member_unavailable",
            message: "Discord non risponde: riprova tra pochi secondi.",
          });
        }
      }
      targetUser = targetMember.user || null;
    }

    const payload = await buildStaffProfilePayloadForWeb(client, targetMember, targetUser, {
      allowProspectPex: !isSelf && memberIsHighStaffEligible(access.member),
      viewerMember: access.member,
    });
    if (!payload.ok) {
      return res.status(Number(payload.status) || 403).json(payload);
    }

    if (!isSelf) {
      payload.isSelf = false;
      payload.viewerUserId = viewerUserId;
      payload.targetUserId = targetUserId;
      if (payload.serataFilm) payload.serataFilm.editable = false;
    } else {
      payload.isSelf = true;
      payload.viewerUserId = viewerUserId;
      payload.targetUserId = targetUserId;
    }

    /* profilePendingBadges1: count pending legati alle card (pause / resoconti / punti tolti). */
    try {
      const guildId = String(IDs.guilds?.main || targetMember?.guild?.id || "").trim();
      const uid = String(targetUserId || "").trim();
      if (guildId && uid) {
        const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
        const WORKFLOW_DOC = SITE_DOCUMENT_TYPE.STAFF_WORKFLOW;
        let weekKey = "";
        try {
          const { getResocontoCycleWeekKey } = require("../../Services/Staff/weeklyStaffResocontoService");
          weekKey = String(getResocontoCycleWeekKey() || "").trim();
        } catch (_) {
          weekKey = "";
        }
        const resoFilter = {
          docType: WORKFLOW_DOC,
          guildId,
          workflowQueue: "resoconti",
          status: "pending",
          userId: uid,
        };
        if (weekKey) resoFilter.workflowWeekKey = weekKey;

        const tasks = [
          SiteDocument.countDocuments(resoFilter).catch(() => 0),
        ];
        if (payload.partner) {
          const { SitePmPointsRemovedEntry } = require("../../Schemas/Web/sitePmPointsRemovedSchemas");
          tasks.push(
            SitePmPointsRemovedEntry.countDocuments({
              guildId,
              pmUserId: uid,
              status: "pending",
            }).catch(() => 0),
          );
        } else {
          tasks.push(Promise.resolve(0));
        }
        const [resoPending, ptPending] = await Promise.all(tasks);
        payload.resoconto = {
          ...(payload.resoconto && typeof payload.resoconto === "object" ? payload.resoconto : {}),
          pendingCount: Math.max(0, Math.floor(Number(resoPending) || 0)),
          weekKey: weekKey || null,
        };
        if (payload.partner) {
          payload.partner.pendingPuntiTolti = Math.max(0, Math.floor(Number(ptPending) || 0));
        }
      }
    } catch (errPend) {
      global.logger?.warn?.("[WEBHOOK] site-staff-profile pending badges:", errPend?.message || errPend);
    }

    writeProfileCache(viewerUserId, targetUserId, payload);
    res.setHeader("Cache-Control", "private, max-age=15");
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-profile:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffProfileGet,
  buildStaffProfilePayloadForWeb,
  clearStaffProfileCacheForUser,
};
