const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../MultiGuild/core/viniliProtectedGuilds");
const {
  getTenantCommandAclMapSync,
  patchTenantCommandAclMap,
  refreshTenantGuildSettingsCache,
  ensureTenantGuildSettingsCacheFresh,
  getTenantPrefixSync,
} = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");
const {
  buildTenantCommandCatalog,
  listTenantSlashCatalogItems,
  normalizeCommandAclKey,
  isSlashCommandAclKey,
  normalizeMode,
  normalizeIdList,
  isAclEmpty,
  emptyAcl,
  cloneCommandAcl,
  applyPartnershipPrefixInheritance,
  partnershipSlashAclKey,
} = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
const { PARTNERSHIP_PREFIX_COMMANDS } = require("../../MultiGuild/core/openMediaCommands") as typeof import("../../MultiGuild/core/openMediaCommands");
const {
  syncSlashAclToDiscord,
  loadSlashAclMapFromDiscord,
} = require("./discordApplicationCommandPermissions") as typeof import("./discordApplicationCommandPermissions");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { listGuildPickerData } = require("./siteDashboardPartnershipApi") as typeof import("./siteDashboardPartnershipApi");
const { buildPrefixAclFromPermissionsJson } = require("../Moderation/commandPermissions") as typeof import("../Moderation/commandPermissions");

let cachedIds = null;
function resolveBotApplicationId(client?) {
  const fromEnv =
    process.env.DISCORD_CLIENT_ID ||
    process.env.DISCORD_CLIENT_ID_OFFICIAL ||
    process.env.CLIENT_ID ||
    "";
  if (/^\d{16,22}$/.test(String(fromEnv).trim())) return String(fromEnv).trim();
  const fromClient = client?.application?.id || client?.user?.id || "";
  if (/^\d{16,22}$/.test(String(fromClient).trim())) return String(fromClient).trim();
  try {
    if (!cachedIds) cachedIds = require("../Config/ids");
    const id = cachedIds?.bots?.ViniliCaffeBot;
    if (/^\d{16,22}$/.test(String(id || "").trim())) return String(id).trim();
  } catch (_) {}
  return null;
}

function resolveBotToken(client?) {
  return (
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    client?.config?.token ||
    ""
  );
}

const REASON_MESSAGES = {
  protected_guild: "Questo server non può essere configurato da qui.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_commands: "Payload comandi non valido.",
  main_guild: "Il server principale non usa queste impostazioni.",
  bot_missing: "Il bot non è presente in questo server.",
};

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function reasonToMessage(reason?) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function sanitizeAclInput(raw?) {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return { invalid: true };
  const enabled = raw.enabled !== false;
  const roleMode = normalizeMode(raw.roleMode);
  const channelMode = normalizeMode(raw.channelMode);
  const roleIds = normalizeIdList(raw.roleIds);
  const channelIds = normalizeIdList(raw.channelIds);
  const acl = {
    enabled,
    roleMode: roleMode || null,
    roleIds: roleMode ? roleIds : [],
    channelMode: channelMode || null,
    channelIds: channelMode ? channelIds : [],
  };
  if (isAclEmpty(acl)) return null;
  return acl;
}

async function warmTenantRegistryForCommands() {
  try {
    const { refreshDynamicGuildRowsCache } = require("../../MultiGuild/core/tenantRegistryStore") as typeof import("../../MultiGuild/core/tenantRegistryStore");
    await refreshDynamicGuildRowsCache();
  } catch (_) {}
}

function collectSlashKeys(guildId?) {
  return listTenantSlashCatalogItems(guildId).map((c?) => c.name).filter(Boolean);
}

function mergePermissionsJsonIntoCommands(guildId?, commands?, catalog?) {
  const protectedGuild =
    isViniliFullFeatureGuild(guildId) || isViniliProtectedGuild(guildId);
  if (!protectedGuild) return commands;

  const out = commands && typeof commands === "object" ? { ...commands } : {};
  const names = new Set();
  for (const cat of Array.isArray(catalog) ? catalog : []) {
    for (const cmd of Array.isArray(cat?.commands) ? cat.commands : []) {
      const name = normalizeCommandAclKey(cmd?.name);
      if (!name || isSlashCommandAclKey(name) || cmd?.kind === "slash" || cmd?.syncsToDiscord) continue;
      names.add(name);
    }
  }
    for (const key of Object.keys(out)) {
    const name = normalizeCommandAclKey(key);
    if (name && !isSlashCommandAclKey(name)) names.add(name);
  }

  for (const name of names) {
    const base = buildPrefixAclFromPermissionsJson(name);
    if (!base || isAclEmpty(base)) continue;
    const mongo = out[name];
    const hasMongoRoles = Boolean(mongo?.roleMode && Array.isArray(mongo.roleIds) && mongo.roleIds.length);
    const hasMongoChannels = Boolean(
      mongo?.channelMode && Array.isArray(mongo.channelIds) && mongo.channelIds.length,
    );
    if (hasMongoRoles && hasMongoChannels) continue;
    out[name] = {
      enabled: mongo?.enabled !== false,
      roleMode: hasMongoRoles ? mongo.roleMode : base.roleMode,
      roleIds: hasMongoRoles ? mongo.roleIds.slice() : base.roleIds.slice(),
      channelMode: hasMongoChannels ? mongo.channelMode : base.channelMode,
      channelIds: hasMongoChannels ? mongo.channelIds.slice() : base.channelIds.slice(),
      fromPermissionsJson: !hasMongoRoles || !hasMongoChannels,
    };
  }
  return out;
}

async function buildCommandsResponse(client?, accessToken?, guildId?) {
  const applicationId = resolveBotApplicationId(client);
  const botToken = resolveBotToken(client);
  let commands = getTenantCommandAclMapSync(guildId);
  let discordSync = { ok: true, warning: null };

  const slashKeys = collectSlashKeys(guildId);
  if (slashKeys.length && accessToken && applicationId && botToken) {
    const loaded = await loadSlashAclMapFromDiscord({
      accessToken,
      botToken,
      applicationId,
      guildId,
      slashKeys,
    });
    if (loaded.ok) {
            const slashPatch: Record<string, any> = {};
      for (const key of slashKeys) {
        if (Object.prototype.hasOwnProperty.call(loaded.commands, key)) {
          const acl = loaded.commands[key];
          if (!acl || isAclEmpty(acl)) {
            delete commands[key];
            slashPatch[key] = null;
          } else {
            commands[key] = acl;
            slashPatch[key] = cloneCommandAcl(acl);
          }
        } else {
          delete commands[key];
          slashPatch[key] = null;
        }
      }
            await patchTenantCommandAclMap(guildId, slashPatch).catch(() => null);
      await refreshTenantGuildSettingsCache().catch(() => null);
      commands = getTenantCommandAclMapSync(guildId);
            for (const key of slashKeys) {
        if (Object.prototype.hasOwnProperty.call(loaded.commands, key)) {
          const acl = loaded.commands[key];
          if (!acl || isAclEmpty(acl)) delete commands[key];
          else commands[key] = acl;
        } else {
          delete commands[key];
        }
      }
    } else if (loaded.error === "missing_command_permissions_scope") {
      discordSync = {
        ok: false,
        warning: loaded.message,
        error: loaded.error,
      };
    } else {
      discordSync = {
        ok: false,
        warning: loaded.message || "Impossibile leggere i permessi slash da Discord.",
        error: loaded.error || "discord_permissions_sync_failed",
      };
    }
  }

  const catalog = buildTenantCommandCatalog(guildId);
  commands = mergePermissionsJsonIntoCommands(guildId, commands, catalog);
    commands = applyPartnershipPrefixInheritance(commands, guildId);
  try {
    const {
      isTenantBoardFeatureEnabledSync,
      BOARD_FEATURE_COMMANDS,
    } = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");
    const { emptyAcl, cloneCommandAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
    for (const [feature, names] of Object.entries(BOARD_FEATURE_COMMANDS || {})) {
      if (isTenantBoardFeatureEnabledSync(guildId, feature)) continue;
      for (const name of names) {
        const prev = commands[name] ? cloneCommandAcl(commands[name]) : emptyAcl();
        commands[name] = { ...prev, enabled: false, boardFeatureLocked: true };
      }
    }
  } catch (_) {}
  const prefix = getTenantPrefixSync(guildId, "+");
    const pickers = await listGuildPickerData(client, guildId).catch(() => ({
    textChannels: [],
    voiceChannels: [],
    categories: [],
    roles: [],
  }));

  return {
    ok: true,
    status: 200,
    guildId,
    prefix,
    catalog,
    commands,
    pickers,
    applicationId: applicationId || null,
    discordSync,
    protectedGuild:
      isViniliFullFeatureGuild(guildId) || isViniliProtectedGuild(guildId),
  };
}

async function getDashboardGuildCommands(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  await Promise.all([
    ensureTenantGuildSettingsCacheFresh().catch(() => null),
    warmTenantRegistryForCommands(),
  ]);

  return buildCommandsResponse(client, accessToken, access.guildId);
}

async function patchDashboardGuildCommands(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const payload = body && typeof body === "object" ? body : {};
  const rawCommands = payload.commands;
  if (!rawCommands || typeof rawCommands !== "object" || Array.isArray(rawCommands)) {
    return fail(400, "invalid_commands", reasonToMessage("invalid_commands"));
  }

  const patch: Record<string, any> = {};
  const slashSyncJobs = [];
  for (const [key, value] of Object.entries(rawCommands)) {
    const name = normalizeCommandAclKey(key);
    if (!name) continue;
    if (value == null) {
      patch[name] = null;
      if (isSlashCommandAclKey(name)) slashSyncJobs.push({ key: name, acl: null });
      continue;
    }
    const sanitized = sanitizeAclInput(value);
    if (sanitized && sanitized.invalid) {
      return fail(400, "invalid_commands", `Configurazione non valida per ${name}.`);
    }
    patch[name] = sanitized;
    if (isSlashCommandAclKey(name)) {
      slashSyncJobs.push({ key: name, acl: sanitized || emptyAcl() });
    }
  }

    const partnerSlashKey = partnershipSlashAclKey();
  if (Object.prototype.hasOwnProperty.call(patch, partnerSlashKey)) {
    const partnerAcl = patch[partnerSlashKey];
    for (const prefixName of PARTNERSHIP_PREFIX_COMMANDS) {
      if (Object.prototype.hasOwnProperty.call(patch, prefixName)) continue;
      patch[prefixName] = partnerAcl == null ? null : cloneCommandAcl(partnerAcl);
    }
  }

  if (!Object.keys(patch).length) {
    return fail(400, "invalid_commands", reasonToMessage("invalid_commands"));
  }

  const applicationId = resolveBotApplicationId(client);
  const botToken = resolveBotToken(client);

    for (const job of slashSyncJobs) {
    if (!applicationId || !botToken) {
      return fail(
        500,
        "discord_permissions_sync_failed",
        "Configurazione bot incompleta: impossibile sincronizzare i permessi Discord.",
      );
    }
    const synced = await syncSlashAclToDiscord({
      accessToken,
      botToken,
      applicationId,
      guildId: access.guildId,
      aclKey: job.key,
      acl: job.acl,
    });
    if (!synced.ok) {
      const status = synced.error === "missing_command_permissions_scope" ? 403 : 502;
      return fail(status, synced.error || "discord_permissions_sync_failed", synced.message);
    }
  }

    const saved = await patchTenantCommandAclMap(access.guildId, patch);
  if (!saved.ok) {
    return fail(500, saved.reason || "persist_failed", reasonToMessage(saved.reason));
  }

  await Promise.all([
    refreshTenantGuildSettingsCache().catch(() => null),
    warmTenantRegistryForCommands(),
  ]);

  return buildCommandsResponse(client, accessToken, access.guildId);
}

export = {
  getDashboardGuildCommands,
  patchDashboardGuildCommands,
};
