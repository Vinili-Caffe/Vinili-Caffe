const IDs = require("../Config/ids");
const { collectHogwartsSystemRoleIds } = require("../Web/hogwartsSortingConfig");

/** Marker usato quando l'utente crea un ruolo da +profile. */
function looksLikeUserCustomRoleName(name) {
  const n = String(name || "");
  return n.includes("༄") || n.startsWith("✦") || n.startsWith("★");
}

function stripCustomRoleMarker(name) {
  return String(name || "")
    .replace(/^[\s༄✦★]+/u, "")
    .trim();
}

/** Ruoli di sistema che qualcuno ha rinominato con ༄ (es. Bots Ufficiali). */
const EXTRA_NON_CUSTOM_ROLE_IDS = new Set([
  "1442568888096391260",
  "1442568890075971724",
  "1472903558792740956", // ༄ Bots Ufficiali
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

/**
 * Ruoli ammessi su /ruoli e nelle richieste sito:
 * solo custom creati dagli utenti (prefisso ༄ / ✦ / ★), non system/hogwarts/managed.
 */
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
  /** @deprecated */
  collectFixedGuildRoleIds: collectBlockedSystemRoleIds,
  isListableUserCustomRole,
  EXTRA_NON_CUSTOM_ROLE_IDS,
};
