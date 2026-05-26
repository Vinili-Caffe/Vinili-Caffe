const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const HOGWARTS_EXCLUDED_STAFF_ROLE_IDS = [ IDs.roles?.Founder, IDs.roles?.Admin, IDs.roles?.HighStaff ].map((id) => String(id || "").trim()).filter(Boolean);
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const HOGWARTS_HIGH_STAFF_EXCLUDED_MESSAGE = "Founder, Admin e High Staff non partecipano all'evento Hogwarts.";

function memberIsHogwartsExcludedStaff(member) {
  if (!member?.roles?.cache) return false;
  return HOGWARTS_EXCLUDED_STAFF_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

function memberHasHighStaffRole(member) {
  return memberIsHogwartsExcludedStaff(member);
}

async function resolveMainGuildMember(client, userId, member = null) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  if (String(member?.guild?.id || "") === MAIN_GUILD_ID && member?.roles?.cache) return member;
  if (!MAIN_GUILD_ID || !client?.guilds) return memberIsHogwartsExcludedStaff(member) ? member : null;
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return null;
  return getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
}

async function isUserHighStaffExcludedFromHogwartsEvent(client, userId, member = null) {
  if (memberIsHogwartsExcludedStaff(member)) return true;
  const mainMember = await resolveMainGuildMember(client, userId, member);
  return memberIsHogwartsExcludedStaff(mainMember);
}

function hogwartsHighStaffExcludedPayload() {
  return {
    ok: false,
    status: 403,
    error: "high_staff_excluded",
  };
}

async function assertHogwartsEventParticipationForUser(client, member, userId) {
  if (await isUserHighStaffExcludedFromHogwartsEvent(client, userId, member)) {
    return hogwartsHighStaffExcludedPayload();
  }
  return { ok: true };
}

function isStaffBypassUserId(cfg, userId) {
  const uid = String(userId || "").trim();
  return Boolean(uid && Array.isArray(cfg?.staffBypassUserIds) && cfg.staffBypassUserIds.includes(uid));
}

function hasHogwartsSortingPreviewAccess(cfg, member, userId) {
  if (!cfg?.previewMode) return true;
  if (isStaffBypassUserId(cfg, userId)) return true;
  return memberIsHogwartsExcludedStaff(member);
}

function hasHogwartsEventStaffBypassAccess(cfg, userId) {
  if (!cfg?.previewMode) return false;
  return isStaffBypassUserId(cfg, userId);
}

function isHogwartsStaffPreviewViewer(cfg, member, userId) {
  return Boolean(cfg?.previewMode && hasHogwartsSortingPreviewAccess(cfg, member, userId));
}

module.exports = { HOGWARTS_EXCLUDED_STAFF_ROLE_IDS, HOGWARTS_HIGH_STAFF_EXCLUDED_MESSAGE, memberIsHogwartsExcludedStaff, memberHasHighStaffRole, resolveMainGuildMember, isUserHighStaffExcludedFromHogwartsEvent, hogwartsHighStaffExcludedPayload, assertHogwartsEventParticipationForUser, isStaffBypassUserId, hasHogwartsSortingPreviewAccess, hasHogwartsEventStaffBypassAccess, isHogwartsStaffPreviewViewer };