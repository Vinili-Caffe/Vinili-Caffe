const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { memberHasStaffRole, queueStaffListRefreshAfterRoleMutation } = require("../Community/staffListUtils") as typeof import("../Community/staffListUtils");
const {
  deleteStaffPauseRequestChannelMessages,
  deleteStaffRelatedMessagesFromConfiguredChannels,
  archiveStaffRolesHistoryThenUnsetStaff,
  resetStaffLadderTrackInDb,
} = require("./staffDocUtils") as typeof import("./staffDocUtils");
const { getHighestStaffLadderRoleId } = require("./staffRoleHierarchy") as typeof import("./staffRoleHierarchy");
const { memberHasAnyRemappedRole, remapRoleIdForward } = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");

function getPartnerManagerRoleIdLive() {
  return remapRoleIdForward(IDs.roles?.PartnerManager) || String(IDs.roles?.PartnerManager || "").trim() || null;
}

function memberHasPartnerManagerRole(member?) {
  const roleId = getPartnerManagerRoleIdLive();
  if (!roleId || !member) return false;
  if (memberHasAnyRemappedRole(member, roleId)) return true;
  try {
    const { memberHasRoleNameMatch } = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");
    return memberHasRoleNameMatch(member, /partner\s*manager/i);
  } catch {
    return false;
  }
}

const ROLE_STAFF_GENERIC = IDs.roles.Staff;

function memberHasAnyStaffPresenceForDepexSync(member?) {
  if (!member?.roles?.cache) return false;
  if (memberHasStaffRole(member)) return true;
  return Boolean(ROLE_STAFF_GENERIC && member.roles.cache.has(ROLE_STAFF_GENERIC));
}

function initPartnerManagerFieldsIfMissing(staffObj?) {
  if (!staffObj) return;
  if (staffObj.partnerCount === undefined) staffObj.partnerCount = 0;
  if (!Array.isArray(staffObj.partnerActions)) staffObj.partnerActions = [];
  if (staffObj.managerId === undefined) staffObj.managerId = null;
  if (!Array.isArray(staffObj.partnerMilestoneDmSent)) staffObj.partnerMilestoneDmSent = [];
}

function buildStaffPartnerFieldsUnsetUpdate() {
      return buildStaffPartnerManagerIdUnsetUpdate();
}

function buildStaffPartnerManagerIdUnsetUpdate() {
  return { $unset: { "staff.managerId": "" } };
}

function memberHasStaffLadderRole(member?) {
  return Boolean(getHighestStaffLadderRoleId(member));
}

async function applyStaffDatabaseAfterDepex(guildId?, userId?, member?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  if (!member) {
        return;
  }
  if (memberHasAnyStaffPresenceForDepexSync(member)) {
    if (!memberHasPartnerManagerRole(member)) {
      await ActivityUserProfile.updateOne(
        { guildId: gid, userId: uid },
        buildStaffPartnerManagerIdUnsetUpdate(),
      ).catch(() => null);
    } else if (!memberHasStaffLadderRole(member)) {
      await resetStaffLadderTrackInDb(gid, uid);
    }
  } else {
    await archiveStaffRolesHistoryThenUnsetStaff(gid, uid);
  }
}

async function syncStaffDbAndPauseChannelAfterDepex(guild?, userId?, member?) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  if (!member) return;
    const verified =
    (await guild.members.fetch({ user: uid, force: true }).catch(() => null)) || member;
  if (memberHasAnyStaffPresenceForDepexSync(verified)) {
    await applyStaffDatabaseAfterDepex(gid, uid, verified);
    queueStaffListRefreshAfterRoleMutation(guild.client, gid);
    return;
  }
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }, { staff: 1 }).lean().catch(() => null);
  await deleteStaffPauseRequestChannelMessages(guild, uid);
  await deleteStaffRelatedMessagesFromConfiguredChannels(guild, uid, doc?.staff);
  try {
    const { cancelPendingResocontiWorkflowForUser } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
    await cancelPendingResocontiWorkflowForUser(gid, uid, {
      statusLabel: "Annullato (depex)",
      decidedBy: "system",
    });
  } catch (err) {
    global.logger?.warn?.("[staffPmUtils] cancel pending resoconti on depex:", uid, err?.message || err);
  }
  await applyStaffDatabaseAfterDepex(gid, uid, verified);
  queueStaffListRefreshAfterRoleMutation(guild.client, gid);
}

export = {
  get ROLE_PM() {
    return getPartnerManagerRoleIdLive();
  },
  memberHasPartnerManagerRole,
  memberHasAnyStaffPresenceForDepexSync,
  initPartnerManagerFieldsIfMissing,
  buildStaffPartnerFieldsUnsetUpdate,
  buildStaffPartnerManagerIdUnsetUpdate,
  applyStaffDatabaseAfterDepex,
  syncStaffDbAndPauseChannelAfterDepex,
};