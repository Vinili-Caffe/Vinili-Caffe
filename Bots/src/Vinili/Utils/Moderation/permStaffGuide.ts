/** Permessi: accesso ai pulsanti della guida staff. */
const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService") as typeof import("../../Services/Community/weekWinnerGrantsService");

const EMPTY_PERMISSIONS = { slash: {}, prefix: {}, channels: {}, buttons: {}, selectMenus: {}, modals: {}, };
let idsFallbackCache = null;
const LIVE_MEMBER_CACHE_TTL_MS = 15_000;
const liveMemberCache = new Map();
const STAFF_GUIDE_BUTTON_IDS = new Set([
  "regolamento",
  "regole_staff",
  "limiti",
  "pause",
  "valutazioni",
  "moderazione_staff",
  "warnstaff",
  "pex",
  "lineeguida",
  "comandi",
  "generalimoderazione",
  "testualimoderazione",
  "vocalimoderazione",
  "sanzioni",
]);

function getStaffGuideAccessRoleIds() {
  return [
    IDs.roles?.Staff,
    IDs.roles?.Helper,
    IDs.roles?.Mod,
    IDs.roles?.SeniorModerator,
    IDs.roles?.Director,
    IDs.roles?.HighStaff,
    IDs.roles?.Manager,
    IDs.roles?.Admin,
    IDs.roles?.Founder,
  ]
    .map((id?) => String(id || "").trim())
    .filter(Boolean);
}

function isPartnerManagerOnlyMember(member?) {
  const pmId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmId || !member?.roles?.cache?.has(pmId)) return false;
  const access = getStaffGuideAccessRoleIds();
  return !access.some((id?) => member.roles.cache.has(id));
}

function getIdsConfig() {
  if (idsFallbackCache) return idsFallbackCache;
  try {
    idsFallbackCache = require("../Config/ids");
    return idsFallbackCache;
  } catch {
    return {};
  }
}

function resolveRoleReference(value?) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let resolved = null;
  if (/^\d{16,22}$/.test(raw)) {
    resolved = raw;
  } else {
    let key = raw;
    if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
    else if (key.startsWith("roles.")) key = key.slice("roles.".length);

    const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
    const table = idsCfg?.roles;
    if (!table || typeof table !== "object") return null;
    if (table[key] != null && String(table[key]).trim() !== "") resolved = String(table[key]);
    else {
      const lower = String(key).toLowerCase();
      for (const k of Object.keys(table)) {
        if (String(k).toLowerCase() === lower) {
          const v = table[k];
          if (v != null && String(v).trim() !== "") {
            resolved = String(v);
            break;
          }
        }
      }
    }
  }
  if (!resolved) return null;
  try {
    const { remapRoleIdForward } = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");
    return remapRoleIdForward(resolved) || resolved;
  } catch {
    return resolved;
  }
}

function normalizeRoleList(roleIds?) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value?) => resolveRoleReference(value)).filter(Boolean);
}

function resolveLiveMemberGuildUser(entity?) {
  const guild =
    entity?.guild ||
    entity?.member?.guild ||
    (entity?.guildId && entity?.client?.guilds?.cache?.get(String(entity.guildId))) ||
    null;
  const userId =
    entity?.user?.id ||
    entity?.author?.id ||
    entity?.member?.id ||
    entity?.member?.user?.id ||
    null;
  return { guild, userId: userId ? String(userId) : null };
}

async function hasAnyRoleWithEventGrants(member?, roleIds?, guildId?, userId?) {
  const normalized = normalizeRoleList(roleIds);
  if (!Array.isArray(normalized) || normalized.length === 0) return false;
  const gid = guildId || member?.guild?.id;
  const uid = userId || member?.id;
  if (!gid || !uid) return false;
  for (const roleId of normalized) {
    if (roleId === IDs.roles.Level50 && (await hasEventWeekWinnerGrant(gid, uid, 2))) return true;
    if (roleId === IDs.roles.Level70 && (await hasEventWeekWinnerGrant(gid, uid, 3))) return true;
  }
  return false;
}

export = { EMPTY_PERMISSIONS, LIVE_MEMBER_CACHE_TTL_MS, liveMemberCache, STAFF_GUIDE_BUTTON_IDS, getStaffGuideAccessRoleIds, isPartnerManagerOnlyMember, getIdsConfig, resolveRoleReference, normalizeRoleList, resolveLiveMemberGuildUser, hasAnyRoleWithEventGrants };
