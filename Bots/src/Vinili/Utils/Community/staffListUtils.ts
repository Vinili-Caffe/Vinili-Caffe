const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const STAFF_NEW_EMOJI = "<:VC_New:1471891729471770819>";
const STAFF_PAUSE_EMOJI = "<:VC_PausedStatus:1482527157283455086>";
const STAFF_NEW_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Ordine inserimento: Blogger prima → reverse in roster mette Blogger in coda (dopo PM). */
const ROLE_EMOJIS = {
  [IDs.roles.Blogger]: { emoji: "📝" },
  [IDs.roles.PartnerManager]: { emoji: "<:VC_PartnerManager:1494286911286808576>" },
  [IDs.roles.Helper]: { emoji: "<:VC_Helper:1502328751638450426>" },
  [IDs.roles.Mod]: { emoji: "<:VC_Mod:1494287597952958514>" },
  [IDs.roles.SeniorModerator]: { emoji: "<:VC_SeniorModerator:1494286913744539648>" },
  [IDs.roles.Director]: { emoji: "<:VC_Director:1494286915778641941>" },
  [IDs.roles.Admin]: { emoji: "<:VC_Admin:1494286848686686209>" },
  [IDs.roles.Manager]: { emoji: "<:VC_Manager:1521629610876338307>" },
  [IDs.roles.Founder]: { emoji: "<:VC_Founder:1494286918974963732>" },
};

const STAFF_LIST_SECTION_ROLE_IDS = Object.keys(ROLE_EMOJIS);
const HIGH_STAFF_ROLE_ID = String(IDs.roles.HighStaff || "").trim();
const BLOGGER_ROLE_ID = String(IDs.roles.Blogger || "").trim();
/** Ruoli operativi (pause, resoconti, accessi staff): senza Blogger. */
const STAFF_ROLE_IDS_BASE = STAFF_LIST_SECTION_ROLE_IDS.filter((id?) => String(id) !== BLOGGER_ROLE_ID);
const STAFF_ROLE_IDS =
  HIGH_STAFF_ROLE_ID && !STAFF_ROLE_IDS_BASE.includes(HIGH_STAFF_ROLE_ID)
    ? [...STAFF_ROLE_IDS_BASE, HIGH_STAFF_ROLE_ID]
    : [...STAFF_ROLE_IDS_BASE];
const STAFF_LIST_ROLE_ID_SET = new Set(STAFF_LIST_SECTION_ROLE_IDS.map((id?) => String(id)));
const MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const PM_ROLE_ID = String(IDs.roles.PartnerManager || "");
const STAFF_GENERIC_ROLE_ID = String(IDs.roles.Staff || "");

function memberHasStaffRole(member?) {
  return STAFF_ROLE_IDS.some((roleId?) => member?.roles?.cache?.has?.(roleId));
}

function memberIsBlogger(member?) {
  return Boolean(BLOGGER_ROLE_ID && member?.roles?.cache?.has?.(BLOGGER_ROLE_ID));
}

/** Organico / live roster: ladder+PM+Blogger (display), non privilegi operativi. */
function memberOnStaffList(member?) {
  return memberHasStaffRole(member) || memberIsBlogger(member);
}

function didStaffMembershipChange(oldMember?, newMember?) {
  return memberHasStaffRole(oldMember) !== memberHasStaffRole(newMember);
}

function didStaffListDisplayRolesChange(oldMember?, newMember?) {
  const oldStaffIds = new Set(STAFF_LIST_SECTION_ROLE_IDS.filter((id?) => oldMember?.roles?.cache?.has?.(id)));
  const newStaffIds = new Set(STAFF_LIST_SECTION_ROLE_IDS.filter((id?) => newMember?.roles?.cache?.has?.(id)));
  if (oldStaffIds.size !== newStaffIds.size) return true;
  for (const id of oldStaffIds) if (!newStaffIds.has(id)) return true;
  for (const id of newStaffIds) if (!oldStaffIds.has(id)) return true;
  return false;
}

function userPreviouslyHeldStaffListRole(history?, roleId?, beforeWhen?) {
  const rid = String(roleId || "").trim();
  if (!rid) return false;
  const beforeMs = beforeWhen instanceof Date ? beforeWhen.getTime() : Number(beforeWhen);
  if (!Number.isFinite(beforeMs)) return false;
  const rows = Array.isArray(history) ? history : [];
  return rows.some((row?) => {
    if (String(row?.newRole || "").trim() !== rid) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    return when.getTime() < beforeMs;
  });
}

function rowQualifiesForStaffListNewBadge(row?, history = []) {
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

  return fromMember || staffToPm || pmToStaffLadder || ontoStaffListFromNonListRole;
}

async function getStaffListNewBadgeRoleIdsByUser(guildId?) {
  const cutoff = Date.now() - STAFF_NEW_DAYS_MS;
  const docs = await ActivityUserProfile.find(
    { guildId: String(guildId), staff: { $exists: true } },
    { userId: 1, "staff.rolesHistory": 1 },
  )
    .lean()
    .catch(() => []);

  const out = new Map();
  for (const doc of docs || []) {
    const uid = doc?.userId != null ? String(doc.userId) : "";
    if (!uid) continue;
    const history = Array.isArray(doc?.staff?.rolesHistory) ? doc.staff.rolesHistory : [];
    for (const row of history) {
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) continue;
      if (when.getTime() < cutoff) continue;
      if (!rowQualifiesForStaffListNewBadge(row, history)) continue;
      const nr = String(row?.newRole || "");
      if (!STAFF_LIST_ROLE_ID_SET.has(nr)) continue;
      if (!out.has(uid)) out.set(uid, new Set());
      out.get(uid).add(nr);
    }
  }
  return out;
}

async function getStaffListPausedUserIds(guildId?) {
  const { hasActiveAcceptedStaffPause, getTodayUtc } = require("../Pause/pauseHandlersUtils") as typeof import("../Pause/pauseHandlersUtils");
  const today = getTodayUtc();
  const gid = String(guildId);
  const docs = await ActivityUserProfile.find(
    {
      guildId: gid,
      "staff.pauses": { $elemMatch: { status: "accepted" } },
    },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);

  const out = new Set();
  for (const doc of docs || []) {
    const uid = doc?.userId != null ? String(doc.userId) : "";
    if (!uid) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    if (hasActiveAcceptedStaffPause(pauses, today)) out.add(uid);
  }

  try {
    const mongoose = require("mongoose") as typeof import("mongoose");
    const legacy = await mongoose.connection.db
      .collection("staffs")
      .find({ guildId: gid, "pauses.status": "accepted" }, { projection: { userId: 1, pauses: 1 } })
      .toArray();
    for (const row of legacy || []) {
      const uid = String(row?.userId || "").trim();
      if (!uid || out.has(uid)) continue;
      const pauses = Array.isArray(row?.pauses) ? row.pauses : [];
      if (hasActiveAcceptedStaffPause(pauses, today)) out.add(uid);
    }
  } catch (_) {}

  return out;
}

/** No-op: organico Discord canale dismesso. */
async function fetchMembersForStaffList() {
  return new Map();
}
async function refreshStaffList() {}
function startStaffListPeriodicRefreshLoop() {}
function scheduleStaffListRefresh() {}
function queueStaffListRefreshAfterRoleMutation() {}

export = {
  STAFF_NEW_EMOJI,
  STAFF_PAUSE_EMOJI,
  STAFF_LIST_SECTION_ROLE_IDS,
  STAFF_ROLE_IDS,
  BLOGGER_ROLE_ID,
  memberHasStaffRole,
  memberIsBlogger,
  memberOnStaffList,
  didStaffMembershipChange,
  didStaffListDisplayRolesChange,
  getStaffListPausedUserIds,
  getStaffListNewBadgeRoleIdsByUser,
  fetchMembersForStaffList,
  refreshStaffList,
  scheduleStaffListRefresh,
  queueStaffListRefreshAfterRoleMutation,
  startStaffListPeriodicRefreshLoop,
};
