/**
 * Allinea la wiki ai comandi visibili con +help per un membro che ha solo il ruolo Member
 * (stessa logica di canMemberSeeEntry in Vinyls/Prefix/Utility/help.js).
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function resolveRoleReference(value, ids) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
  else if (key.startsWith("roles.")) key = key.slice("roles.".length);

  const resolved = ids?.roles?.[key];
  if (!resolved) return null;
  return String(resolved);
}

function normalizeRoleList(roleIds, ids) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value) => resolveRoleReference(value, ids)).filter(Boolean);
}

function normalizePermissionTree(node, ids) {
  if (Array.isArray(node)) return normalizeRoleList(node, ids);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = normalizePermissionTree(value, ids);
  }
  return out;
}

function loadPermissionsNormalized(botRoot, ids) {
  const p = path.join(botRoot, "permissions.json");
  if (!fs.existsSync(p)) return { slash: {}, prefix: {} };
  try {
    const parsed = JSON.parse(readUtf8(p));
    return {
      slash: normalizePermissionTree(parsed?.slash || {}, ids),
      prefix: normalizePermissionTree(parsed?.prefix || {}, ids),
    };
  } catch {
    return { slash: {}, prefix: {} };
  }
}

function loadIds(botRoot) {
  const pkg = path.join(botRoot, "package.json");
  const req = createRequire(pathToFileURL(pkg).href);
  return req("./Utils/Config/ids.js");
}

function hasAnyRole(memberRoles, roleIds) {
  if (!memberRoles || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roleIds.some((roleId) => memberRoles.has(String(roleId)));
}

function canMemberSeeEntry(entry, memberRoles, ids) {
  const roles = entry?.roles;
  if (!Array.isArray(roles) || roles.length === 0) return true;
  if (hasAnyRole(memberRoles, roles)) return true;
  const memberHasMemberRole =
    ids.roles.Member && memberRoles?.has(String(ids.roles.Member));
  const entryOnlyVip =
    roles.length > 0 &&
    roles.every((r) => String(r) === String(ids.roles.VIP || ""));
  if (memberHasMemberRole && entryOnlyVip) return true;
  return false;
}

export function getCommandPermissionNode(permissionRoot, commandName) {
  if (!permissionRoot || typeof permissionRoot !== "object") return null;
  const exact = permissionRoot[commandName];
  if (typeof exact !== "undefined") return exact;
  const wanted = String(commandName || "").trim().toLowerCase();
  if (!wanted) return null;
  for (const [key, value] of Object.entries(permissionRoot)) {
    if (String(key || "").trim().toLowerCase() === wanted) return value;
  }
  return null;
}

function getPrefixPermissionRaw(permissions, commandName) {
  const p = permissions?.prefix;
  if (!p || typeof p !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(p, commandName)) return p[commandName];
  const wanted = String(commandName || "").trim().toLowerCase();
  if (!wanted) return undefined;
  for (const [key, value] of Object.entries(p)) {
    if (String(key || "").trim().toLowerCase() === wanted) return value;
  }
  return undefined;
}

export function getPrefixPermissionConfig(permissions, commandName) {
  const raw = getPrefixPermissionRaw(permissions, commandName);
  if (Array.isArray(raw)) {
    return { roles: raw, subcommands: {} };
  }
  if (raw && typeof raw === "object") {
    return {
      roles: Array.isArray(raw.roles) ? raw.roles : null,
      subcommands:
        raw.subcommands && typeof raw.subcommands === "object"
          ? raw.subcommands
          : {},
    };
  }
  return { roles: null, subcommands: {} };
}

function normalizePermissionRoles(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.roles)) {
    return value.roles;
  }
  return null;
}

/**
 * Slash / context: visibile in wiki se il membro “solo Member” può usare almeno la base
 * o una subcommand (stesso spirito di buildEntries + canMemberSeeEntry).
 */
export function isSlashOrContextVisibleOnWiki(permNode, memberRoleSet, ids) {
  if (permNode == null) return true;
  if (Array.isArray(permNode)) {
    return canMemberSeeEntry({ roles: permNode }, memberRoleSet, ids);
  }
  if (permNode && typeof permNode === "object") {
    const baseRoles = normalizePermissionRoles(permNode);
    const subs =
      permNode.subcommands && typeof permNode.subcommands === "object"
        ? permNode.subcommands
        : null;
    const subKeys = subs ? Object.keys(subs) : [];
    if (subKeys.length) {
      const baseOk = canMemberSeeEntry({ roles: baseRoles }, memberRoleSet, ids);
      const anySub = subKeys.some((k) => {
        const sr = Array.isArray(subs[k]) ? subs[k] : normalizePermissionRoles(subs[k]);
        return canMemberSeeEntry({ roles: sr }, memberRoleSet, ids);
      });
      return baseOk || anySub;
    }
    return canMemberSeeEntry({ roles: baseRoles }, memberRoleSet, ids);
  }
  return true;
}

/**
 * Prefix: come buildEntries — se ci sono canonical/subcommands, basta che una riga sia visibile.
 */
export function isPrefixCommandVisibleOnWiki(
  permCfg,
  canonicalSubs,
  memberRoleSet,
  ids,
) {
  const subs = Array.isArray(canonicalSubs)
    ? Array.from(
        new Set(
          canonicalSubs.map((s) => String(s || "").trim().toLowerCase()).filter(Boolean),
        ),
      )
    : [];
  if (!subs.length) {
    const roles = Array.isArray(permCfg?.roles) ? permCfg.roles : null;
    return canMemberSeeEntry({ roles }, memberRoleSet, ids);
  }
  for (const sub of subs) {
    const subRaw = permCfg?.subcommands?.[sub];
    const roles = Array.isArray(subRaw)
      ? subRaw
      : Array.isArray(permCfg?.roles)
        ? permCfg.roles
        : null;
    if (canMemberSeeEntry({ roles }, memberRoleSet, ids)) return true;
  }
  return false;
}

export function buildWikiMemberRoleSet(ids) {
  const s = new Set();
  const m = ids?.roles?.Member;
  if (m != null) s.add(String(m));
  return s;
}

/**
 * @param {string} botRoot Vinyls o Coffee
 * @returns {{ ids: object; permissions: { slash: object; prefix: object }; memberRoleSet: Set<string> } | null}
 */
export function loadWikiHelpContext(botRoot) {
  if (!fs.existsSync(botRoot)) return null;
  const ids = loadIds(botRoot);
  const permissions = loadPermissionsNormalized(botRoot, ids);
  const memberRoleSet = buildWikiMemberRoleSet(ids);
  return { ids, permissions, memberRoleSet };
}