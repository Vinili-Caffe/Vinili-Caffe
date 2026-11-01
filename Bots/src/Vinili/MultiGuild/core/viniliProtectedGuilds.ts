const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
let protectedSetCache = null;

function normalizeGuildId(input?) {
  const id = String(input || "").trim();
  return /^\d{16,20}$/.test(id) ? id : "";
}

function readMainGuildIdFromConfig() {
  try {
    const configPath = path.join(__dirname, "..", "..", "config.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return normalizeGuildId(raw?.mainGuildId || raw?.guildMain);
  } catch {
    return "";
  }
}

function buildProtectedGuildIdSet() {
  const ids = new Set();
  const main = normalizeGuildId(readMainGuildIdFromConfig()) || normalizeGuildId(IDs?.guilds?.main);
  const test = normalizeGuildId(IDs?.guilds?.test);
  if (main) ids.add(main);
  if (test) ids.add(test);
  return ids;
}

function getProtectedGuildIds() {
  if (!protectedSetCache) protectedSetCache = buildProtectedGuildIdSet();
  return Array.from(protectedSetCache);
}

function isViniliProtectedGuild(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return false;
  if (!protectedSetCache) protectedSetCache = buildProtectedGuildIdSet();
  return protectedSetCache.has(gid);
}

function isMultiGuildManagedGuild(guildId?) {
  return !isViniliProtectedGuild(guildId);
}

export = { normalizeGuildId, getProtectedGuildIds, isViniliProtectedGuild, isMultiGuildManagedGuild };