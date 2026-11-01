#!/usr/bin/env node
"use strict";
/**
 * Shared emergency role-id remap (post role-restore disaster).
 * Maps deleted/old role snowflakes -> current live IDs.
 *
 * Only remaps snowflakes present in roleIdRemap.emergency.json (never channels/users).
 */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

let forwardCache = null;
let reverseCache = null;

function loadMaps() {
  if (forwardCache && reverseCache) return { forward: forwardCache, reverse: reverseCache };
  const forward = Object.create(null);
  const reverse = Object.create(null);
  try {
    const fp = path.join(__dirname, "../../Data/roleIdRemap.emergency.json");
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    const map = raw?.idRemap && typeof raw.idRemap === "object" ? raw.idRemap : {};
    for (const [oldId, newId] of Object.entries(map)) {
      const o = String(oldId || "").trim();
      const n = String(newId || "").trim();
      if (!/^\d{16,22}$/.test(o) || !/^\d{16,22}$/.test(n)) continue;
      forward[o] = n;
      if (!reverse[n]) reverse[n] = [];
      reverse[n].push(o);
    }
  } catch (_) {
    /* missing remap file is fine */
  }
  forwardCache = forward;
  reverseCache = reverse;
  return { forward, reverse };
}

function normalizeRoleId(raw?) {
  const s = String(raw || "").trim();
  return /^\d{16,22}$/.test(s) ? s : "";
}

/** Old -> new only when known; otherwise identity. */
function remapKnownRoleSnowflake(roleId?) {
  const id = normalizeRoleId(roleId);
  if (!id) return "";
  const { forward } = loadMaps();
  return normalizeRoleId(forward[id]) || id;
}

/** Old -> new (or identity if unknown). Alias of remapKnownRoleSnowflake. */
function remapRoleIdForward(roleId?) {
  return remapKnownRoleSnowflake(roleId);
}

/**
 * Expand a configured role id into all acceptable ids:
 * itself, remapped forward, and any old ids that map to it.
 */
function expandRemappedRoleIds(roleId?) {
  const id = normalizeRoleId(roleId);
  if (!id) return [];
  const { forward, reverse } = loadMaps();
  const out = new Set();
  out.add(id);
  const mapped = normalizeRoleId(forward[id]);
  if (mapped) out.add(mapped);
  const olds = reverse[id] || [];
  for (const o of olds) out.add(o);
  return [...out];
}

function memberRoleIdSet(member?) {
  const ids = new Set();
  if (!member) return ids;
  const cache = member?.roles?.cache;
  if (cache && typeof cache.keys === "function") {
    for (const roleId of cache.keys()) {
      const id = normalizeRoleId(roleId);
      if (id) ids.add(id);
    }
  }
  const rawRoles = member?.roles;
  if (Array.isArray(rawRoles)) {
    for (const roleId of rawRoles) {
      const id = normalizeRoleId(roleId);
      if (id) ids.add(id);
    }
  } else if (rawRoles && Array.isArray(rawRoles._roles)) {
    for (const roleId of rawRoles._roles) {
      const id = normalizeRoleId(roleId);
      if (id) ids.add(id);
    }
  }
  if (Array.isArray(member?._roles)) {
    for (const roleId of member._roles) {
      const id = normalizeRoleId(roleId);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function memberHasAnyRemappedRole(member?, roleIds?) {
  const wanted = new Set();
  for (const raw of Array.isArray(roleIds) ? roleIds : [roleIds]) {
    for (const id of expandRemappedRoleIds(raw)) wanted.add(id);
  }
  if (!wanted.size) return false;
  const have = memberRoleIdSet(member);
  for (const id of wanted) {
    if (have.has(id)) return true;
  }
  return false;
}

function memberHasRoleNameMatch(member?, pattern?) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern || ""), "i");
  const cache = member?.roles?.cache;
  if (!cache || typeof cache.values !== "function") return false;
  for (const role of cache.values()) {
    const name = String(role?.name || "")
      .replace(/<a?:[^:]+:\d+>/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (re.test(name)) return true;
  }
  return false;
}

function remapRoleIdsInString(text?) {
  if (typeof text !== "string" || !text) return text;
  const { forward } = loadMaps();
  if (!forward || !Object.keys(forward).length) return text;
  let out = text;
  // Role mentions first.
  out = out.replace(/<@&(\d{16,22})>/g, (full?, id?) => {
    const mapped = forward[id];
    return mapped ? `<@&${mapped}>` : full;
  });
  // Bare snowflakes that are known old role ids (safe: only keys in remap).
  out = out.replace(/(^|[^0-9])(\d{16,22})(?![0-9])/g, (full?, pre?, id?) => {
    const mapped = forward[id];
    return mapped ? `${pre}${mapped}` : full;
  });
  return out;
}

/**
 * Deep in-place remap of known old role snowflakes inside any JSON-like value.
 * Does not touch channel/user ids unless they appear as old role keys in the map.
 */
function remapDeepRoleIdsInPlace(value?, seen?) {
  const bag = seen || new WeakSet();
  if (value == null) return value;
  if (typeof value === "string") return remapRoleIdsInString(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (typeof value !== "object") return value;
  if (bag.has(value)) return value;
  bag.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const cur = value[i];
      if (typeof cur === "string") value[i] = remapRoleIdsInString(cur);
      else if (cur && typeof cur === "object") remapDeepRoleIdsInPlace(cur, bag);
    }
    return value;
  }

  for (const key of Object.keys(value)) {
    const cur = value[key];
    if (typeof cur === "string") value[key] = remapRoleIdsInString(cur);
    else if (cur && typeof cur === "object") remapDeepRoleIdsInPlace(cur, bag);
  }
  return value;
}

function applyEmergencyRoleRemapToIds(ids?) {
  if (!ids || typeof ids !== "object") return ids;
  // Prefer full id remap (roles + channels + emoji) when available.
  try {
    const { applyEmergencyIdRemapToIds } = require("./emergencyIdRemap") as typeof import("./emergencyIdRemap");
    return applyEmergencyIdRemapToIds(ids);
  } catch (_) {
    /* fall through to role-only */
  }
  if (ids.roles && typeof ids.roles === "object") remapDeepRoleIdsInPlace(ids.roles);
  if (ids.aliases?.roles && typeof ids.aliases.roles === "object") {
    remapDeepRoleIdsInPlace(ids.aliases.roles);
  }
  if (ids.aliasEntries?.roles && typeof ids.aliasEntries.roles === "object") {
    remapDeepRoleIdsInPlace(ids.aliasEntries.roles);
  }
  if (Array.isArray(ids.websiteMaintenanceBypassRoleIds)) {
    remapDeepRoleIdsInPlace(ids.websiteMaintenanceBypassRoleIds);
  }
  // Common nested maps that store role snowflakes by guild/key.
  for (const key of Object.keys(ids)) {
    if (key === "channels" || key === "categories" || key === "bots" || key === "guilds") continue;
    if (/role/i.test(key) && ids[key] && typeof ids[key] === "object") {
      remapDeepRoleIdsInPlace(ids[key]);
    }
  }
  return ids;
}

function applyEmergencyRoleRemapToConfig(config?) {
  if (!config || typeof config !== "object") return config;
  return remapDeepRoleIdsInPlace(config);
}

/** Outgoing Discord payloads: content + allowedMentions.roles + embed text fields. */
function applyEmergencyRoleRemapToOutgoingPayload(payload?) {
  if (payload == null) return payload;
  if (typeof payload === "string") return remapRoleIdsInString(payload);
  if (typeof payload !== "object" || Array.isArray(payload)) return payload;

  if (typeof payload.content === "string") {
    payload.content = remapRoleIdsInString(payload.content);
  }
  if (payload.allowedMentions && typeof payload.allowedMentions === "object") {
    const roles = payload.allowedMentions.roles;
    if (Array.isArray(roles)) {
      payload.allowedMentions.roles = roles.map((id?) => remapKnownRoleSnowflake(id) || id);
    }
  }
  if (Array.isArray(payload.embeds)) {
    for (const embed of payload.embeds) {
      if (!embed || typeof embed !== "object") continue;
      const data = typeof embed.toJSON === "function" ? null : embed;
      const target = data || embed.data || embed;
      if (!target || typeof target !== "object") continue;
      for (const field of ["title", "description", "url"]) {
        if (typeof target[field] === "string") target[field] = remapRoleIdsInString(target[field]);
      }
      if (target.footer && typeof target.footer.text === "string") {
        target.footer.text = remapRoleIdsInString(target.footer.text);
      }
      if (target.author && typeof target.author.name === "string") {
        target.author.name = remapRoleIdsInString(target.author.name);
      }
      if (Array.isArray(target.fields)) {
        for (const f of target.fields) {
          if (!f || typeof f !== "object") continue;
          if (typeof f.name === "string") f.name = remapRoleIdsInString(f.name);
          if (typeof f.value === "string") f.value = remapRoleIdsInString(f.value);
        }
      }
    }
  }
  return payload;
}

export = {
  normalizeRoleId,
  remapRoleIdForward,
  remapKnownRoleSnowflake,
  expandRemappedRoleIds,
  memberHasAnyRemappedRole,
  memberHasRoleNameMatch,
  remapDeepRoleIdsInPlace,
  applyEmergencyRoleRemapToIds,
  applyEmergencyRoleRemapToConfig,
  applyEmergencyRoleRemapToOutgoingPayload,
  _resetCacheForTests() {
    forwardCache = null;
    reverseCache = null;
  },
};
