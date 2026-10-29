"use strict";
/**
 * Post-wipe ID remap: roles + channels (+ emoji/sticker).
 * Persists maps after backup load; applied at boot onto ids.js.
 *
 * Files:
 * - Vinyls/Data/idRemap.emergency.json  (full)
 * - Vinyls/Data/roleIdRemap.emergency.json (legacy role-only, still written/read)
 */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const DATA_DIR = path.join(__dirname, "../../Data");
const FULL_REMAP_PATH = path.join(DATA_DIR, "idRemap.emergency.json");
const ROLE_REMAP_PATH = path.join(DATA_DIR, "roleIdRemap.emergency.json");

let cache = null;

function isSnowflake(raw?) {
  return /^\d{16,22}$/.test(String(raw || "").trim());
}

function normalizeId(raw?) {
  const s = String(raw || "").trim();
  return isSnowflake(s) ? s : "";
}

function mapFromObject(obj?) {
  const out = Object.create(null);
  if (!obj || typeof obj !== "object") return out;
  for (const [oldId, newId] of Object.entries(obj)) {
    const o = normalizeId(oldId);
    const n = normalizeId(newId);
    if (!o || !n || o === n) continue;
    out[o] = n;
  }
  return out;
}

function mapFromMapLike(mapLike?) {
  const out = Object.create(null);
  if (!mapLike) return out;
  if (mapLike instanceof Map) {
    for (const [oldId, newId] of mapLike.entries()) {
      const o = normalizeId(oldId);
      const n = normalizeId(newId);
      if (!o || !n || o === n) continue;
      out[o] = n;
    }
    return out;
  }
  return mapFromObject(mapLike);
}

function loadMaps() {
  if (cache) return cache;
  const roleRemap = Object.create(null);
  const channelRemap = Object.create(null);
  const emojiRemap = Object.create(null);
  const stickerRemap = Object.create(null);

  try {
    const raw = JSON.parse(fs.readFileSync(FULL_REMAP_PATH, "utf8"));
    Object.assign(roleRemap, mapFromObject(raw?.roleRemap || raw?.idRemap));
    Object.assign(channelRemap, mapFromObject(raw?.channelRemap));
    Object.assign(emojiRemap, mapFromObject(raw?.emojiRemap));
    Object.assign(stickerRemap, mapFromObject(raw?.stickerRemap));
  } catch (_) {
    /* missing ok */
  }

  try {
    const raw = JSON.parse(fs.readFileSync(ROLE_REMAP_PATH, "utf8"));
    Object.assign(roleRemap, mapFromObject(raw?.idRemap || raw?.roleRemap));
  } catch (_) {
    /* missing ok */
  }

  cache = { roleRemap, channelRemap, emojiRemap, stickerRemap };
  return cache;
}

function resetIdRemapCache() {
  cache = null;
}

function remapKnown(kind?, id?) {
  const sid = normalizeId(id);
  if (!sid) return "";
  const maps = loadMaps();
  const bag =
    kind === "channel"
      ? maps.channelRemap
      : kind === "emoji"
        ? maps.emojiRemap
        : kind === "sticker"
          ? maps.stickerRemap
          : maps.roleRemap;
  return normalizeId(bag[sid]) || sid;
}

function remapRoleIdForward(roleId?) {
  return remapKnown("role", roleId);
}

function remapChannelIdForward(channelId?) {
  return remapKnown("channel", channelId);
}

function remapEmojiIdForward(emojiId?) {
  return remapKnown("emoji", emojiId);
}

function remapIdsInString(text?, kinds = ["role", "channel", "emoji"]) {
  if (typeof text !== "string" || !text) return text;
  const maps = loadMaps();
  const forward = Object.create(null);
  if (kinds.includes("role")) Object.assign(forward, maps.roleRemap);
  if (kinds.includes("channel")) Object.assign(forward, maps.channelRemap);
  if (kinds.includes("emoji")) Object.assign(forward, maps.emojiRemap);
  if (kinds.includes("sticker")) Object.assign(forward, maps.stickerRemap);
  if (!Object.keys(forward).length) return text;

  let out = text;
  out = out.replace(/<@&(\d{16,22})>/g, (full?, id?) => {
    const mapped = maps.roleRemap[id];
    return mapped ? `<@&${mapped}>` : full;
  });
  out = out.replace(/<#(\d{16,22})>/g, (full?, id?) => {
    const mapped = maps.channelRemap[id];
    return mapped ? `<#${mapped}>` : full;
  });
  out = out.replace(/<(a?):(\w+):(\d{16,22})>/g, (full?, a?, name?, id?) => {
    const mapped = maps.emojiRemap[id];
    return mapped ? `<${a || ""}:${name}:${mapped}>` : full;
  });
  out = out.replace(/(^|[^0-9])(\d{16,22})(?![0-9])/g, (full?, pre?, id?) => {
    const mapped = forward[id];
    return mapped ? `${pre}${mapped}` : full;
  });
  return out;
}

function remapDeepIdsInPlace(value?, kinds = ["role", "channel", "emoji"], seen?) {
  const bag = seen || new WeakSet();
  if (value == null) return value;
  if (typeof value === "string") return remapIdsInString(value, kinds);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (typeof value !== "object") return value;
  if (bag.has(value)) return value;
  bag.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const cur = value[i];
      if (typeof cur === "string") value[i] = remapIdsInString(cur, kinds);
      else if (cur && typeof cur === "object") remapDeepIdsInPlace(cur, kinds, bag);
    }
    return value;
  }

  for (const key of Object.keys(value)) {
    const cur = value[key];
    if (typeof cur === "string") value[key] = remapIdsInString(cur, kinds);
    else if (cur && typeof cur === "object") remapDeepIdsInPlace(cur, kinds, bag);
  }
  return value;
}

function applyEmergencyIdRemapToIds(ids?) {
  if (!ids || typeof ids !== "object") return ids;
  if (ids.roles) remapDeepIdsInPlace(ids.roles, ["role"]);
  if (ids.channels) remapDeepIdsInPlace(ids.channels, ["channel"]);
  if (ids.categories) remapDeepIdsInPlace(ids.categories, ["channel"]);
  if (ids.emojis) remapDeepIdsInPlace(ids.emojis, ["emoji"]);
  if (ids.aliases?.roles) remapDeepIdsInPlace(ids.aliases.roles, ["role"]);
  if (ids.aliases?.channels) remapDeepIdsInPlace(ids.aliases.channels, ["channel"]);
  if (ids.aliasEntries?.roles) remapDeepIdsInPlace(ids.aliasEntries.roles, ["role"]);
  if (ids.aliasEntries?.channels) remapDeepIdsInPlace(ids.aliasEntries.channels, ["channel"]);
  if (Array.isArray(ids.websiteMaintenanceBypassRoleIds)) {
    remapDeepIdsInPlace(ids.websiteMaintenanceBypassRoleIds, ["role"]);
  }
  if (Array.isArray(ids.publicVoiceHubChannelIds)) {
    remapDeepIdsInPlace(ids.publicVoiceHubChannelIds, ["channel"]);
  }
  for (const key of Object.keys(ids)) {
    if (key === "bots" || key === "guilds") continue;
    if (!ids[key] || typeof ids[key] !== "object") continue;
    if (/role/i.test(key)) remapDeepIdsInPlace(ids[key], ["role"]);
    if (/channel|categor/i.test(key)) remapDeepIdsInPlace(ids[key], ["channel"]);
    if (/emoji/i.test(key)) remapDeepIdsInPlace(ids[key], ["emoji"]);
  }
  return ids;
}

function writeJsonAtomic(filePath?, payload?) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * Persist maps after applyBackupToGuild. Merges with existing maps (old→new).
 */
function persistGuildIdRemap({
  guildId,
  backupId,
  roleMap,
  channelMap,
  emojiMap,
  stickerMap,
}: any = {}) {
  const roleRemap = mapFromMapLike(roleMap);
  const channelRemap = mapFromMapLike(channelMap);
  const emojiRemap = mapFromMapLike(emojiMap);
  const stickerRemap = mapFromMapLike(stickerMap);

  let prev: Record<string, any> = {};
  try {
    prev = JSON.parse(fs.readFileSync(FULL_REMAP_PATH, "utf8")) || {};
  } catch (_) {
    prev = {};
  }

  const payload = {
    at: new Date().toISOString(),
    guildId: String(guildId || "").trim() || null,
    backupId: String(backupId || "").trim().toUpperCase() || null,
    roleRemap: { ...mapFromObject(prev.roleRemap || prev.idRemap), ...roleRemap },
    channelRemap: { ...mapFromObject(prev.channelRemap), ...channelRemap },
    emojiRemap: { ...mapFromObject(prev.emojiRemap), ...emojiRemap },
    stickerRemap: { ...mapFromObject(prev.stickerRemap), ...stickerRemap },
  };

  writeJsonAtomic(FULL_REMAP_PATH, payload);
  writeJsonAtomic(ROLE_REMAP_PATH, {
    at: payload.at,
    backupId: payload.backupId,
    idRemap: payload.roleRemap,
  });
  resetIdRemapCache();
  return payload;
}

export = {
  FULL_REMAP_PATH,
  ROLE_REMAP_PATH,
  normalizeId,
  remapRoleIdForward,
  remapChannelIdForward,
  remapEmojiIdForward,
  remapIdsInString,
  remapDeepIdsInPlace,
  applyEmergencyIdRemapToIds,
  persistGuildIdRemap,
  resetIdRemapCache,
  loadMaps,
};
