const { REST, Routes, ApplicationCommandPermissionType } = require("discord.js");

const TYPE_CHAT = 1;
const TYPE_USER = 2;
const TYPE_MESSAGE = 3;

const SLASH_KIND_TO_DISCORD_TYPE = Object.freeze({
  chat: TYPE_CHAT,
  user: TYPE_USER,
  message: TYPE_MESSAGE,
});

let globalCommandsCache = { at: 0, appId: "", byKey: new Map() };
const GLOBAL_CMDS_TTL_MS = 60_000;
const guildCommandsCache = new Map();
const GUILD_CMDS_TTL_MS = 60_000;

function allChannelsPermissionId(guildId) {
  try {
    return (BigInt(String(guildId)) - 1n).toString();
  } catch (_) {
    return null;
  }
}

function slashAclKey(discordType, discordName) {
  const type = Number(discordType);
  const name = String(discordName || "").trim();
  if (![TYPE_CHAT, TYPE_USER, TYPE_MESSAGE].includes(type) || !name) return "";
  return `s:${type}:${name}`;
}

function parseSlashAclKey(raw) {
  const m = /^s:([123]):(.+)$/i.exec(String(raw || "").trim());
  if (!m) return null;
  return { type: Number(m[1]), name: m[2].trim() };
}

function isSlashAclKey(raw) {
  return Boolean(parseSlashAclKey(raw));
}

function createBotRest(botToken) {
  return new REST({ version: "10" }).setToken(String(botToken || "").trim());
}

function mapCommandsListToByKey(list) {
  const byKey = new Map();
  for (const cmd of Array.isArray(list) ? list : []) {
    const type = Number(cmd?.type) || TYPE_CHAT;
    const name = String(cmd?.name || "").trim();
    const id = String(cmd?.id || "").trim();
    if (!name || !/^\d{16,22}$/.test(id)) continue;
    byKey.set(slashAclKey(type, name), { id, name, type });
  }
  return byKey;
}

async function fetchGlobalCommandsByKey(applicationId, botToken) {
  const appId = String(applicationId || "").trim();
  const now = Date.now();
  if (
    globalCommandsCache.appId === appId &&
    globalCommandsCache.byKey.size &&
    now - globalCommandsCache.at < GLOBAL_CMDS_TTL_MS
  ) {
    return globalCommandsCache.byKey;
  }
  const rest = createBotRest(botToken);
  const list = await rest.get(Routes.applicationCommands(appId));
  const byKey = mapCommandsListToByKey(list);
  globalCommandsCache = { at: now, appId, byKey };
  return byKey;
}

async function fetchGuildCommandsByKey(applicationId, botToken, guildId) {
  const appId = String(applicationId || "").trim();
  const gid = String(guildId || "").trim();
  if (!/^\d{16,22}$/.test(appId) || !/^\d{16,22}$/.test(gid)) return new Map();
  const cacheKey = `${appId}:${gid}`;
  const now = Date.now();
  const cached = guildCommandsCache.get(cacheKey);
  if (cached?.byKey?.size && now - cached.at < GUILD_CMDS_TTL_MS) {
    return cached.byKey;
  }
  const rest = createBotRest(botToken);
  const list = await rest.get(Routes.applicationGuildCommands(appId, gid));
  const byKey = mapCommandsListToByKey(list);
  guildCommandsCache.set(cacheKey, { at: now, byKey });
  return byKey;
}

async function fetchApplicationCommandsByKey(applicationId, botToken, guildId) {
  const globalByKey = await fetchGlobalCommandsByKey(applicationId, botToken);
  const gid = String(guildId || "").trim();
  if (!/^\d{16,22}$/.test(gid)) return globalByKey;
  let guildByKey = new Map();
  try {
    guildByKey = await fetchGuildCommandsByKey(applicationId, botToken, gid);
  } catch (err) {
    global.logger?.warn?.(
      `[DASHBOARD CMDS] guild commands fetch failed guild=${gid}:`,
      err?.message || err,
    );
    return globalByKey;
  }
  if (!guildByKey.size) return globalByKey;
  const merged = new Map(globalByKey);
  for (const [key, value] of guildByKey.entries()) {
    merged.set(key, value);
  }
  return merged;
}

function aclToDiscordPermissions(acl, guildId) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,22}$/.test(gid)) return [];
  const everyoneId = gid;
  const allChannelsId = allChannelsPermissionId(gid);
  const permissions = [];
  const seen = new Set();

  function push(id, type, permission) {
    const sid = String(id || "").trim();
    if (!/^\d{16,22}$/.test(sid)) return;
    const key = `${type}:${sid}`;
    if (seen.has(key)) return;
    seen.add(key);
    permissions.push({ id: sid, type, permission: Boolean(permission) });
  }

  const enabled = acl?.enabled !== false;
  if (!enabled) {
        push(everyoneId, ApplicationCommandPermissionType.Role, false);
    if (allChannelsId) push(allChannelsId, ApplicationCommandPermissionType.Channel, false);
    return permissions.slice(0, 100);
  }

  const roleMode = acl?.roleMode || null;
  const roleIds = Array.isArray(acl?.roleIds) ? acl.roleIds : [];
  if (roleMode === "include" && roleIds.length) {
    push(everyoneId, ApplicationCommandPermissionType.Role, false);
    for (const id of roleIds) push(id, ApplicationCommandPermissionType.Role, true);
  } else if (roleMode === "exclude" && roleIds.length) {
    for (const id of roleIds) push(id, ApplicationCommandPermissionType.Role, false);
  }

  const channelMode = acl?.channelMode || null;
  const channelIds = Array.isArray(acl?.channelIds) ? acl.channelIds : [];
  if (channelMode === "include" && channelIds.length) {
    if (allChannelsId) push(allChannelsId, ApplicationCommandPermissionType.Channel, false);
    for (const id of channelIds) push(id, ApplicationCommandPermissionType.Channel, true);
  } else if (channelMode === "exclude" && channelIds.length) {
    for (const id of channelIds) push(id, ApplicationCommandPermissionType.Channel, false);
  }

  return permissions.slice(0, 100);
}

function discordPermissionsToAcl(permissions, guildId) {
  const gid = String(guildId || "").trim();
  const allChannelsId = allChannelsPermissionId(gid);
  const list = Array.isArray(permissions) ? permissions : [];

  let everyoneDenied = false;
  let allChannelsDenied = false;
  const allowedRoles = [];
  const deniedRoles = [];
  const allowedChannels = [];
  const deniedChannels = [];

  for (const row of list) {
    const id = String(row?.id || "").trim();
    const type = Number(row?.type);
    const allowed = row?.permission === true;
    if (!id) continue;

    if (type === ApplicationCommandPermissionType.Role) {
      if (id === gid) {
        if (!allowed) everyoneDenied = true;
        continue;
      }
      if (allowed) allowedRoles.push(id);
      else deniedRoles.push(id);
      continue;
    }

    if (type === ApplicationCommandPermissionType.Channel) {
      if (allChannelsId && id === allChannelsId) {
        if (!allowed) allChannelsDenied = true;
        continue;
      }
      if (allowed) allowedChannels.push(id);
      else deniedChannels.push(id);
    }
  }

  const fullyDisabled =
    everyoneDenied &&
    !allowedRoles.length &&
    allChannelsDenied &&
    !allowedChannels.length;

    const legacyDisabled = everyoneDenied && !allowedRoles.length && !allowedChannels.length;

  if (fullyDisabled || legacyDisabled) {
    return {
      enabled: false,
      roleMode: null,
      roleIds: [],
      channelMode: null,
      channelIds: [],
    };
  }

  const acl = {
    enabled: true,
    roleMode: null,
    roleIds: [],
    channelMode: null,
    channelIds: [],
  };

  if (everyoneDenied && allowedRoles.length) {
    acl.roleMode = "include";
    acl.roleIds = allowedRoles;
  } else if (deniedRoles.length) {
    acl.roleMode = "exclude";
    acl.roleIds = deniedRoles;
  }

  if (allChannelsDenied && allowedChannels.length) {
    acl.channelMode = "include";
    acl.channelIds = allowedChannels;
  } else if (deniedChannels.length && !allChannelsDenied) {
    acl.channelMode = "exclude";
    acl.channelIds = deniedChannels;
  }

  return acl;
}

async function putCommandPermissions({ accessToken, applicationId, guildId, commandId, permissions }) {
  const token = String(accessToken || "").replace(/^Bearer\s+/i, "").trim();
  const url = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands/${commandId}/permissions`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ permissions: Array.isArray(permissions) ? permissions : [] }),
  });
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(json?.message || text || `Discord permissions PUT ${res.status}`);
    err.status = res.status;
    err.code = json?.code;
    err.rawError = json;
    throw err;
  }
  return json;
}

async function getCommandPermissions({ accessToken, applicationId, guildId, commandId }) {
  const token = String(accessToken || "").replace(/^Bearer\s+/i, "").trim();
  const url = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands/${commandId}/permissions`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { permissions: [] };
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    const code = Number(json?.code || 0);
        if (code === 10066) return { permissions: [] };
    const err = new Error(json?.message || text || `Discord permissions GET ${res.status}`);
    err.status = res.status;
    err.code = code;
    err.rawError = json;
    throw err;
  }
  return json || { permissions: [] };
}

async function getAllGuildCommandPermissions({ accessToken, applicationId, guildId }) {
  const token = String(accessToken || "").replace(/^Bearer\s+/i, "").trim();
  const appId = String(applicationId || "").trim();
  const gid = String(guildId || "").trim();
  const url = `https://discord.com/api/v10/applications/${appId}/guilds/${gid}/commands/permissions`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return [];
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    const code = Number(json?.code || 0);
    if (code === 10066) return [];
    const err = new Error(json?.message || text || `Discord permissions bulk GET ${res.status}`);
    err.status = res.status;
    err.code = code;
    err.rawError = json;
    throw err;
  }
  return Array.isArray(json) ? json : [];
}

function aclFromDiscordPermissionsList(permissions, guildId) {
  const acl = discordPermissionsToAcl(permissions || [], guildId);
  const empty =
    acl.enabled !== false &&
    !acl.roleMode &&
    !acl.channelMode;
  if (!empty) return acl;
  return { enabled: true, roleMode: null, roleIds: [], channelMode: null, channelIds: [] };
}

function classifyDiscordPermissionsError(err) {
  const status = Number(err?.status || err?.statusCode || 0);
  const code = Number(err?.code || 0);
  const msg = String(err?.message || err?.rawError?.message || "");
  if (status === 401 || code === 50001 || /401|unauthorized|invalid token|missing.*scope/i.test(msg)) {
    return {
      error: "missing_command_permissions_scope",
      message:
        "Serve un nuovo login Discord con il permesso di aggiornare i comandi. Esci e accedi di nuovo dalla dashboard.",
    };
  }
  if (status === 403 || code === 50013 || /missing access|forbidden/i.test(msg)) {
    return {
      error: "discord_permissions_forbidden",
      message:
        "Discord ha rifiutato l’aggiornamento: ti servono Gestisci server e Gestisci ruoli, e il permesso di usare il comando.",
    };
  }
  return {
    error: "discord_permissions_sync_failed",
    message: msg
      ? `Sincronizzazione Discord non riuscita: ${msg}`
      : "Sincronizzazione permessi Discord non riuscita. Riprova.",
  };
}

async function syncSlashAclToDiscord({
  accessToken,
  botToken,
  applicationId,
  guildId,
  aclKey,
  acl,
}) {
  const parsed = parseSlashAclKey(aclKey);
  if (!parsed) return { ok: true, skipped: true };
  const byKey = await fetchApplicationCommandsByKey(applicationId, botToken, guildId);
  const cmd = byKey.get(slashAclKey(parsed.type, parsed.name));
  if (!cmd?.id) {
    return { ok: false, error: "slash_command_not_found", message: `Comando slash non trovato: ${parsed.name}` };
  }
  const permissions = aclToDiscordPermissions(acl || { enabled: true }, guildId);
  try {
    const saved = await putCommandPermissions({
      accessToken,
      applicationId,
      guildId,
      commandId: cmd.id,
      permissions,
    });
    const savedCount = Array.isArray(saved?.permissions) ? saved.permissions.length : permissions.length;
    global.logger?.info?.(
      `[DASHBOARD CMDS] synced ${aclKey} guild=${guildId} cmd=${cmd.id} perms=${savedCount}`,
    );
    return { ok: true, commandId: cmd.id, permissionsCount: savedCount };
  } catch (err) {
    global.logger?.warn?.(
      `[DASHBOARD CMDS] sync failed ${aclKey} guild=${guildId}:`,
      err?.status,
      err?.code,
      err?.message || err,
    );
    return { ok: false, ...classifyDiscordPermissionsError(err), detail: err?.message || String(err) };
  }
}

async function loadSlashAclMapFromDiscord({
  accessToken,
  botToken,
  applicationId,
  guildId,
  slashKeys,
}) {
  const out = {};
  const keys = Array.isArray(slashKeys) ? slashKeys : [];
  if (!keys.length || !accessToken) return { ok: true, commands: out, partial: false };

  let byKey;
  let bulkRows = null;
  const [cmdsSettled, bulkSettled] = await Promise.allSettled([
    fetchApplicationCommandsByKey(applicationId, botToken, guildId),
    getAllGuildCommandPermissions({ accessToken, applicationId, guildId }),
  ]);

  if (cmdsSettled.status !== "fulfilled") {
    return {
      ok: false,
      ...classifyDiscordPermissionsError(cmdsSettled.reason),
      commands: out,
    };
  }
  byKey = cmdsSettled.value;

  if (bulkSettled.status === "fulfilled") {
    bulkRows = bulkSettled.value;
  } else {
    const classified = classifyDiscordPermissionsError(bulkSettled.reason);
    if (classified.error === "missing_command_permissions_scope") {
      return { ok: false, ...classified, commands: out };
    }
    global.logger?.warn?.(
      `[DASHBOARD CMDS] bulk permissions failed guild=${guildId}, fallback per-command:`,
      bulkSettled.reason?.status,
      bulkSettled.reason?.code,
      bulkSettled.reason?.message || bulkSettled.reason,
    );
    bulkRows = null;
  }

  const permsByCommandId = new Map();
  if (Array.isArray(bulkRows)) {
    for (const row of bulkRows) {
      const id = String(row?.id || "").trim();
      if (!/^\d{16,22}$/.test(id)) continue;
      permsByCommandId.set(id, Array.isArray(row?.permissions) ? row.permissions : []);
    }
  }

  if (Array.isArray(bulkRows)) {
    for (const key of keys) {
      const parsed = parseSlashAclKey(key);
      if (!parsed) continue;
      const cmd = byKey.get(slashAclKey(parsed.type, parsed.name));
      if (!cmd?.id) continue;
            const permissions = permsByCommandId.has(cmd.id) ? permsByCommandId.get(cmd.id) : [];
      out[key] = aclFromDiscordPermissionsList(permissions, guildId);
    }
    return { ok: true, commands: out, partial: false };
  }

    const CONCURRENCY = 6;
  let failed = null;
  const pending = [];
  for (const key of keys) {
    const parsed = parseSlashAclKey(key);
    if (!parsed) continue;
    const cmd = byKey.get(slashAclKey(parsed.type, parsed.name));
    if (!cmd?.id) continue;
    pending.push({ key, commandId: cmd.id });
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (item) => {
        try {
          const row = await getCommandPermissions({
            accessToken,
            applicationId,
            guildId,
            commandId: item.commandId,
          });
          return { key: item.key, ok: true, permissions: row?.permissions || [] };
        } catch (err) {
          return { key: item.key, ok: false, err };
        }
      }),
    );
    for (const r of results) {
      if (!r.ok) {
        failed = classifyDiscordPermissionsError(r.err);
        break;
      }
      out[r.key] = aclFromDiscordPermissionsList(r.permissions, guildId);
    }
    if (failed) break;
  }

  if (failed) {
    return { ok: false, ...failed, commands: out, partial: Object.keys(out).length > 0 };
  }
  return { ok: true, commands: out, partial: false };
}

module.exports = {
  TYPE_CHAT,
  TYPE_USER,
  TYPE_MESSAGE,
  SLASH_KIND_TO_DISCORD_TYPE,
  slashAclKey,
  parseSlashAclKey,
  isSlashAclKey,
  aclToDiscordPermissions,
  discordPermissionsToAcl,
  syncSlashAclToDiscord,
  loadSlashAclMapFromDiscord,
  fetchGlobalCommandsByKey,
  fetchApplicationCommandsByKey,
};
