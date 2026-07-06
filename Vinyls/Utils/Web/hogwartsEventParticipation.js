const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const HOGWARTS_EXCLUDED_STAFF_ROLE_IDS = [];
const HOGWARTS_PREVIEW_STAFF_ROLE_IDS = [
  IDs.roles?.Founder,
  IDs.roles?.Admin,
  IDs.roles?.HighStaff,
  IDs.roles?.Director,
]
  .map((id) => String(id || "").trim())
  .filter(Boolean);
const HIGH_STAFF_ROLE_ID = String(IDs.roles?.HighStaff || "").trim();
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const HOGWARTS_HIGH_STAFF_EXCLUDED_MESSAGE = "";

function memberIsHogwartsExcludedStaff() {
  return false;
}

function memberHasHighStaffRole(member) {
  if (!member?.roles?.cache || !HIGH_STAFF_ROLE_ID) return false;
  return member.roles.cache.has(HIGH_STAFF_ROLE_ID);
}

function memberHasHogwartsPreviewStaffRole(member) {
  if (!member?.roles?.cache) return false;
  return HOGWARTS_PREVIEW_STAFF_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

async function resolveMainGuildMember(client, userId, member = null) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  if (String(member?.guild?.id || "") === MAIN_GUILD_ID && member?.roles?.cache) return member;
  if (!MAIN_GUILD_ID || !client?.guilds) return member || null;
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return null;
  return getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
}

async function isUserHighStaffExcludedFromHogwartsEvent() {
  return false;
}

function hogwartsHighStaffExcludedPayload() {
  return {
    ok: false,
    status: 403,
    error: "high_staff_excluded",
  };
}

async function assertHogwartsEventParticipationForUser() {
  return { ok: true };
}

function isStaffBypassUserId(cfg, userId) {
  const uid = String(userId || "").trim();
  return Boolean(uid && Array.isArray(cfg?.staffBypassUserIds) && cfg.staffBypassUserIds.includes(uid));
}

function memberHasHogwartsEventStaffAccess(cfg, member, userId) {
  if (isStaffBypassUserId(cfg, userId)) return true;
  return memberHasHogwartsPreviewStaffRole(member);
}

function hasHogwartsSortingPreviewAccess(cfg, member, userId) {
  if (!cfg?.previewMode) return true;
  return memberHasHogwartsEventStaffAccess(cfg, member, userId);
}

function hasHogwartsEventStaffBypassAccess(cfg, member, userId) {
  if (!cfg?.previewMode) return false;
  return memberHasHogwartsEventStaffAccess(cfg, member, userId);
}

function isHogwartsStaffPreviewViewer(cfg, member, userId) {
  return Boolean(cfg?.previewMode && hasHogwartsSortingPreviewAccess(cfg, member, userId));
}

module.exports = {
  HOGWARTS_EXCLUDED_STAFF_ROLE_IDS,
  HOGWARTS_PREVIEW_STAFF_ROLE_IDS,
  HOGWARTS_HIGH_STAFF_EXCLUDED_MESSAGE,
  memberIsHogwartsExcludedStaff,
  memberHasHighStaffRole,
  memberHasHogwartsPreviewStaffRole,
  resolveMainGuildMember,
  isUserHighStaffExcludedFromHogwartsEvent,
  hogwartsHighStaffExcludedPayload,
  assertHogwartsEventParticipationForUser,
  isStaffBypassUserId,
  memberHasHogwartsEventStaffAccess,
  hasHogwartsSortingPreviewAccess,
  hasHogwartsEventStaffBypassAccess,
  isHogwartsStaffPreviewViewer,
};