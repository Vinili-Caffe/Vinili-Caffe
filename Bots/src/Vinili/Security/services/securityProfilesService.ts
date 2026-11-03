const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const SECURITY_PROFILES_PATH = path.resolve(__dirname, "../config/securityProfiles.json",);
const DEFAULT_STATE = { version: 1, guilds: {}, };
const DEFAULT_MAIN_ROLE_IDS = [IDs?.roles?.Member, IDs?.roles?.separatore6, IDs?.roles?.separatore8, IDs?.roles?.separatore5, IDs?.roles?.separatore7,].map((id?) => normalizeEntityId(id)).filter(Boolean);
const ADMINS_PROFILE = Object.freeze({ key: "admins", roleId: String(IDs?.roles?.HighStaff || ""), owner: false, fullImmunity: true, automodImmunity: true, reportImmunity: true, lockServerChannels: true, lockStaffRoles: false, lockServerJoins: true, makeLockdownUpdates: true, kickBanWhitelist: false, channelCreationsWhitelist: false, channelDeletionsWhitelist: false, roleCreationsWhitelist: false, roleDeletionsWhitelist: false, webhookCreationsWhitelist: false, profanityWhitelist: true, linkWhitelist: false, });
const MODERATORS_PROFILE = Object.freeze({ key: "moderators", roleId: String(IDs?.roles?.Staff || ""), owner: false, fullImmunity: false, automodImmunity: true, reportImmunity: true, lockServerChannels: false, lockStaffRoles: false, lockServerJoins: false, makeLockdownUpdates: false, kickBanWhitelist: false, channelCreationsWhitelist: false, channelDeletionsWhitelist: false, roleCreationsWhitelist: false, roleDeletionsWhitelist: false, webhookCreationsWhitelist: false, profanityWhitelist: true, linkWhitelist: false, });

function readJsonSafe(filePath?, fallback?) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath?, payload?) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function normalizeUserId(input?) {
  const id = String(input || "").trim();
  if (!/^\d{16,20}$/.test(id)) return "";
  return id;
}

function normalizeGuildId(input?) {
  const id = String(input || "").trim();
  if (!/^\d{16,20}$/.test(id)) return "";
  return id;
}

function normalizeEntityId(input?) {
  const id = String(input || "").trim();
  if (!/^\d{16,20}$/.test(id)) return "";
  return id;
}

function normalizeUserArray(raw?, max = 100) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((x?) => normalizeUserId(x))
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function normalizeEntityArray(raw?, max = 100) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((x?) => normalizeEntityId(x))
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function normalizeState(raw?) {
  const src = raw && typeof raw === "object" ? raw : DEFAULT_STATE;
  const guilds: Record<string, any> = {};
  if (src.guilds && typeof src.guilds === "object") {
    for (const [guildId, row] of Object.entries(src.guilds)) {
      const gid = normalizeGuildId(guildId);
      if (!gid) continue;
      guilds[gid] = {
        trustedAdmins: normalizeUserArray(row?.trustedAdmins, 100),
        extraOwners: normalizeUserArray(row?.extraOwners, 100),
        quarantineRoleId:
          normalizeEntityId(row?.quarantineRoleId) ||
          normalizeEntityId(IDs?.roles?.Muted),
        mainRoleIds: normalizeEntityArray(row?.mainRoleIds, 30),
        loggingChannelId:
          normalizeEntityId(row?.loggingChannelId) ||
          normalizeEntityId(IDs?.channels?.modLogs),
        modLoggingChannelId:
          normalizeEntityId(row?.modLoggingChannelId) ||
          normalizeEntityId(IDs?.channels?.modLogs),
        partneringChannelIds: normalizeEntityArray(
          row?.partneringChannelIds,
          30,
        ),
        mainChannelId:
          normalizeEntityId(row?.mainChannelId) ||
          normalizeEntityId(IDs?.channels?.chat),
        verificationChannelId:
          normalizeEntityId(row?.verificationChannelId) ||
          normalizeEntityId(IDs?.channels?.verify),
      };
      if (!guilds[gid].mainRoleIds.length) {
        guilds[gid].mainRoleIds = [...DEFAULT_MAIN_ROLE_IDS];
      }
      if (!guilds[gid].partneringChannelIds.length) {
        const fallbackPartner = normalizeEntityId(IDs?.channels?.partnerships);
        guilds[gid].partneringChannelIds = fallbackPartner
          ? [fallbackPartner]
          : [];
      }
    }
  }
  return { version: 1, guilds };
}

let state = normalizeState(readJsonSafe(SECURITY_PROFILES_PATH, DEFAULT_STATE));
writeJsonSafe(SECURITY_PROFILES_PATH, state);

function getGuildBucket(guildId?, create = false) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return null;
  if (!state.guilds[gid] && create) {
    const fallbackPartner = normalizeEntityId(IDs?.channels?.partnerships);
    state.guilds[gid] = {
      trustedAdmins: [],
      extraOwners: [],
      quarantineRoleId: normalizeEntityId(IDs?.roles?.Muted),
      mainRoleIds: [...DEFAULT_MAIN_ROLE_IDS],
      loggingChannelId: normalizeEntityId(IDs?.channels?.modLogs),
      modLoggingChannelId: normalizeEntityId(IDs?.channels?.modLogs),
      partneringChannelIds: fallbackPartner ? [fallbackPartner] : [],
      mainChannelId: normalizeEntityId(IDs?.channels?.chat),
      verificationChannelId: normalizeEntityId(IDs?.channels?.verify),
    };
  }
  return state.guilds[gid] || null;
}

function getSecurityProfilesSnapshot(guildId?) {
  const bucket = getGuildBucket(guildId, false) || { trustedAdmins: [], extraOwners: [], quarantineRoleId: normalizeEntityId(IDs?.roles?.Muted), mainRoleIds: [...DEFAULT_MAIN_ROLE_IDS], loggingChannelId: normalizeEntityId(IDs?.channels?.modLogs), modLoggingChannelId: normalizeEntityId(IDs?.channels?.modLogs), partneringChannelIds: normalizeEntityId(IDs?.channels?.partnerships) ? [normalizeEntityId(IDs?.channels?.partnerships)] : [], mainChannelId: normalizeEntityId(IDs?.channels?.chat), verificationChannelId: normalizeEntityId(IDs?.channels?.verify), };
  return JSON.parse(JSON.stringify(bucket));
}

function getSecurityStaticsSnapshot(guildId?) {
  const snap = getSecurityProfilesSnapshot(guildId);
  return {
    quarantineRoleId: String(snap?.quarantineRoleId || ""),
    mainRoleIds: normalizeEntityArray(snap?.mainRoleIds, 30),
    loggingChannelId: String(snap?.loggingChannelId || ""),
    modLoggingChannelId: String(snap?.modLoggingChannelId || ""),
    partneringChannelIds: normalizeEntityArray(snap?.partneringChannelIds, 30),
    mainChannelId: String(snap?.mainChannelId || ""),
    verificationChannelId: String(snap?.verificationChannelId || ""),
  };
}

function isTrustedAdmin(guildId?, userId?) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return false;
  const bucket = getGuildBucket(gid, false);
  return Boolean(bucket?.trustedAdmins?.includes(uid));
}

function isExtraOwner(guildId?, userId?) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return false;
  const bucket = getGuildBucket(gid, false);
  return Boolean(bucket?.extraOwners?.includes(uid));
}

function isSecurityProfileImmune(guildId?, userId?) {
  return isTrustedAdmin(guildId, userId) || isExtraOwner(guildId, userId);
}

function isAdminsProfileMember(member?) {
  const roleId = String(ADMINS_PROFILE.roleId || "");
  if (!member || !roleId) return false;
  return Boolean(member?.roles?.cache?.has?.(roleId));
}

function isModeratorsProfileMember(member?) {
  const roleId = String(MODERATORS_PROFILE.roleId || "");
  if (!member || !roleId) return false;
  return Boolean(member?.roles?.cache?.has?.(roleId));
}

function hasAdminsProfileCapability(member?, capability?) {
  if (!isAdminsProfileMember(member)) return false;
  return Boolean(ADMINS_PROFILE?.[String(capability || "").trim()]);
}

function hasModeratorsProfileCapability(member?, capability?) {
  if (!isModeratorsProfileMember(member)) return false;
  return Boolean(MODERATORS_PROFILE?.[String(capability || "").trim()]);
}

export = { getSecurityProfilesSnapshot, getSecurityStaticsSnapshot, isExtraOwner, isSecurityProfileImmune, hasAdminsProfileCapability, hasModeratorsProfileCapability };