const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const EMPTY_PERMISSIONS = {
  slash: {},
  prefix: {},
  channels: {},
  buttons: {},
  selectMenus: {},
  modals: {},
};

/**
 * @param {object} options
 * @param {object} options.ids - bot IDs registry (roles.*)
 * @param {string[]} [options.permissionsCandidates] absolute paths to permissions.json
 * @param {number} [options.cacheTtlMs]
 * @param {boolean} [options.normalizeRoles=true] resolve ids.roles.* in slash/prefix trees
 * @param {(parsed: object) => void} [options.transformParsed] mutate raw JSON before normalize
 */
function createPermissionsStore(options: Record<string, any> = {}) {
  const IDs = options.ids || {};
  const normalizeRoles = options.normalizeRoles !== false;
  const transformParsed =
    typeof options.transformParsed === "function" ? options.transformParsed : null;
  const PERMISSIONS_CACHE_TTL_MS = Math.max(1_000, Number(options.cacheTtlMs || 30_000));
  const PERMISSIONS_CANDIDATES = Array.isArray(options.permissionsCandidates)
    ? options.permissionsCandidates
    : [
        path.resolve(String(options.botRoot || process.cwd()), "permissions.json"),
        path.join(process.cwd(), "permissions.json"),
      ];
  let cache = { filePath: null, mtimeMs: 0, data: EMPTY_PERMISSIONS, expiresAt: 0 };

  function resolveRoleReference(value?) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{16,20}$/.test(raw)) return raw;
    let key = raw;
    if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
    else if (key.startsWith("roles.")) key = key.slice("roles.".length);
    const resolved = IDs?.roles?.[key];
    return resolved ? String(resolved) : null;
  }

  function normalizeRoleList(roleIds?) {
    if (!Array.isArray(roleIds)) return roleIds;
    return roleIds.map((value?) => resolveRoleReference(value)).filter(Boolean);
  }

  function normalizePermissionTree(node?) {
    if (Array.isArray(node)) return normalizeRoleList(node);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = normalizePermissionTree(value);
    }
    return out;
  }

  function loadPermissions() {
    try {
      const now = Date.now();
      if (cache.data && cache.expiresAt > now) return cache.data;
      const permissionsPath =
        PERMISSIONS_CANDIDATES.find((candidate?) => fs.existsSync(candidate)) || null;
      if (!permissionsPath) return EMPTY_PERMISSIONS;
      const stat = fs.statSync(permissionsPath);
      if (
        cache.data &&
        cache.filePath === permissionsPath &&
        cache.mtimeMs === stat.mtimeMs
      ) {
        cache.expiresAt = now + PERMISSIONS_CACHE_TTL_MS;
        return cache.data;
      }
      const raw = fs.readFileSync(permissionsPath, "utf8");
      const parsed = JSON.parse(raw) || {};
      if (transformParsed) {
        try {
          transformParsed(parsed);
        } catch (_) {}
      }
      const normalized = {
        slash: normalizeRoles ? normalizePermissionTree(parsed?.slash || {}) : parsed?.slash || {},
        prefix: normalizeRoles ? normalizePermissionTree(parsed?.prefix || {}) : parsed?.prefix || {},
        channels: parsed?.channels || {},
        buttons: parsed?.buttons || {},
        selectMenus: parsed?.selectMenus || {},
        modals: parsed?.modals || {},
      };
      cache = {
        filePath: permissionsPath,
        mtimeMs: stat.mtimeMs,
        data: normalized,
        expiresAt: now + PERMISSIONS_CACHE_TTL_MS,
      };
      return cache.data;
    } catch {
      return EMPTY_PERMISSIONS;
    }
  }

  return { EMPTY_PERMISSIONS, loadPermissions, resolveRoleReference };
}

export = { createPermissionsStore, EMPTY_PERMISSIONS };
