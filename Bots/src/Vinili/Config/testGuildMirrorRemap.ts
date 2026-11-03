"use strict";
/**
 * Main → test guild ID mirror (roles/channels).
 * Scoped: NEVER applied globally onto ids.js (would break main).
 * Use remap*ForGuild(guildId, id) when resolving entities on the test guild.
 */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const IDs = require("./ids") as typeof import("./ids");

const DATA_DIR = path.join(__dirname, "../Data");
const REMAP_PATH = path.join(DATA_DIR, "idRemap.testMirror.json");

let cache = null;

function isSnowflake(raw?) {
  return /^\d{16,22}$/.test(String(raw || "").trim());
}

function normalizeId(raw?) {
  const s = String(raw || "").trim();
  return isSnowflake(s) ? s : "";
}

function getTestGuildId() {
  return normalizeId(IDs.guilds?.test);
}

function getMainGuildId() {
  return normalizeId(IDs.guilds?.main);
}

function isTestMirrorGuild(guildId?) {
  const test = getTestGuildId();
  const gid = normalizeId(guildId);
  return Boolean(test && gid && gid === test);
}

function mapFromObject(obj?) {
  const out = Object.create(null);
  if (!obj || typeof obj !== "object") return out;
  for (const [oldId, newId] of Object.entries(obj)) {
    const o = normalizeId(oldId);
    const n = normalizeId(newId);
    if (!o || !n) continue;
    out[o] = n;
  }
  return out;
}

function mapFromMapLike(mapLike?) {
  if (!mapLike) return Object.create(null);
  if (mapLike instanceof Map) {
    const out = Object.create(null);
    for (const [a, b] of mapLike.entries()) {
      const o = normalizeId(a);
      const n = normalizeId(b);
      if (o && n) out[o] = n;
    }
    return out;
  }
  return mapFromObject(mapLike);
}

function loadMaps() {
  if (cache) return cache;
  const roleRemap = Object.create(null);
  const channelRemap = Object.create(null);
  try {
    const raw = JSON.parse(fs.readFileSync(REMAP_PATH, "utf8"));
    Object.assign(roleRemap, mapFromObject(raw?.roleRemap));
    Object.assign(channelRemap, mapFromObject(raw?.channelRemap));
  } catch (_) {
    /* missing ok */
  }
  cache = { roleRemap, channelRemap };
  return cache;
}

function resetTestMirrorRemapCache() {
  cache = null;
}

function persistTestMirrorMaps({ roleMap, channelMap, meta = {} }: any = {}) {
  const roleRemap = mapFromMapLike(roleMap);
  const channelRemap = mapFromMapLike(channelMap);
  let prev: Record<string, any> = {};
  try {
    prev = JSON.parse(fs.readFileSync(REMAP_PATH, "utf8")) || {};
  } catch (_) {
    prev = {};
  }
  const payload = {
    at: new Date().toISOString(),
    mainGuildId: getMainGuildId() || null,
    testGuildId: getTestGuildId() || null,
    ...meta,
    roleRemap: { ...mapFromObject(prev.roleRemap), ...roleRemap },
    channelRemap: { ...mapFromObject(prev.channelRemap), ...channelRemap },
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${REMAP_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmp, REMAP_PATH);
  resetTestMirrorRemapCache();
  return payload;
}

/** Drop remap entries for deleted main roles/channels (test-only ids stay). */
function removeMirrorRemapEntries({ roleMainIds = [], channelMainIds = [] } = {}) {
  let prev: Record<string, any> = {};
  try {
    prev = JSON.parse(fs.readFileSync(REMAP_PATH, "utf8")) || {};
  } catch (_) {
    prev = {};
  }
  const roleRemap = mapFromObject(prev.roleRemap);
  const channelRemap = mapFromObject(prev.channelRemap);
  let changed = 0;
  for (const id of roleMainIds) {
    const sid = normalizeId(id);
    if (sid && roleRemap[sid]) {
      delete roleRemap[sid];
      changed += 1;
    }
  }
  for (const id of channelMainIds) {
    const sid = normalizeId(id);
    if (sid && channelRemap[sid]) {
      delete channelRemap[sid];
      changed += 1;
    }
  }
  if (!changed) return { changed: 0 };
  const payload = {
    ...prev,
    at: new Date().toISOString(),
    mainGuildId: getMainGuildId() || null,
    testGuildId: getTestGuildId() || null,
    roleRemap,
    channelRemap,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${REMAP_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmp, REMAP_PATH);
  resetTestMirrorRemapCache();
  return { changed, at: payload.at };
}

function remapRoleIdForGuild(guildId?, roleId?) {
  const sid = normalizeId(roleId);
  if (!sid) return "";
  if (!isTestMirrorGuild(guildId)) return sid;
  const mapped = loadMaps().roleRemap[sid];
  return normalizeId(mapped) || sid;
}

function remapChannelIdForGuild(guildId?, channelId?) {
  const sid = normalizeId(channelId);
  if (!sid) return "";
  if (!isTestMirrorGuild(guildId)) return sid;
  const mapped = loadMaps().channelRemap[sid];
  return normalizeId(mapped) || sid;
}

function remapDeepConfigForTestGuild(guildId?, cfg?) {
  if (!cfg || typeof cfg !== "object" || !isTestMirrorGuild(guildId)) return cfg;
  const out = { ...cfg };
  const channelKeys = [
    "partnershipsChannelId",
    "logsChannelId",
    "pointsRemovedChannelId",
    "descriptionChannelId",
    "partnersChatChannelId",
    "pmCommandsChannelId",
  ];
  for (const key of channelKeys) {
    if (out[key]) out[key] = remapChannelIdForGuild(guildId, out[key]) || out[key];
  }
  if (Array.isArray(out.pmCommandsCategoryIds)) {
    out.pmCommandsCategoryIds = out.pmCommandsCategoryIds.map(
      (id?) => remapChannelIdForGuild(guildId, id) || id,
    );
  }
  const roleKeys = [
    "partnerManagerRoleId",
    "partnerBlacklistRoleId",
    "partnershipPingRoleId",
    "managerBadgeRoleId",
  ];
  for (const key of roleKeys) {
    if (out[key]) out[key] = remapRoleIdForGuild(guildId, out[key]) || out[key];
  }
  if (out.pings && typeof out.pings === "object" && out.pings.customRoleId) {
    out.pings = {
      ...out.pings,
      customRoleId: remapRoleIdForGuild(guildId, out.pings.customRoleId) || out.pings.customRoleId,
    };
  }
  if (out.partnerDesc && typeof out.partnerDesc === "object" && out.partnerDesc.channelId) {
    out.partnerDesc = {
      ...out.partnerDesc,
      channelId: remapChannelIdForGuild(guildId, out.partnerDesc.channelId) || out.partnerDesc.channelId,
    };
  }
  if (out.invite && typeof out.invite === "object" && out.invite.channelId) {
    out.invite = {
      ...out.invite,
      channelId: remapChannelIdForGuild(guildId, out.invite.channelId) || out.invite.channelId,
    };
  }
  return out;
}

function channelKey(ch?) {
  const parent = ch.parentId ? String(ch.parent?.name || "") : "";
  return `${parent}::${Number(ch.type)}::${String(ch.name || "")}`;
}

/** Build maps from two live guilds (name match). */
function buildLiveMirrorMaps(mainGuild?, testGuild?) {
  const roleMap = new Map();
  const channelMap = new Map();
  if (!mainGuild || !testGuild) return { roleMap, channelMap };

  roleMap.set(String(mainGuild.id), String(testGuild.id));
  const testRolesByName = new Map();
  for (const r of testGuild.roles.cache.values()) {
    if (r.id === testGuild.id) continue;
    if (!testRolesByName.has(r.name)) testRolesByName.set(r.name, r);
  }
  for (const r of mainGuild.roles.cache.values()) {
    if (r.id === mainGuild.id) {
      continue;
    }
    const hit = testRolesByName.get(r.name);
    if (hit) roleMap.set(String(r.id), String(hit.id));
  }

  const testByKey = new Map();
  for (const ch of testGuild.channels.cache.values()) {
    testByKey.set(channelKey(ch), ch);
  }
  for (const ch of mainGuild.channels.cache.values()) {
    const hit = testByKey.get(channelKey(ch));
    if (hit) channelMap.set(String(ch.id), String(hit.id));
  }
  return { roleMap, channelMap };
}

export = {
  getTestGuildId,
  getMainGuildId,
  isTestMirrorGuild,
  persistTestMirrorMaps,
  removeMirrorRemapEntries,
  loadMaps,
  remapRoleIdForGuild,
  remapChannelIdForGuild,
  remapDeepConfigForTestGuild,
  buildLiveMirrorMaps,
  channelKey,
};
