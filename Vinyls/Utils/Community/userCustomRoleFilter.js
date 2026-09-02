const IDs = require("../Config/ids");
const { collectHogwartsSystemRoleIds } = require("../Web/hogwartsSortingConfig");

function looksLikeUserCustomRoleName(name) {
  const n = String(name || "");
  return n.includes("༄") || n.startsWith("✦") || n.startsWith("★");
}

function stripCustomRoleMarker(name) {
  return String(name || "")
    .replace(/^[\s༄✦★]+/u, "")
    .trim();
}

const EXTRA_NON_CUSTOM_ROLE_IDS = new Set([
  "1442568888096391260",
  "1442568890075971724",
  "1472903558792740956",
]);

const SYSTEMISH_CUSTOM_NAME_RE =
  /^(bots?\s*ufficiali|official\s*bots?|staff|founder|manager|admin|director|helper|mod(?:erator)?|member|muted|everyone)$/i;

function collectBlockedSystemRoleIds() {
  const out = new Set(collectHogwartsSystemRoleIds(null));
  for (const id of EXTRA_NON_CUSTOM_ROLE_IDS) out.add(id);
  return out;
}

function collectHogwartsOnlyRoleIds() {
  return collectHogwartsSystemRoleIds(null);
}

function isListableUserCustomRole(role, { blockedRoleIds = null } = {}) {
  if (!role?.id) return false;
  if (role.managed) return false;
  const blocked = blockedRoleIds || collectBlockedSystemRoleIds();
  if (blocked.has(String(role.id))) return false;
  if (!looksLikeUserCustomRoleName(role.name)) return false;
  const bare = stripCustomRoleMarker(role.name);
  if (SYSTEMISH_CUSTOM_NAME_RE.test(bare)) return false;
  return true;
}

module.exports = {
  looksLikeUserCustomRoleName,
  stripCustomRoleMarker,
  collectHogwartsOnlyRoleIds,
  collectBlockedSystemRoleIds,
    collectFixedGuildRoleIds: collectBlockedSystemRoleIds,
  isListableUserCustomRole,
  EXTRA_NON_CUSTOM_ROLE_IDS,
};
