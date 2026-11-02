/** Permessi: controlli sui ruoli e permessi del membro (anche rileggendolo da Discord). */
const { normalizePermissionList } = require("./permReferences") as typeof import("./permReferences");

function hasAllPermissions(member?, permissionFlags?) {
  const normalized = normalizePermissionList(permissionFlags);
  if (!Array.isArray(normalized)) return false;
  if (normalized.length === 0) return false;
  const memberPermissions = member?.permissions;
  if (!memberPermissions || typeof memberPermissions.has !== "function")
    return false;
  return normalized.every((flag?) => memberPermissions.has(flag));
}

export = { hasAllPermissions };
