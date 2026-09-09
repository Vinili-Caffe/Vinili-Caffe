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
  for (const id of Object.values(IDs?.roles || {})) {
    const sid = String(id || "").trim();
    if (sid) out.add(sid);
  }
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

function isCustomRolePurgeDryRun() {
  return String(process.env.VC_CUSTOM_ROLE_PURGE_DRY_RUN || "").trim() === "1";
}

function isDocumentedCustomPerkRoleId(roleId, doc) {
  const id = String(roleId || "").trim();
  if (!id || !doc) return false;
  return id === String(doc.roleId || "").trim() || id === String(doc.secondaryRoleId || "").trim();
}

/** Hard gate before any Discord role delete for custom perks. */
function canSafelyDeleteCustomPerkRole(role, doc, { blockedRoleIds = null } = {}) {
  if (!role?.id || !doc) return { ok: false, reason: "missing_role_or_doc" };
  const blocked = blockedRoleIds || collectBlockedSystemRoleIds();
  const id = String(role.id);
  if (blocked.has(id)) return { ok: false, reason: "blocked_system_role" };
  if (role.managed) return { ok: false, reason: "managed_role" };
  if (!isDocumentedCustomPerkRoleId(id, doc)) return { ok: false, reason: "not_in_mongo_doc" };
  return { ok: true };
}

module.exports = {
  looksLikeUserCustomRoleName,
  stripCustomRoleMarker,
  collectHogwartsOnlyRoleIds,
  collectBlockedSystemRoleIds,
  collectFixedGuildRoleIds: collectBlockedSystemRoleIds,
  isListableUserCustomRole,
  isCustomRolePurgeDryRun,
  isDocumentedCustomPerkRoleId,
  canSafelyDeleteCustomPerkRole,
  EXTRA_NON_CUSTOM_ROLE_IDS,
};
