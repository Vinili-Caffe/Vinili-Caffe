/** Resoconti settimanali: chi riceve il resoconto, ordine per ruolo, pex recenti. */
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { toSafeNumber } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { getRomeDateParts, parseRomeWallClock } = require("./resocontoTime") as typeof import("./resocontoTime");

const STAFF_ROLE_PRIORITY = [
  String(IDs.roles.Manager),
  String(IDs.roles.Admin),
  String(IDs.roles.Director),
  String(IDs.roles.SeniorModerator),
  String(IDs.roles.Mod),
  String(IDs.roles.Helper),
];
const RESOCONTO_PM_EXCLUDED_USER_IDS = new Set(
  (Array.isArray(IDs.resocontoExcludePmUserIds) ? IDs.resocontoExcludePmUserIds : [])
    .map((id?) => String(id || "").trim())
    .filter((id?) => /^\d{17,20}$/.test(id)),
);
const RESOCONTO_ROLE_RANK = new Map(
  [
    IDs.roles.Member,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
    IDs.roles.Admin,
    IDs.roles.Manager,
    IDs.roles.Founder,
    IDs.roles.PartnerManager,
  ]
    .filter(Boolean)
    .map((roleId?, index?) => [String(roleId), index]),
);
const ROLE_UP = {
  [String(IDs.roles.Member || "")]: String(IDs.roles.Helper),
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.SeniorModerator),
  [String(IDs.roles.SeniorModerator)]: String(IDs.roles.Director),
  [String(IDs.roles.Director)]: String(IDs.roles.Admin),
  [String(IDs.roles.Admin)]: String(IDs.roles.Manager),
};

function isPmResocontoExcludedUserId(userId?) {
  return RESOCONTO_PM_EXCLUDED_USER_IDS.has(String(userId || "").trim());
}

function resolveStaffRole(member?) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function collectMemberIdsMatchingResocontoStaffSegment(guild?, wantStaffRoleId?) {
  const want = String(wantStaffRoleId || "").trim();
  if (!want || !guild?.members?.cache) return [];
  const ids = [];
  for (const member of guild.members.cache.values()) {
    if (!member || member.user?.bot) continue;
    const resolved = resolveStaffRole(member);
    if (resolved && String(resolved) === want) ids.push(String(member.id));
  }
  return ids;
}

function collectResocontoDiscordMemberIdsForSegment(guild?, segment?) {
  if (segment === "pm") {
    const pmId = String(IDs.roles.PartnerManager || "").trim();
    if (!pmId || !guild?.members?.cache) return [];
    const out = [];
    for (const member of guild.members.cache.values()) {
      if (!member || member.user?.bot) continue;
      if (member.roles?.cache?.has(pmId)) out.push(String(member.id));
    }
    return out;
  }
  if (
    segment === "helper" ||
    segment === "mod" ||
    segment === "senior_moderator" ||
    segment === "director"
  ) {
    const want =
      segment === "helper"
        ? String(IDs.roles.Helper || "").trim()
        : segment === "mod"
          ? String(IDs.roles.Mod || "").trim()
          : segment === "senior_moderator"
            ? String(IDs.roles.SeniorModerator || "").trim()
            : String(IDs.roles.Director || "").trim();
    return collectMemberIdsMatchingResocontoStaffSegment(guild, want);
  }
  return [];
}

function collectAllResocontoRelevantMemberIdsFromGuild(guild?) {
  if (!guild?.members?.cache) return [];
  const ids = new Set();
  const pmId = String(IDs.roles.PartnerManager || "").trim();
  for (const member of guild.members.cache.values()) {
    if (!member || member.user?.bot) continue;
    if (pmId && member.roles?.cache?.has(pmId)) {
      ids.add(String(member.id));
      continue;
    }
    if (resolveStaffRole(member)) ids.add(String(member.id));
  }
  return Array.from(ids);
}

function getResocontoMemberRank(member?) {
  const staffRoleId = resolveStaffRole(member);
  if (staffRoleId) {
    const idx = STAFF_ROLE_PRIORITY.indexOf(String(staffRoleId));
    return idx >= 0 ? idx : 50;
  }
  if (member.roles.cache.has(String(IDs.roles.PartnerManager)))
    return STAFF_ROLE_PRIORITY.length;
  return 999;
}

function compareResocontoMembers(a?, b?) {
  const ra = getResocontoMemberRank(a);
  const rb = getResocontoMemberRank(b);
  if (ra !== rb) return ra - rb;
  const na = String(a.user?.username || a.id).toLowerCase();
  const nb = String(b.user?.username || b.id).toLowerCase();
  return na.localeCompare(nb);
}

function isStaffRolesHistoryPexRow(row?) {
  const kind = String(row?.kind || "").trim().toLowerCase();
  if (kind === "pex") return true;
  if (kind === "depex") return false;
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  const oldRank = RESOCONTO_ROLE_RANK.has(oldRole) ? Number(RESOCONTO_ROLE_RANK.get(oldRole)) : null;
  const newRank = RESOCONTO_ROLE_RANK.has(newRole) ? Number(RESOCONTO_ROLE_RANK.get(newRole)) : null;
  const isRankPromotion =
    oldRank != null &&
    newRank != null &&
    newRole &&
    oldRole &&
    newRole !== oldRole &&
    newRank > oldRank;
  const isMappedPromotion = oldRole && newRole && ROLE_UP[oldRole] === newRole;
  const reasonNorm = String(row?.reason || "").toLowerCase();
  const reasonHasDepex = reasonNorm.includes("depex");
  const reasonHasPex = reasonNorm.includes("pex") && !reasonHasDepex;
  return Boolean(isRankPromotion || isMappedPromotion || reasonHasPex);
}

function wasPexedInWeek(staffDoc?, weekStart?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  return history.some((row?) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    return isStaffRolesHistoryPexRow(row);
  });
}

function wasPexedInResocontoSkipWindow(staffDoc?, windowStart?, windowEndExclusive?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row?) => {
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function wasPmPromotedInResocontoSkipWindow(staffDoc?, windowStart?, windowEndExclusive?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  if (!pmRoleId) return false;
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row?) => {
    if (String(row?.newRole || "") !== pmRoleId) return false;
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function shouldSkipResocontoForPexInCalendarWeek(staffDoc?, windowStart?, windowEndExclusive?) {
  if (!staffDoc) return false;
  return wasPexedInResocontoSkipWindow(staffDoc, windowStart, windowEndExclusive);
}

function wasPexedOnResocontoDay(staffDoc?, referenceNow = new Date()) {
  if (!staffDoc) return false;
  const r = parseRomeWallClock(referenceNow);
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  return history.some((row?) => {
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const parts = getRomeDateParts(when);
    return parts.year === r.year && parts.month === r.month && parts.day === r.day;
  });
}

function wasPmPexedInWeek(staffDoc?, weekStart?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  if (!pmRoleId) return false;
  return history.some((row?) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    return String(row?.newRole || "") === pmRoleId;
  });
}

function wasPromotedToRoleInLastDays(staffDoc?, roleId?, days?, now = new Date()) {
  const targetRoleId = String(roleId || "");
  if (!targetRoleId) return false;
  const safeDays = Math.max(1, Math.floor(toSafeNumber(days)));
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const thresholdMs = now.getTime() - safeDays * 24 * 60 * 60 * 1000;
  return history.some((row?) => {
    if (String(row?.newRole || "") !== targetRoleId) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    return when.getTime() >= thresholdMs;
  });
}

function wasPromotedToRoleInWindow(staffDoc?, roleId?, windowStart?, windowEndExclusive?) {
  const targetRoleId = String(roleId || "");
  if (!targetRoleId || !windowStart || !windowEndExclusive) return false;
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row?) => {
    if (String(row?.newRole || "") !== targetRoleId) return false;
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function wasFirstStaffPromotionFromMemberInWindow(staffDoc?, roleId?, windowStart?, windowEndExclusive?) {
  const memberRoleId = String(IDs.roles.Member || "").trim();
  if (!windowStart || !windowEndExclusive) return false;
  const staffLadderRoleIds = new Set(STAFF_ROLE_PRIORITY.map((id?) => String(id)).filter(Boolean));
  const pmRoleId = String(IDs.roles.PartnerManager || "").trim();
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();

  /* resoNewStaffGrace2: grace SOLO ingresso vero in staff
     - Member → qualsiasi ruolo staff/PM
     - PM → ladder staff (Helper+)
     NON helper→mod / pex interni ladder (quelli restano soggetti ad auto-val limiti). */
  const rowIsNewStaffEntry = (row?) => {
    if (!row) return false;
    const kind = String(row?.kind || "").trim().toLowerCase();
    if (kind === "depex") return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    if (ms < t0 || ms >= t1) return false;
    const newRole = String(row?.newRole || "").trim();
    const oldRole = String(row?.oldRole || "").trim();
    if (!newRole) return false;

    const newIsLadder = staffLadderRoleIds.has(newRole);
    const newIsPm = Boolean(pmRoleId && newRole === pmRoleId);
    if (!newIsLadder && !newIsPm) return false;

    /* helper→mod ecc.: old già in ladder → mai grace */
    if (oldRole && staffLadderRoleIds.has(oldRole)) return false;

    const looksLikePex =
      kind === "pex" ||
      isStaffRolesHistoryPexRow(row) ||
      (memberRoleId && oldRole === memberRoleId) ||
      (pmRoleId && oldRole === pmRoleId && newIsLadder);

    if (!looksLikePex) return false;

    if (memberRoleId && oldRole === memberRoleId) return true;
    if (pmRoleId && oldRole === pmRoleId && newIsLadder) return true;
    return false;
  };

  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  if (history.some(rowIsNewStaffEntry)) return true;
  const track = Array.isArray(staffDoc?.trackHistory) ? staffDoc.trackHistory : [];
  return track.some(rowIsNewStaffEntry);
}

function getPexHistoryRows(staffDoc?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  return history
    .filter((row?) => isStaffRolesHistoryPexRow(row))
    .map((row?) => {
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) return null;
      return {
        oldRole: String(row?.oldRole || ""),
        newRole: String(row?.newRole || ""),
        when,
      };
    })
    .filter(Boolean)
    .sort((a?, b?) => b.when.getTime() - a.when.getTime());
}

function roleLabelById(guild?, roleId?) {
  const id = String(roleId || "");
  if (!id) return "Sconosciuto";
  return guild?.roles?.cache?.get(id)?.name || `<@&${id}>`;
}

export = { STAFF_ROLE_PRIORITY, isPmResocontoExcludedUserId, resolveStaffRole, collectMemberIdsMatchingResocontoStaffSegment, collectResocontoDiscordMemberIdsForSegment, wasPexedInWeek, wasPmPromotedInResocontoSkipWindow, shouldSkipResocontoForPexInCalendarWeek, wasPexedOnResocontoDay, wasPmPexedInWeek, wasPromotedToRoleInWindow, wasFirstStaffPromotionFromMemberInWindow, getPexHistoryRows, roleLabelById };
