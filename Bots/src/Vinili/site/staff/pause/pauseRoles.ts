/** Pause: ruoli in pausa e limiti per ruolo. */
const { ActivityUserProfile } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { parseItalianDate, rangesOverlap } = require("./pauseDates") as typeof import("./pauseDates");

const STAFF_ROLE_PRIORITY = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.HighStaff,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
  IDs.roles.PartnerManager,
].filter(Boolean);

const PAUSE_ROLE_LIMITS = {
  Helper: 2,
  Mod: 2,
  "Senior Moderator": 2,
  SeniorModerator: 2,
  Director: 1,
  HighStaff: 1,
  Admin: 1,
  Manager: 1,
  Founder: 1,
  Staff: null,
  PartnerManager: null,
};
const PAUSE_ROLE_STAFF = "Staff";
const PAUSE_ROLE_PM = "PartnerManager";
const PAUSE_ROLE_BOTH = "Entrambi";
const STAFF_RANK_LIMIT_KEY_BY_ROLE_ID = {
  [String(IDs.roles.Helper || "")]: "Helper",
  [String(IDs.roles.Mod || "")]: "Mod",
  [String(IDs.roles.SeniorModerator || "")]: "SeniorModerator",
  [String(IDs.roles.HighStaff || "")]: "HighStaff",
  [String(IDs.roles.Director || "")]: "Director",
  [String(IDs.roles.Admin || "")]: "Admin",
  [String(IDs.roles.Manager || "")]: "Manager",
  [String(IDs.roles.Founder || "")]: "Founder",
  [String(IDs.roles.Staff || "")]: "Staff",
  [String(IDs.roles.PartnerManager || "")]: "PartnerManager",
};

async function computeStaffersInPauseByRoleForRange(guildId?, roleLabel?, rangeStartRaw?, rangeEndRaw?, excludeUserId = null) {
  const targetStart = parseItalianDate(rangeStartRaw);
  const targetEnd = parseItalianDate(rangeEndRaw);
  if (!targetStart || !targetEnd) return 0;

  const g = String(guildId ?? "").trim();
  if (!g) return 0;
  const excluded = String(excludeUserId ?? "").trim();
  const docs = await ActivityUserProfile.find({ guildId: g, staff: { $exists: true } }, { userId: 1, "staff.pauses": 1 })
    .lean()
    .catch(() => []);
  const userIds = new Set();

  for (const doc of docs) {
    if (excluded && String(doc?.userId ?? "").trim() === excluded) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const hasOverlap = pauses.some((pause?) => {
      if (!pause || pause.status !== "accepted") return false;
      if (!roleChoiceAppliesTo(roleLabel, pause.ruolo)) return false;
      const pStart = parseItalianDate(pause.dataRichiesta);
      const pEnd = parseItalianDate(pause.dataRitorno);
      return rangesOverlap(targetStart, targetEnd, pStart, pEnd);
    });
    if (hasOverlap && doc?.userId) userIds.add(String(doc.userId));
  }

  return userIds.size;
}

function getMemberStaffRankRoleId(member?) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    const id = String(roleId || "").trim();
    if (id && member.roles.cache.has(id)) return id;
  }
  return null;
}

function getStaffRankLimitKey(rankRoleId?) {
  const id = String(rankRoleId || "").trim();
  if (!id) return null;
  return STAFF_RANK_LIMIT_KEY_BY_ROLE_ID[id] || null;
}

function resolvePauseStaffRankRoleId(member?, pause?) {
  const live = getMemberStaffRankRoleId(member);
  if (live) return live;
  const stored = String(pause?.ruoloGradeId || "").trim();
  return stored || null;
}

async function computeStaffersInPauseByStaffRankForRange(
  guild?,
  guildId?,
  targetRankRoleId?,
  rangeStartRaw?,
  rangeEndRaw?,
  excludeUserId = null,
  pauseTrack = PAUSE_ROLE_STAFF,
) {
  const targetRank = String(targetRankRoleId || "").trim();
  if (!targetRank) return 0;
  const track = normalizePauseRoleChoice(pauseTrack) || PAUSE_ROLE_STAFF;
  const targetStart = parseItalianDate(rangeStartRaw);
  const targetEnd = parseItalianDate(rangeEndRaw);
  if (!targetStart || !targetEnd) return 0;

  const g = String(guildId ?? guild?.id ?? "").trim();
  if (!g) return 0;
  const excluded = String(excludeUserId ?? "").trim();
  const docs = await ActivityUserProfile.find({ guildId: g, staff: { $exists: true } }, { userId: 1, "staff.pauses": 1 })
    .lean()
    .catch(() => []);

  const candidates = [];
  for (const doc of docs) {
    const uid = String(doc?.userId ?? "").trim();
    if (!uid || (excluded && uid === excluded)) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const matching = pauses.find((pause?) => {
      if (!pause || pause.status !== "accepted") return false;
      if (!roleChoiceAppliesTo(track, pause.ruolo)) return false;
      const pStart = parseItalianDate(pause.dataRichiesta);
      const pEnd = parseItalianDate(pause.dataRitorno);
      return rangesOverlap(targetStart, targetEnd, pStart, pEnd);
    });
    if (matching) candidates.push({ userId: uid, pause: matching });
  }
  if (!candidates.length) return 0;

  let matched = 0;
  for (const { userId, pause } of candidates) {
    let member = guild?.members?.cache?.get(userId) || null;
    if (!member && guild?.members?.fetch) {
      member = await guild.members.fetch(userId).catch(() => null);
    }
    const rankId = resolvePauseStaffRankRoleId(member, pause);
    if (rankId && rankId === targetRank) matched += 1;
  }
  return matched;
}

function getMemberRoleLabel(member?) {
  if (!member?.roles?.cache) return "Staff";
  for (const roleId of STAFF_ROLE_PRIORITY) {
    const role = member.roles.cache.get(roleId);
    if (role) return role.name;
  }
  return "Staff";
}

function normalizePauseRoleChoice(raw?) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "staff") return PAUSE_ROLE_STAFF;
  if (value === "pm" || value === "partnermanager" || value === "partner_manager") return PAUSE_ROLE_PM;
  if (value === "entrambi" || value === "both") return PAUSE_ROLE_BOTH;
  return null;
}

function getMemberPauseRoleChoices(member?) {
  const hasStaff = Boolean(member?.roles?.cache?.has(IDs.roles.Staff));
  const hasPm = Boolean(member?.roles?.cache?.has(IDs.roles.PartnerManager));
  if (hasStaff && hasPm) return [PAUSE_ROLE_PM, PAUSE_ROLE_STAFF, PAUSE_ROLE_BOTH];
  if (hasStaff) return [PAUSE_ROLE_STAFF];
  if (hasPm) return [PAUSE_ROLE_PM];
  return [];
}

function getPauseRoleTargets(roleChoice?, member?) {
  const normalized = normalizePauseRoleChoice(roleChoice);
  if (normalized === PAUSE_ROLE_STAFF) return [PAUSE_ROLE_STAFF];
  if (normalized === PAUSE_ROLE_PM) return [PAUSE_ROLE_PM];
  if (normalized === PAUSE_ROLE_BOTH) return [PAUSE_ROLE_STAFF, PAUSE_ROLE_PM];
  const fallback = getMemberPauseRoleChoices(member);
  if (fallback.includes(PAUSE_ROLE_STAFF) && fallback.includes(PAUSE_ROLE_PM)) return [PAUSE_ROLE_STAFF];
  if (fallback.includes(PAUSE_ROLE_STAFF)) return [PAUSE_ROLE_STAFF];
  if (fallback.includes(PAUSE_ROLE_PM)) return [PAUSE_ROLE_PM];
  return [PAUSE_ROLE_STAFF];
}

function roleChoiceAppliesTo(baseRole?, pauseRoleChoice?) {
  const role = normalizePauseRoleChoice(baseRole);
  const pause = normalizePauseRoleChoice(pauseRoleChoice);
  if (!role || !pause) return false;
  if (pause === PAUSE_ROLE_BOTH) return role === PAUSE_ROLE_STAFF || role === PAUSE_ROLE_PM;
  return role === pause;
}

/** pauseBothSplit1: stessa finestra già accettata sull'altro track → non riscalare i giorni */
function hasSiblingAcceptedPauseSameRange(pauses?, targetPause?) {
  const tid = String(targetPause?._id || targetPause?.id || "").trim();
  const start = String(targetPause?.dataRichiesta || "").trim();
  const end = String(targetPause?.dataRitorno || "").trim();
  if (!start || !end) return false;
  return (Array.isArray(pauses) ? pauses : []).some((p?) => {
    if (!p || String(p.status || "") !== "accepted") return false;
    if (tid && String(p._id || "") === tid) return false;
    /* pauseHalfDay1: mattina e pomeriggio dello stesso giorno non sono la stessa pausa */
    if (String(p.halfDay || "") !== String(targetPause?.halfDay || "")) return false;
    return String(p.dataRichiesta || "").trim() === start && String(p.dataRitorno || "").trim() === end;
  });
}

function getPauseRoleLimit(roleLabel?) {
  if (!roleLabel || typeof roleLabel !== "string") return null;
  const key = roleLabel.trim();
  if (Object.prototype.hasOwnProperty.call(PAUSE_ROLE_LIMITS, key))
    return PAUSE_ROLE_LIMITS[key];
  return null;
}

function getBasePauseLimit(member?, requestedRole = null) {
  const targets = getPauseRoleTargets(requestedRole, member);
  const values = targets.map((t?) => (t === PAUSE_ROLE_PM ? 45 : 60));
  return values.length ? Math.max(...values) : 60;
}

export = { PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH, computeStaffersInPauseByRoleForRange, getMemberStaffRankRoleId, getStaffRankLimitKey, resolvePauseStaffRankRoleId, computeStaffersInPauseByStaffRankForRange, getMemberRoleLabel, normalizePauseRoleChoice, getMemberPauseRoleChoices, getPauseRoleTargets, roleChoiceAppliesTo, hasSiblingAcceptedPauseSameRange, getPauseRoleLimit, getBasePauseLimit };
