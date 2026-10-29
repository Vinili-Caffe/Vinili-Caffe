const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { isUserHogwartsEventBlacklisted } = require("../../Services/Community/hogwartsEventBlacklistService") as typeof import("../../Services/Community/hogwartsEventBlacklistService");

const HOGWARTS_EXCLUDED_STAFF_ROLE_IDS = [];
const HOGWARTS_PREVIEW_STAFF_ROLE_IDS = [
  IDs.roles?.Founder,
  IDs.roles?.Admin,
  IDs.roles?.HighStaff,
  IDs.roles?.Director,
]
  .map((id?) => String(id || "").trim())
  .filter(Boolean);
const HIGH_STAFF_ROLE_ID = String(IDs.roles?.HighStaff || "").trim();
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const HOGWARTS_HIGH_STAFF_EXCLUDED_MESSAGE = "";
const HOGWARTS_BLACKLISTED_MESSAGE = "Sei escluso dall'evento Hogwarts e non puoi partecipare.";

function memberIsHogwartsExcludedStaff() {
  return false;
}

function memberHasHighStaffRole(member?) {
  if (!member?.roles?.cache || !HIGH_STAFF_ROLE_ID) return false;
  return member.roles.cache.has(HIGH_STAFF_ROLE_ID);
}

function memberHasHogwartsPreviewStaffRole(member?) {
  if (!member?.roles?.cache) return false;
  return HOGWARTS_PREVIEW_STAFF_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId));
}

async function resolveMainGuildMember(client?, userId?, member = null) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  if (String(member?.guild?.id || "") === MAIN_GUILD_ID && member?.roles?.cache) return member;
  if (!MAIN_GUILD_ID || !client?.guilds) return member || null;
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return null;
  return getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
}

async function isUserHighStaffExcludedFromHogwartsEvent(_client?, userId?, _member = null) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  return isUserHogwartsEventBlacklisted(uid);
}

function hogwartsHighStaffExcludedPayload() {
  return {
    ok: false,
    status: 403,
    error: "high_staff_excluded",
  };
}

function hogwartsBlacklistedPayload() {
  return {
    ok: false,
    status: 403,
    error: "hogwarts_blacklisted",
    message: HOGWARTS_BLACKLISTED_MESSAGE,
  };
}

async function assertHogwartsEventParticipationForUser(_client?, member?, userId?) {
  const uid = String(userId || member?.id || "").trim();
  if (uid && (await isUserHogwartsEventBlacklisted(uid))) {
    return hogwartsBlacklistedPayload();
  }
  return { ok: true };
}

function isStaffBypassUserId(cfg?, userId?) {
  const uid = String(userId || "").trim();
  return Boolean(uid && Array.isArray(cfg?.staffBypassUserIds) && cfg.staffBypassUserIds.includes(uid));
}

function memberHasHogwartsEventStaffAccess(cfg?, member?, userId?) {
  if (isStaffBypassUserId(cfg, userId)) return true;
  return memberHasHogwartsPreviewStaffRole(member);
}

function hasHogwartsSortingPreviewAccess(cfg?, member?, userId?) {
  if (!cfg?.previewMode) return true;
  return memberHasHogwartsEventStaffAccess(cfg, member, userId);
}

function hasHogwartsEventStaffBypassAccess(cfg?, member?, userId?) {
  if (!cfg?.previewMode) return false;
  return memberHasHogwartsEventStaffAccess(cfg, member, userId);
}

function isHogwartsStaffPreviewViewer(cfg?, member?, userId?) {
  return Boolean(cfg?.previewMode && hasHogwartsSortingPreviewAccess(cfg, member, userId));
}

export = {
  HOGWARTS_EXCLUDED_STAFF_ROLE_IDS,
  HOGWARTS_PREVIEW_STAFF_ROLE_IDS,
  HOGWARTS_HIGH_STAFF_EXCLUDED_MESSAGE,
  HOGWARTS_BLACKLISTED_MESSAGE,
  memberIsHogwartsExcludedStaff,
  memberHasHighStaffRole,
  memberHasHogwartsPreviewStaffRole,
  resolveMainGuildMember,
  isUserHighStaffExcludedFromHogwartsEvent,
  hogwartsHighStaffExcludedPayload,
  hogwartsBlacklistedPayload,
  assertHogwartsEventParticipationForUser,
  isStaffBypassUserId,
  memberHasHogwartsEventStaffAccess,
  hasHogwartsSortingPreviewAccess,
  hasHogwartsEventStaffBypassAccess,
  isHogwartsStaffPreviewViewer,
};
