const crypto = require("node:crypto") as typeof import("node:crypto");
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { normalizeGuildId } = require("../../core/viniliProtectedGuilds") as typeof import("../../core/viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildTicketTeams.v1";
const MAX_TEAMS = 25;
const MAX_MEMBERS = 40;
const DEFAULT_TEAM_SEED = "default";

const TEAM_PERM_KEYS = Object.freeze([
  "addReactions",
  "sendMessages",
  "sendTtsMessages",
  "embedLinks",
  "attachFiles",
  "mentionEveryone",
  "useExternalEmojis",
  "useApplicationCommands",
  "useExternalStickers",
  "sendVoiceMessages",
]);

const TEAM_PERM_TO_FLAGS = Object.freeze({
  addReactions: "AddReactions",
  sendMessages: "SendMessages",
  sendTtsMessages: "SendTTSMessages",
  embedLinks: "EmbedLinks",
  attachFiles: "AttachFiles",
  mentionEveryone: "MentionEveryone",
  useExternalEmojis: "UseExternalEmojis",
  useApplicationCommands: "UseApplicationCommands",
  useExternalStickers: "UseExternalStickers",
  sendVoiceMessages: "SendVoiceMessages",
});

let teamsCache = Object.freeze({});

function asBool(value?, fallback?) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function newTeamId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeTeamId(value?) {
  const id = String(value || "").trim();
  return id && /^[a-zA-Z0-9_-]{8,64}$/.test(id) ? id : null;
}

function normalizeSnowflake(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,22}$/.test(id) ? id : null;
}

function normalizeTeamIdList(raw?, max = 10) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const id = normalizeTeamId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function defaultTeamPerms() {
  const out: Record<string, any> = {};
  for (const key of TEAM_PERM_KEYS) {
    out[key] = key === "mentionEveryone" ? false : true;
  }
  return out;
}

function normalizeTeamPerms(raw?, { isDefault = false } = {}) {
  if (isDefault) return null;
  const src = raw && typeof raw === "object" ? raw : {};
  const base = defaultTeamPerms();
  const out: Record<string, any> = {};
  for (const key of TEAM_PERM_KEYS) {
    out[key] = asBool(src[key], base[key]);
  }
  return out;
}

function normalizeMember(raw?) {
  if (!raw || typeof raw !== "object") {
    const asId = normalizeSnowflake(raw);
    if (asId) return { type: "role", id: asId };
    return null;
  }
  const id = normalizeSnowflake(raw.id || raw.roleId || raw.userId);
  if (!id) return null;
  const typeRaw = String(raw.type || "").trim().toLowerCase();
  const type = typeRaw === "user" || typeRaw === "member" ? "user" : "role";
  return { type, id };
}

function normalizeMembers(raw?) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of src) {
    const member = normalizeMember(row);
    if (!member) continue;
    const key = `${member.type}:${member.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(member);
    if (out.length >= MAX_MEMBERS) break;
  }
  return out;
}

function normalizeTeam(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const isDefault = asBool(src.isDefault ?? base.isDefault, false);
  const id =
    normalizeTeamId(src.id || base.id) ||
    (isDefault ? "default0000000000" : null) ||
    newTeamId();
  const name =
    String(src.name ?? base.name ?? (isDefault ? "Default" : "Team"))
      .trim()
      .slice(0, 80) || (isDefault ? "Default" : "Team");
  return {
    id,
    name,
    seedKey: String(src.seedKey ?? base.seedKey ?? "").trim() || null,
    isDefault,
    members: normalizeMembers(src.members ?? base.members),
    perms: normalizeTeamPerms(src.perms ?? base.perms, { isDefault }),
    createdAt: src.createdAt || base.createdAt || new Date().toISOString(),
    updatedAt: src.updatedAt || base.updatedAt || new Date().toISOString(),
  };
}

function emptyGuildBucket() {
  return { teams: [], syncedAt: null };
}

function normalizeGuildBucket(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const teams = Array.isArray(src.teams) ? src.teams.map((row?) => normalizeTeam(row)) : [];
  return { teams, syncedAt: src.syncedAt || null };
}

function readRootFromCache() {
  return teamsCache && typeof teamsCache === "object" ? teamsCache : {};
}

async function loadTeamsRoot() {
  if (!isMongoReady()) return readRootFromCache();
  const raw = await getBotState(BOT_STATE_KEY, {});
  const root = raw && typeof raw === "object" ? raw : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(root)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeGuildBucket(bucket);
  }
  teamsCache = Object.freeze(next);
  return teamsCache;
}

async function saveTeamsRoot(root?) {
  const src = root && typeof root === "object" ? root : {};
  const next: Record<string, any> = {};
  for (const [gid, bucket] of Object.entries(src)) {
    const id = normalizeGuildId(gid) || String(gid || "").trim();
    if (!id) continue;
    next[id] = normalizeGuildBucket(bucket);
  }
  const ok = await setBotState(BOT_STATE_KEY, next);
  if (ok) teamsCache = Object.freeze(next);
  return ok;
}

function getGuildTeamsSync(guildId?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return emptyGuildBucket();
  const hit = readRootFromCache()[gid];
  return hit ? normalizeGuildBucket(hit) : emptyGuildBucket();
}

async function getGuildTeams(guildId?) {
  await loadTeamsRoot();
  return getGuildTeamsSync(guildId);
}

function findGuildTeamsByIds(guildId?, teamIds?) {
  const ids = normalizeTeamIdList(teamIds, 25);
  if (!ids.length) return [];
  const byId = new Map((getGuildTeamsSync(guildId).teams || []).map((t?) => [String(t.id), t]));
  return ids.map((id?) => byId.get(id)).filter(Boolean);
}

function collectDefaultTeamMembers(guild?) {
  const members = [];
  const seen = new Set();
  const push = (type?, id?) => {
    const sid = normalizeSnowflake(id);
    if (!sid) return;
    const key = `${type}:${sid}`;
    if (seen.has(key)) return;
    seen.add(key);
    members.push({ type, id: sid });
  };
  if (guild?.ownerId) push("user", guild.ownerId);
  const roles = guild?.roles?.cache;
  if (roles && typeof roles.values === "function") {
    for (const role of roles.values()) {
      if (!role || role.managed) continue;
      if (role.id === guild.id) continue;
      try {
        if (role.permissions?.has?.(PermissionFlagsBits.Administrator)) {
          push("role", role.id);
        }
      } catch (_) {}
    }
  }
  return members;
}

function ensureDefaultTeamInBucket(bucket?, guild = null) {
  const teams = Array.isArray(bucket?.teams) ? [...bucket.teams] : [];
  const existingIdx = teams.findIndex((t?) => t.isDefault || t.seedKey === DEFAULT_TEAM_SEED);
  if (existingIdx >= 0) {
    const existing = teams[existingIdx];
    if (guild && !(existing.members || []).length) {
      const members = collectDefaultTeamMembers(guild);
      if (members.length) {
        teams[existingIdx] = normalizeTeam({
          ...existing,
          members,
          updatedAt: new Date().toISOString(),
        });
        return {
          bucket: normalizeGuildBucket({ ...bucket, teams }),
          created: false,
          updated: true,
          defaultTeam: teams[existingIdx],
        };
      }
    }
    return {
      bucket: normalizeGuildBucket({ ...bucket, teams }),
      created: false,
      updated: false,
      defaultTeam: normalizeTeam(existing),
    };
  }
  const members = guild ? collectDefaultTeamMembers(guild) : [];
  const defaultTeam = normalizeTeam({
    id: newTeamId(),
    name: "Default",
    seedKey: DEFAULT_TEAM_SEED,
    isDefault: true,
    members,
    perms: null,
  });
  teams.unshift(defaultTeam);
  return {
    bucket: normalizeGuildBucket({ ...bucket, teams }),
    created: true,
    updated: false,
    defaultTeam,
  };
}

async function mutateGuildTeams(guildId?, mutator?) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };
  const root = { ...(await loadTeamsRoot()) };
  const prev = normalizeGuildBucket(root[gid]);
  const nextBucket = normalizeGuildBucket(mutator(prev) || prev);
  root[gid] = nextBucket;
  const saved = await saveTeamsRoot(root);
  if (!saved) return { ok: false, reason: "persist_failed", bucket: prev };
  return { ok: true, bucket: nextBucket };
}

async function ensureGuildDefaultTeam(guildId?, guild = null) {
  const gid = normalizeGuildId(guildId) || String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };
  await loadTeamsRoot();
  const current = getGuildTeamsSync(gid);
  const ensured = ensureDefaultTeamInBucket(current, guild);
  if (!ensured.created && !ensured.updated) {
    return { ok: true, bucket: ensured.bucket, defaultTeam: ensured.defaultTeam, created: false };
  }
  const saved = await mutateGuildTeams(gid, () => ensured.bucket);
  if (!saved.ok) return saved;
  return {
    ok: true,
    bucket: saved.bucket,
    defaultTeam: (saved.bucket.teams || []).find((t?) => t.isDefault) || ensured.defaultTeam,
    created: Boolean(ensured.created),
  };
}

async function refreshTicketTeamsCache() {
  return loadTeamsRoot();
}

function teamPermsToPermissionMap(team?) {
  const map = {
    ViewChannel: true,
    ReadMessageHistory: true,
  };
  if (!team || team.isDefault || !team.perms) {
    for (const key of TEAM_PERM_KEYS) {
      const flag = TEAM_PERM_TO_FLAGS[key];
      if (flag) map[flag] = true;
    }
    return map;
  }
  for (const key of TEAM_PERM_KEYS) {
    const flag = TEAM_PERM_TO_FLAGS[key];
    if (!flag) continue;
    map[flag] = team.perms[key] === true;
  }
  return map;
}

export = {
  BOT_STATE_KEY,
  MAX_TEAMS,
  MAX_MEMBERS,
  TEAM_PERM_KEYS,
  newTeamId,
  normalizeTeamId,
  normalizeTeamIdList,
  normalizeTeam,
  normalizeTeamPerms,
  normalizeMembers,
  defaultTeamPerms,
  getGuildTeams,
  findGuildTeamsByIds,
  mutateGuildTeams,
  ensureGuildDefaultTeam,
  refreshTicketTeamsCache,
  teamPermsToPermissionMap,
};
