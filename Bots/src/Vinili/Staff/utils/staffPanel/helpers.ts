const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { memberHasStaffRole } = require("../../../Community/utils/staffListUtils") as typeof import("../../../Community/utils/staffListUtils");
const { sendPartnerManagerWelcome, sendHelperWelcome } = require("../staffWelcomeMessages") as typeof import("../staffWelcomeMessages");
const ROLE_MEMBER = IDs.roles.Member;
const ROLE_PARTNER_MANAGER = IDs.roles.PartnerManager;
const ROLE_BLOGGER = String(IDs.roles.Blogger || "").trim();
const ROLE_STAFF = IDs.roles.Staff;
const ROLE_HIGH_STAFF = IDs.roles.HighStaff;
const ROLE_HELPER = IDs.roles.Helper;
const ROLE_MODERATOR = IDs.roles.Mod;
const ROLE_SENIOR_MODERATOR = IDs.roles.SeniorModerator;
const ROLE_DIRECTOR = IDs.roles.Director;
const ROLE_ADMIN = IDs.roles.Admin;
const ROLE_MANAGER = IDs.roles.Manager;
const ROLE_CO_OWNER = "";

function pushRolesHistoryWithActor(staff, { oldRole, newRole, reason, kind, actorUser }) {
  if (!Array.isArray(staff.rolesHistory)) staff.rolesHistory = [];
  const { actorLabelFromUser } = require("../staffTrackHistory") as typeof import("../staffTrackHistory");
  const actorId = String(actorUser?.id || "").trim() || null;
  const actorName = actorLabelFromUser(actorUser, actorId);
  const entry: Record<string, any> = {
    oldRole: String(oldRole || "").trim(),
    newRole: String(newRole ?? "").trim(),
    reason: String(reason || "").trim() || null,
    date: new Date(),
    kind: kind === "pex" || kind === "depex" ? kind : undefined,
  };
  if (actorId && /^\d{16,22}$/.test(actorId)) entry.actorId = actorId;
  if (actorName) entry.actorName = actorName;
  staff.rolesHistory.push(entry);
  return entry;
}

async function mirrorTrackHistory(guildId?, userId?, entry?, kindOverride?) {
  try {
    const { appendStaffTrackHistory } = require("../staffTrackHistory") as typeof import("../staffTrackHistory");
    await appendStaffTrackHistory(guildId, userId, {
      kind: kindOverride || entry.kind,
      reason: entry.reason,
      date: entry.date,
      actorId: entry.actorId,
      actorName: entry.actorName,
      oldRole: entry.oldRole,
      newRole: entry.newRole,
      entryId: entry.entryId,
    });
  } catch (_) {}
}

function firePexDepexSiteNotif(guild, { kind, targetUser, oldRoleId, newRoleId, reason, actorUser, sourceHint }) {
  const targetUserId = String(targetUser?.id || "").trim();
  try {
    const { notifyStaffPexDepex, memberDisplayName } = require("../../../site/staff/siteStaffEventNotifications") as typeof import("../../../site/staff/siteStaffEventNotifications");
    void notifyStaffPexDepex({
      guild,
      kind,
      targetUserId,
      targetName: memberDisplayName(null, targetUser, targetUser?.id),
      oldRoleId,
      newRoleId,
      reason,
      actorUserId: String(actorUser?.id || ""),
      actorName: memberDisplayName(null, actorUser, actorUser?.id),
      sourceHint,
    }).catch(() => 0);
  } catch (_) {}
  /* staffProfLiveAll1: clear cache → broadcast WS ai profili aperti */
  try {
    require("../../../site/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(targetUserId, {
      action: kind || sourceHint || "career",
    });
  } catch (_) {}
}
const ROLE_OWNER = IDs.roles.Founder;
const SUCCESS_COLOR = "#6f4e37";

async function refreshMemberRoles(member?) {
  const guild = member?.guild;
  const memberId = member?.id;
  if (!guild || !memberId) return member;
  return guild.members.fetch(memberId).catch(() => member);
}

async function ensureRoleState(member?, roleId?, shouldHaveRole?) {
  const refreshedMember = await refreshMemberRoles(member);
  const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
  return { member: refreshedMember || member, ok: shouldHaveRole ? hasRole : !hasRole };
}

async function ensureMultipleRoleStates(member?, checks?) {
  const refreshedMember = await refreshMemberRoles(member);
  const ok = (Array.isArray(checks) ? checks : []).every(({ roleId, shouldHaveRole }) => {
    const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
    return shouldHaveRole ? hasRole : !hasRole;
  });
  return { member: refreshedMember || member, ok };
}

async function fetchMember(guild?, userId?) {
  if (!guild || !userId) return null;
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  const first = await guild.members.fetch(userId).catch(() => null);
  if (first) return first;
    return guild.members.fetch(userId).catch(() => null);
}

function createMemberResolver(guild?) {
  const pendingMembers = new Map();

  return async (userId?) => {
    const key = String(userId || "");
    if (!key) return null;

    const cachedMember = guild?.members?.cache?.get(key);
    if (cachedMember) return cachedMember;

    if (pendingMembers.has(key)) {
      return pendingMembers.get(key);
    }

    const fetchPromise = fetchMember(guild, key).finally(() => { pendingMembers.delete(key); });
    pendingMembers.set(key, fetchPromise);
    return fetchPromise;
  };
}

const STAFF_LADDER_ROLES = [
  ROLE_HELPER,
  ROLE_MODERATOR,
  ROLE_SENIOR_MODERATOR,
  ROLE_DIRECTOR,
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_CO_OWNER,
  ROLE_OWNER,
].filter(Boolean);
const ROLES_REQUIRING_HIGH_STAFF = [ROLE_ADMIN, ROLE_MANAGER, ROLE_CO_OWNER, ROLE_OWNER].filter(Boolean);

async function applyPexSideEffects(
  member?,
  roleId?,
  client?,
  staffChannel?,
  user?,
  hadStaffRolesBeforePex?,
) {
  const hadAnyStaffRoleBefore =
    typeof hadStaffRolesBeforePex === "boolean" ? hadStaffRolesBeforePex : memberHasStaffRole(member);
  if (roleId === ROLE_PARTNER_MANAGER) {
    await sendPartnerManagerWelcome(client || member?.client, member);
  }

  if (STAFF_LADDER_ROLES.includes(roleId)) {
    await member.roles.add(ROLE_STAFF);
    member = (await ensureRoleState(member, ROLE_STAFF, true)).member;
  }
  if (ROLES_REQUIRING_HIGH_STAFF.includes(roleId)) {
    await member.roles.add(ROLE_HIGH_STAFF);
    member = (await ensureRoleState(member, ROLE_HIGH_STAFF, true)).member;
  }

  if (roleId === ROLE_HELPER) {
    await member.roles.add(ROLE_STAFF);
    const verification = await ensureRoleState(member, ROLE_STAFF, true);
    if (!verification.ok) throw new Error("Pex side effect failed: staff role missing after helper promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_MODERATOR) {
    await member.roles.remove(ROLE_HELPER);
    const verification = await ensureRoleState(member, ROLE_HELPER, false);
    if (!verification.ok) throw new Error("Pex side effect failed: helper role still present after moderator promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_SENIOR_MODERATOR) {
    await member.roles.remove(ROLE_MODERATOR);
    const verification = await ensureRoleState(member, ROLE_MODERATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: moderator role still present after senior moderator promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_DIRECTOR) {
    await member.roles.remove(ROLE_SENIOR_MODERATOR);
    const verification = await ensureRoleState(member, ROLE_SENIOR_MODERATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: senior moderator role still present after director promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_DIRECTOR || ROLE_MODERATOR);
    await member.roles.add(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [
      { roleId: ROLE_DIRECTOR || ROLE_MODERATOR, shouldHaveRole: false },
      { roleId: ROLE_HIGH_STAFF, shouldHaveRole: true },
    ]);
    if (!verification.ok) throw new Error("Pex side effect failed: admin side effects not applied.");
    member = verification.member;
  }

  if (roleId === ROLE_MANAGER) {
    await member.roles.remove(ROLE_ADMIN);
    await member.roles.add(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [
      { roleId: ROLE_ADMIN, shouldHaveRole: false },
      { roleId: ROLE_HIGH_STAFF, shouldHaveRole: true },
    ]);
    if (!verification.ok) throw new Error("Pex side effect failed: manager side effects not applied.");
    member = verification.member;
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(ROLE_ADMIN);
    const verification = await ensureRoleState(member, ROLE_ADMIN, false);
    if (!verification.ok) throw new Error("Pex side effect failed: admin role still present after co-owner promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_OWNER) {
    await member.roles.remove([ROLE_MANAGER, ROLE_CO_OWNER].filter(Boolean));
    const verification = await ensureMultipleRoleStates(member, [
      ...(ROLE_MANAGER ? [{ roleId: ROLE_MANAGER, shouldHaveRole: false }] : []),
      ...(ROLE_CO_OWNER ? [{ roleId: ROLE_CO_OWNER, shouldHaveRole: false }] : []),
    ]);
    if (!verification.ok) throw new Error("Pex side effect failed: manager/co-owner role still present after owner promotion.");
  }

  const hasLadderRoleNow = Boolean(getHighestLadderRole(member));
  if (!hadAnyStaffRoleBefore && hasLadderRoleNow) {
    await sendHelperWelcome(staffChannel, member);
  }
}

function getHighestLadderRole(member?) {
  if (!member?.roles?.cache) return null;
  for (let i = STAFF_LADDER_ROLES.length - 1; i >= 0; i--) {
    const id = STAFF_LADDER_ROLES[i];
    if (id && member.roles.cache.has(id)) return id;
  }
  return null;
}

/** Index in STAFF_LADDER_ROLES (Helper=0 … Founder/Owner=max). -1 = fuori scala. */
function staffLadderRankIndex(roleId?) {
  const id = String(roleId || "").trim();
  if (!id) return -1;
  return STAFF_LADDER_ROLES.indexOf(id);
}

function getMemberStaffLadderRank(member?) {
  return staffLadderRankIndex(getHighestLadderRole(member));
}

async function resolveGuildActorMember(guild?, actorUserOrMember?) {
  if (actorUserOrMember?.roles?.cache) return actorUserOrMember;
  const id = String(actorUserOrMember?.id || "").trim();
  if (!id || !guild) return null;
  return (
    guild.members?.cache?.get?.(id) ||
    (await guild.members?.fetch?.(id).catch(() => null)) ||
    null
  );
}

/**
 * staffCareerRankGuard1: niente pex/depex su pari o superiori; niente pex verso ruolo >= al proprio.
 * Target senza scala (es. PM-only) ok se l'attore ha un grado ladder (o è Founder/Owner).
 */
function assertStaffCareerHierarchy(actorMember?, targetMember?, { destinationRoleId = null } = {}) {
  if (!actorMember || !targetMember) {
    return {
      ok: false,
      message:
        "<:VC_Lock:1482526739044368476> Impossibile verificare i ruoli per pex/depex.",
    };
  }
  if (String(actorMember.id) === String(targetMember.id)) {
    return {
      ok: false,
      message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso.",
    };
  }

  const actorRank = getMemberStaffLadderRank(actorMember);
  const targetRank = getMemberStaffLadderRank(targetMember);
  const topRoleId = STAFF_LADDER_ROLES.length
    ? STAFF_LADDER_ROLES[STAFF_LADDER_ROLES.length - 1]
    : "";
  const actorIsTop = Boolean(topRoleId && actorMember.roles?.cache?.has?.(topRoleId));

  if (targetRank >= 0) {
    if (actorRank < 0) {
      return {
        ok: false,
        message:
          "<:VC_Lock:1482526739044368476> Non puoi pexare o depexare un membro con ruolo nella scala staff: il tuo grado è inferiore o assente.",
      };
    }
    if (!actorIsTop && targetRank >= actorRank) {
      return {
        ok: false,
        message:
          "<:VC_Lock:1482526739044368476> Non puoi pexare o depexare un membro con ruolo uguale o superiore al tuo.",
      };
    }
  }

  const destId = String(destinationRoleId || "").trim();
  if (destId) {
    const destRank = staffLadderRankIndex(destId);
    if (destRank >= 0 && (actorRank < 0 || (!actorIsTop && destRank >= actorRank))) {
      return {
        ok: false,
        message:
          "<:VC_Lock:1482526739044368476> Non puoi pexare a un ruolo uguale o superiore al tuo.",
      };
    }
  }

  return { ok: true };
}

function getNextLadderRoleId(currentId?) {
  const idx = STAFF_LADDER_ROLES.indexOf(currentId);
  if (idx < 0 || idx >= STAFF_LADDER_ROLES.length - 1) return null;
  return STAFF_LADDER_ROLES[idx + 1];
}

function peekDepexLadderTargetRoleId(ladderRoleId?) {
  const roleId = String(ladderRoleId || "").trim();
  if (!roleId) return null;
  if (ROLE_OWNER && roleId === ROLE_OWNER) return ROLE_MANAGER || ROLE_ADMIN || null;
  if (ROLE_MANAGER && roleId === ROLE_MANAGER) return ROLE_ADMIN || null;
  if (ROLE_ADMIN && roleId === ROLE_ADMIN) return ROLE_DIRECTOR || null;
  if (ROLE_DIRECTOR && roleId === ROLE_DIRECTOR) return ROLE_SENIOR_MODERATOR || null;
  if (ROLE_SENIOR_MODERATOR && roleId === ROLE_SENIOR_MODERATOR) return ROLE_MODERATOR || null;
  if ((ROLE_MODERATOR && roleId === ROLE_MODERATOR) || (ROLE_HELPER && roleId === ROLE_HELPER)) {
    return ROLE_MEMBER || "";
  }
  const idx = STAFF_LADDER_ROLES.indexOf(roleId);
  if (idx > 0) return STAFF_LADDER_ROLES[idx - 1];
  if (idx === 0) return ROLE_MEMBER || "";
  return null;
}

export = {
  ROLE_MEMBER,
  ROLE_PARTNER_MANAGER,
  ROLE_BLOGGER,
  ROLE_STAFF,
  ROLE_HIGH_STAFF,
  ROLE_HELPER,
  ROLE_MODERATOR,
  ROLE_SENIOR_MODERATOR,
  ROLE_DIRECTOR,
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_CO_OWNER,
  ROLE_OWNER,
  SUCCESS_COLOR,
  STAFF_LADDER_ROLES,
  ROLES_REQUIRING_HIGH_STAFF,
  pushRolesHistoryWithActor,
  mirrorTrackHistory,
  firePexDepexSiteNotif,
  refreshMemberRoles,
  ensureRoleState,
  ensureMultipleRoleStates,
  fetchMember,
  createMemberResolver,
  applyPexSideEffects,
  getHighestLadderRole,
  staffLadderRankIndex,
  getMemberStaffLadderRank,
  resolveGuildActorMember,
  assertStaffCareerHierarchy,
  getNextLadderRoleId,
  peekDepexLadderTargetRoleId,
};
