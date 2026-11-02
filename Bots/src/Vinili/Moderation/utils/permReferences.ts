/** Permessi: lettura di ruoli, permessi e canali scritti in permissions.json. */
const { PermissionsBitField, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getStaffCmdsThreadIdsCache } = require("../../Staff/utils/staffCmdsChannelUtils") as typeof import("../../Staff/utils/staffCmdsChannelUtils");
const { getIdsConfig, normalizeRoleList } = require("./permStaffGuide") as typeof import("./permStaffGuide");

const HIGH_STAFF_COMMANDS_ZONE_TOKEN = "__zone:highStaffCommands";
const PM_COMMANDS_THREAD_ZONE_TOKEN = "__zone:pmCommandsThread";

function asRequiredRoles(roles?) {
  if (roles == null) return null;
  const list = normalizeRoleList(Array.isArray(roles) ? roles : [roles]);
  return Array.isArray(list) && list.length ? list : null;
}

const PERMISSION_NAME_LOOKUP = (() => { const map = new Map(); const sources = [PermissionsBitField?.Flags, PermissionFlagsBits]; for (const source of sources) { const entries = Object.entries(source || {}); for (const [name, value] of entries) { if (value == null) continue; const exact = String(name).trim().toLowerCase(); const compact = String(name).replace(/[^a-z0-9]/gi, "").toLowerCase(); map.set(exact, value); map.set(compact, value); } } return map; })();
 function resolvePermissionReference(value?) {
  if (value == null) return null;

  if (typeof value === "bigint") return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return BigInt(Math.trunc(value));
    } catch {
      return null;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }

  let key = raw;
  if (key.startsWith("PermissionFlagsBits.")) {
    key = key.slice("PermissionFlagsBits.".length);
  } else if (key.startsWith("PermissionsBitField.Flags.")) {
    key = key.slice("PermissionsBitField.Flags.".length);
  }

  const exact = key.toLowerCase();
  const compact = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    PERMISSION_NAME_LOOKUP.get(exact) ??
    PERMISSION_NAME_LOOKUP.get(compact) ??
    null
  );
}

function normalizePermissionList(permissionFlags?) {
  if (!Array.isArray(permissionFlags)) return permissionFlags;
  const dedup = new Set();
  for (const flag of permissionFlags) {
    const resolved = resolvePermissionReference(flag);
    if (resolved == null) continue;
    dedup.add(String(resolved));
  }
  return Array.from(dedup, (value?) => BigInt((value as any)));
}

function parseChannelReferenceKey(value?) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let key = raw;
  if (key.startsWith("ids.channels.")) key = key.slice("ids.channels.".length);
  else if (key.startsWith("channels.")) key = key.slice("channels.".length);
  return key;
}

function resolveChannelReference(value?) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  const key = parseChannelReferenceKey(raw);
  const idsCfg = typeof IDs !== "undefined" && IDs ? IDs : getIdsConfig();
  if (key === "staffCmdsPmThread") {
    return getStaffCmdsThreadIdsCache().pm || null;
  }
  if (key === "staffCmdsHighThread" || key === "highCmds") {
    return getStaffCmdsThreadIdsCache().high || null;
  }
  const resolved = idsCfg?.channels?.[key];
  if (!resolved) return null;
  return String(resolved);
}

export = { HIGH_STAFF_COMMANDS_ZONE_TOKEN, PM_COMMANDS_THREAD_ZONE_TOKEN, asRequiredRoles, resolvePermissionReference, normalizePermissionList, parseChannelReferenceKey, resolveChannelReference };
