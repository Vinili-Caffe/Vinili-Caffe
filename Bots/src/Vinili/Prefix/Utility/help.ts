const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandType, ComponentType, MessageFlags, } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply, safeInteractionUpdate } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { executeTenantHelp } = require("../../MultiGuild/utils/tenantHelp") as typeof import("../../MultiGuild/utils/tenantHelp");
const {
  resolveEmbedColorForGuild,
  normalizeEmbedColorInt,
} = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { DEFAULT_OBSOLETE_SLASH_NAMES } = require("../../../shared/discord/purgeObsoleteApplicationCommands") as typeof import("../../../shared/discord/purgeObsoleteApplicationCommands");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const PERMISSIONS_PATH = path.join(__dirname, "..", "..", "permissions.json");

function resolveHelpEmbedColor(context: Record<string, any> = {}, guildId = "") {
  const gid = String(context.guildId || context.guild?.id || guildId || "").trim();
  return resolveEmbedColorForGuild(gid);
}

function resolveHelpAccentColorInt(context: Record<string, any> = {}, guildId = "") {
  return normalizeEmbedColorInt(resolveHelpEmbedColor(context, guildId)) || 0x826bc2;
}
const ERROR_EMBED_COLOR = "Red";
const PRIVATE_FLAG = 1 << 6;
const NO_REPLY_MENTIONS = { repliedUser: false, parse: [] };
const { isEconomyCommandsVisible, isEconomyGameEnabled, isServerEconomyEnabled } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const {
  PREFIX_COMMAND_DESCRIPTIONS: PREFIX_HELP_DESCRIPTIONS,
  PREFIX_SUBCOMMAND_DESCRIPTIONS: PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS,
  APPLICATION_COMMAND_DESCRIPTIONS: CONTEXT_HELP_DESCRIPTIONS_RAW,
} = require("../../Utils/Prefix/prefixCommandDescriptions") as typeof import("../../Utils/Prefix/prefixCommandDescriptions");
const CONTEXT_HELP_DESCRIPTIONS = Object.freeze({
  "Aggiungi punti": CONTEXT_HELP_DESCRIPTIONS_RAW["Aggiungi punti"],
  "Rimuovi punti": CONTEXT_HELP_DESCRIPTIONS_RAW["Rimuovi punti"],
  Partnership: CONTEXT_HELP_DESCRIPTIONS_RAW.Partnership,
  "Elimina partnership": CONTEXT_HELP_DESCRIPTIONS_RAW["Elimina partnership"],
  Segnala: CONTEXT_HELP_DESCRIPTIONS_RAW.Segnala,
  Sanziona: CONTEXT_HELP_DESCRIPTIONS_RAW.Sanziona,
});
const PAGE_ROLE_IDS = [IDs.roles.Member, IDs.roles.Staff, IDs.roles.HighStaff, IDs.roles.Founder,].filter(Boolean);
const PAGE_TITLES = { [IDs.roles.Member]: "Comandi Utente", [IDs.roles.Staff]: "Comandi Staff", [IDs.roles.HighStaff]: "Comandi High Staff", [IDs.roles.Founder]: "Comandi Dev", all: "Comandi Disponibili", };
const CATEGORY_LABELS = { utility: "Utility", music: "Musica", tts: "TTS", level: "Level", minigames: "Minigames", stats: "Stats", economy: "Economy", moderation: "Moderation", admin: "Admin", staff: "Staff", vip: "VIP", dev: "Dev", };
const CATEGORY_ORDER = ["utility", "tts", "level", "minigames", "stats", "music", "economy", "staff", "moderation", "admin", "dev",];
const PREFIX_MUSIC_SESSION_OWNER_COMMANDS = new Set(["skip", "stop", "pause", "resume", "volume", "shuffle", "clear", "repeat", "previous", "rewind", "restart"]);
const PREFIX_MUSIC_SESSION_OWNER_NOTE = " *Solo chi ha avviato la riproduzione può usarlo.*";
const HELP_NEW_EMOJI = "<:VC_New:1471891729471770819>";
const HELP_NEW_DAYS = 14;
const HELP_NEW_CATEGORIES = new Set(["music"]);
const HELP_NEW_INVOKES = new Set(["invites"]);
const HELP_PAGE_SIZE = 18;
const MAX_HELP_TEXT_LENGTH = 3900;
const HELP_CHANNEL_PUBLIC_COMMANDS_ID = String(IDs.channels?.commands || "1442569138114662490");
const HELP_CHANNEL_PM_ONLY_ID = "1495544523848286340";
const HELP_CHANNEL_STAFF_COMMANDS_ID = String(IDs.channels?.staffCmds || "1442569262689554444");
const HELP_PRIVILEGED_ROLE_IDS = [ IDs.roles.Founder, IDs.roles.Manager, IDs.roles.HighStaff, IDs.roles.Admin, IDs.roles.Director, IDs.roles.SeniorModerator, IDs.roles.Mod, IDs.roles.Helper, IDs.roles.Staff, IDs.roles.PartnerManager].filter(Boolean);
const CONTEXT_CATEGORY_OVERRIDES = {
  "aggiungi punti": "staff",
  "rimuovi punti": "staff",
  partnership: "staff",
  "elimina partnership": "staff",
};
const PERMISSIONS_CACHE_TTL_MS = 30_000;
const HELP_STATE_TIMEOUT_MS = Math.max(500, Math.min(10_000, Number(process.env.HELP_STATE_TIMEOUT_MS ?? 2_500)));
const HELP_MEMBER_TIMEOUT_MS = Math.max(500, Math.min(10_000, Number(process.env.HELP_MEMBER_TIMEOUT_MS ?? 3_000)));
let permissionsCache = null;
let permissionsCacheAt = 0;

async function withHelpTimeout(promise?, fallbackValue?, label?, timeoutMs?) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve?) => {
        timer = setTimeout(() => {
          global.logger?.warn?.(`[help] ${label} timed out after ${timeoutMs}ms`);
          resolve(fallbackValue);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } catch (err) {
    global.logger?.warn?.(`[help] ${label}:`, err?.message || err);
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getHelpNewEntryKey(entry?) {
  const type = String(entry?.type || "").toLowerCase();
  const invoke = normalizeInvokeLookup(entry?.invoke || "");
  return `${type}:${invoke}`.trim() || null;
}

async function loadHelpNewUntilMap() {
  const now = Date.now();
  try {
    const data = await withHelpTimeout(getBotState("helpNewUntil", null), null, "loadHelpNewUntilMap", HELP_STATE_TIMEOUT_MS);
    if (!data || typeof data !== "object") return {};
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "number" && v > now) filtered[k] = v;
    }
    if (Object.keys(filtered).length !== Object.keys(data).length) {
      void saveHelpNewUntilMap(filtered);
    }
    return filtered;
  } catch (_) {
    return {};
  }
}

async function saveHelpNewUntilMap(data?) {
  try {
    await withHelpTimeout(setBotState("helpNewUntil", data), null, "saveHelpNewUntilMap", HELP_STATE_TIMEOUT_MS);
  } catch (err) {
    global.logger?.warn?.("[help] saveHelpNewUntilMap:", err?.message || err);
  }
}

async function ensureHelpNewUntilForEntries(entries?, newUntilMap?) {
  const now = Date.now();
  const expiryMs = HELP_NEW_DAYS * 24 * 60 * 60 * 1000;
  let dirty = false;
  for (const entry of entries) {
    const key = getHelpNewEntryKey(entry);
    if (!key) continue;
    if (!Object.prototype.hasOwnProperty.call(newUntilMap, key)) {
      newUntilMap[key] = now + expiryMs;
      dirty = true;
    }
  }
  if (dirty) void saveHelpNewUntilMap(newUntilMap);
  return newUntilMap;
}

function isNewHelpEntry(entry?, newUntilMap = null) {
  const category = String(entry?.category || "").toLowerCase();
  if (HELP_NEW_CATEGORIES.has(category)) return true;
  const token = (normalizeInvokeLookup(entry.invoke) || "").split(" ")[0];
  if (token && HELP_NEW_INVOKES.has(token.toLowerCase())) return true;
  if (newUntilMap) {
    const key = getHelpNewEntryKey(entry);
    if (key && typeof newUntilMap[key] === "number" && Date.now() < newUntilMap[key]) return true;
  }
  return false;
}

function buildMiniHelpNotFoundEmbed(query?) {
  return new EmbedBuilder()
    .setColor(ERROR_EMBED_COLOR)
    .setTitle("Mini Help")
    .setDescription(
      `<:vegax:1443934876440068179> Nessun comando trovato per \`${query}\`.`,
    );
}

function buildNoAvailableCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(ERROR_EMBED_COLOR)
    .setDescription("<:vegax:1443934876440068179> Nessun comando disponibile.");
}

function resolveRoleReference(value?) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
  else if (key.startsWith("roles.")) key = key.slice("roles.".length);

  const resolved = IDs?.roles?.[key];
  if (!resolved) return null;
  return String(resolved);
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
  const now = Date.now();
  if (permissionsCache && now - permissionsCacheAt < PERMISSIONS_CACHE_TTL_MS) {
    return permissionsCache;
  }

  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) {
      permissionsCache = { slash: {}, prefix: {} };
      permissionsCacheAt = now;
      return permissionsCache;
    }
    const raw = fs.readFileSync(PERMISSIONS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    permissionsCache = {
      slash: normalizePermissionTree(parsed?.slash || {}),
      prefix: normalizePermissionTree(parsed?.prefix || {}),
    };
    permissionsCacheAt = now;
    return permissionsCache;
  } catch {
    permissionsCache = { slash: {}, prefix: {} };
    permissionsCacheAt = now;
    return permissionsCache;
  }
}

function normalizeDescription(
  text?,
  fallback = "Nessuna descrizione disponibile.",
) {
  const value = String(text || "").trim();
  return value.length ? value : fallback;
}

function getPrefixDescription(command?) {
  const commandName = String(command?.name || "").toLowerCase();
  let base;
  if (PREFIX_HELP_DESCRIPTIONS[commandName]) {
    base = PREFIX_HELP_DESCRIPTIONS[commandName];
  } else {
    const fromCommand = String(command?.description || "").trim();
    base = fromCommand.length ? fromCommand : "Descrizione non disponibile.";
  }
  if (PREFIX_MUSIC_SESSION_OWNER_COMMANDS.has(commandName)) {
    return `${base}${PREFIX_MUSIC_SESSION_OWNER_NOTE}`;
  }
  return base;
}

function getPrefixSubcommandDescription(command?, subcommandName?) {
  const commandName = String(command?.name || "").toLowerCase();
  const sub = String(subcommandName || "").toLowerCase();
  const key = `${commandName}.${sub}`;
  const withOwnerNote = (text?) =>
    PREFIX_MUSIC_SESSION_OWNER_COMMANDS.has(commandName)
      ? `${String(text || "").trim()}${PREFIX_MUSIC_SESSION_OWNER_NOTE}`
      : String(text || "").trim();
  if (PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key]) {
    return withOwnerNote(PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key]);
  }
  const fromMeta = String(command?.subcommandDescriptions?.[sub] || "").trim();
  if (fromMeta) return withOwnerNote(fromMeta);
  const fromCommand = String(command?.description || "").trim();
  if (fromCommand) return withOwnerNote(fromCommand);
  return withOwnerNote("Descrizione non disponibile.");
}

function getPrefixBase(command?) {
  void command;
  return "+";
}

function normalizeCategoryKey(value?) {
  const key = String(value || "misc").toLowerCase();
  if (key === "utiliy") return "utility";
  return key;
}

function resolveContextCategory(command?, dataJson?) {
  const contextName = String(dataJson?.name || "").trim().toLowerCase();
  if (contextName && CONTEXT_CATEGORY_OVERRIDES[contextName]) {
    return normalizeCategoryKey(CONTEXT_CATEGORY_OVERRIDES[contextName]);
  }
  return normalizeCategoryKey(command?.category || "contextmenubuilder");
}

function extractPrefixSubcommands(command?) {
  const fromMeta = Array.isArray(command?.subcommands) ? command.subcommands.map((s?) => String(s || "").trim().toLowerCase(),).filter(Boolean) : [];
  const fromAliases = command?.subcommandAliases && typeof command.subcommandAliases === "object" ? Object.values(command.subcommandAliases).map((s?) => String(s || "").trim().toLowerCase(),).filter(Boolean) : [];

  const src = String(command?.execute || "");
  const found = new Set();
  let match = null;

  const eqRegex = /subcommand\s*===\s*['"`]([a-z0-9._-]+)['"`]/gi;
  while ((match = eqRegex.exec(src)) !== null) {
    found.add(String(match[1]).toLowerCase());
  }

  const caseRegex = /case\s+['"`]([a-z0-9._-]+)['"`]\s*:/gi;
  while ((match = caseRegex.exec(src)) !== null) {
    found.add(String(match[1]).toLowerCase());
  }

  return Array.from(
    new Set([
      ...fromMeta,
      ...fromAliases,
      ...Array.from(found.values()),
    ]),
  );
}

function extractDirectAliasesForSubcommand(command?, subcommandName?) {
  const mapped = command?.subcommandAliases && typeof command.subcommandAliases === "object" ? command.subcommandAliases : {};
  const out = [];

  for (const [alias, target] of Object.entries(mapped)) {
    const normalizedAlias = String(alias || "").trim().toLowerCase();
    const normalizedTarget = String(target || "").trim().toLowerCase();
    if (!normalizedAlias || !normalizedTarget) continue;
    if (normalizedTarget !== subcommandName) continue;
    out.push(normalizedAlias);
  }

  return Array.from(new Set(out));
}

function getSlashTopLevelDescription(dataJson?) {
  return normalizeDescription(dataJson?.description, "Comando slash.");
}

function getCommandPermissionNode(permissionRoot?, commandName?) {
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

function normalizePermissionRoles(value?) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.roles)) {
    return value.roles;
  }
  return null;
}

function resolveHelpPermissionRoles(perm?) {
  const roles = normalizePermissionRoles(perm);
  if (Array.isArray(roles) && roles.length) return roles;
  const permission = String(perm?.permissions || "").trim().toLowerCase();
  if (permission === "administrator") {
    return [IDs.roles.Founder, IDs.roles.Admin, IDs.roles.Manager].filter(Boolean);
  }
  return null;
}

function getSubcommandEntries(commandName?, dataJson?, permissionConfig?, commandType?, category?) {
  const entries = [];
  const options = Array.isArray(dataJson?.options) ? dataJson.options : [];
  if (commandType !== ApplicationCommandType.ChatInput) return entries;

  const subPermissions = permissionConfig?.subcommands || {};
  const commandRoles = normalizePermissionRoles(permissionConfig?.roles);
  const topDesc = getSlashTopLevelDescription(dataJson);

  const parseSubOption = (subOption?, groupName = null) => {
    if (!subOption?.name) return; const subName = subOption.name; const key = groupName ? `${groupName}.${subName}` : subName;
    const allowedRoles = Object.prototype.hasOwnProperty.call(subPermissions, key,) ? subPermissions[key] : commandRoles;
    const roleList = normalizePermissionRoles(allowedRoles);

    const invokeDisplay = groupName
      ? `/${commandName} ${groupName} ${subName}`
      : `/${commandName} ${subName}`;
    entries.push({
      invoke: invokeDisplay,
      type: "slash",
      description: normalizeDescription(subOption.description, topDesc),
      category: normalizeCategoryKey(category),
      roles: roleList,
    });
  };
  for (const option of options) {
    if (option?.type === 1) {
      parseSubOption(option);
      continue;
    }
    if (option?.type === 2 && Array.isArray(option.options)) {
      for (const subOption of option.options) {
        if (subOption?.type === 1) parseSubOption(subOption, option.name);
      }
    }
  }
  return entries;
}

const OBSOLETE_SLASH_HELP_NAMES = new Set(
  (Array.isArray(DEFAULT_OBSOLETE_SLASH_NAMES) ? DEFAULT_OBSOLETE_SLASH_NAMES : [])
    .map((s?) => String(s || "").trim().toLowerCase())
    .filter(Boolean),
);

const OBSOLETE_PREFIX_HELP_NAMES = new Set([
  "staff",
  "colors",
  "verify",
  "ticket",
  "notify",
  "quit",
  "classifica",
  "no-dm-list",
  "recensione",
  "evento",
  "live",
]);

function shouldIncludePrefixCommandInHelp(command?, client?, userId?) {
  if (!command?.name) return false;
  if (command.tenantOnly) return false;
  if (command.hideFromHelp) return false;
  if (OBSOLETE_PREFIX_HELP_NAMES.has(String(command.name).trim().toLowerCase())) return false;
  return true;
}

function shouldIncludeSlashCommandInHelp(command?) {
  if (!command || command.skipDeploy || command.hideFromHelp) return false;
  const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
  const nm = String(dataJson?.name || command?.data?.name || "").trim().toLowerCase();
  if (OBSOLETE_SLASH_HELP_NAMES.has(nm)) return false;
  return true;
}

function buildEntries(client?, permissions?, options: Record<string, any> = {}) {
  const helpUserId = String(options.userId || "").trim();
  const entries = [];
  const showEconomyHelp = isEconomyCommandsVisible(client);

  for (const command of client.pcommands.values()) {
    if (!shouldIncludePrefixCommandInHelp(command, client, helpUserId)) continue;
    if (normalizeCategoryKey(command.folder || "misc") === "economy" && !showEconomyHelp) continue;
    if (normalizeCategoryKey(command.folder || "misc") === "economy" && command.name === "shop" && !isServerEconomyEnabled(client)) continue;
    if (normalizeCategoryKey(command.folder || "misc") === "economy" && !isEconomyGameEnabled(client, command.name)) continue;

    const perm = permissions.prefix?.[command.name];
    const commandRoles = Array.isArray(perm) ? perm : Array.isArray(perm?.roles) ? perm.roles : null;
    const subcommandRoles = perm && typeof perm === "object" && !Array.isArray(perm) ? perm.subcommands || {} : {};
    const aliases = Array.isArray(command.aliases) ? command.aliases.filter((alias?) => typeof alias === "string" && alias.trim().length,) : [];
    const prefixBase = getPrefixBase(command);
    const base = { type: "prefix", description: getPrefixDescription(command), aliases, prefixBase, category: normalizeCategoryKey(command.folder || "misc"), roles: commandRoles, };

    const declaredSubs = Array.isArray(command?.canonicalSubcommands)
      ? command.canonicalSubcommands
      : null;
        const canonicalSubs = Array.isArray(declaredSubs)
      ? Array.from(
          new Set(
            declaredSubs
              .map((s?) => String(s || "").trim().toLowerCase())
              .filter(Boolean),
          ),
        )
      : [];
    if (canonicalSubs.length) {
      if (command.allowEmptyArgs) {
        entries.push({
          ...base,
          invoke: `${prefixBase}${command.name}`,
        });
      }
      for (const sub of canonicalSubs) {
        entries.push({
          ...base,
          invoke: `${prefixBase}${command.name} ${sub}`,
          description: getPrefixSubcommandDescription(command, sub),
          roles: Array.isArray(subcommandRoles[sub])
            ? subcommandRoles[sub]
            : commandRoles,
          aliases: [],
          subAliases: extractDirectAliasesForSubcommand(command, sub),
        });
      }
    } else {
      entries.push({
        ...base,
        invoke: `${prefixBase}${command.name}`,
      });
    }
  }

  const seenSlash = new Set();
  for (const command of client.commands.values()) {
    if (!shouldIncludeSlashCommandInHelp(command)) continue;
    const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (commandType !== ApplicationCommandType.ChatInput) continue;

    const uniqueKey = `${dataJson.name}:${commandType}`;
    if (seenSlash.has(uniqueKey)) continue;
    seenSlash.add(uniqueKey);

    const perm = getCommandPermissionNode(permissions.slash, dataJson.name);
    const category = normalizeCategoryKey(command?.category || "misc");
    const hasSubcommands = Array.isArray(dataJson.options) && dataJson.options.some((opt?) => opt?.type === 1 || opt?.type === 2);

    const roles = normalizePermissionRoles(perm);
    if (hasSubcommands) {
      entries.push(
        ...getSubcommandEntries(
          dataJson.name,
          dataJson,
          perm,
          commandType,
          category,
        ),
      );
      continue;
    }

    entries.push({
      invoke: `/${dataJson.name}`,
      type: "slash",
      description: getSlashTopLevelDescription(dataJson),
      category,
      roles,
    });
  }

  for (const command of client.commands.values()) {
    if (!shouldIncludeSlashCommandInHelp(command)) continue;
    const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (
      commandType !== ApplicationCommandType.User &&
      commandType !== ApplicationCommandType.Message
    )
      continue;

    const perm = getCommandPermissionNode(permissions.slash, dataJson.name);
    const roles = resolveHelpPermissionRoles(perm);

    entries.push({
      invoke: `${dataJson.name}`,
      type: "context",
      description: normalizeDescription(
        command?.helpDescription ||
        command?.description ||
        CONTEXT_HELP_DESCRIPTIONS[dataJson.name] ||
        `Comando context (${commandType === ApplicationCommandType.User ? "utente" : "messaggio"}).`,
      ),
      category: resolveContextCategory(command, dataJson),
      roles,
    });
  }

  const dedupe = new Map();
  for (const entry of entries) {
    if (String(entry?.category || "").toLowerCase() === "misc") continue;
    const roleKey = Array.isArray(entry.roles) ? entry.roles.slice().sort().join(",") : "utente";
    const key = `${entry.type}:${entry.invoke}:${roleKey}`;
    if (!dedupe.has(key)) dedupe.set(key, entry);
  }

  const getCategoryIndex = (entry?) => { const key = String(entry?.category || "misc").toLowerCase(); const idx = CATEGORY_ORDER.indexOf(key); return idx === -1 ? CATEGORY_ORDER.length : idx; };

  return Array.from(dedupe.values()).sort((a?, b?) => {
    const catCmp = getCategoryIndex(a) - getCategoryIndex(b);
    if (catCmp !== 0) return catCmp;
    return a.invoke.localeCompare(b.invoke, "it");
  });
}

function hasAnyRole(memberRoles?, roleIds?) {
  if (!memberRoles || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roleIds.some((roleId?) => memberRoles.has(roleId));
}

const STAFF_TIER_ROLES = [IDs.roles.Founder, IDs.roles.HighStaff, IDs.roles.Staff, IDs.roles.PartnerManager,].filter(Boolean);

function canMemberSeeEntry(entry?, memberRoles?) {
  const roles = entry?.roles;
  if (!Array.isArray(roles) || roles.length === 0) return true;
  if (hasAnyRole(memberRoles, roles)) return true;
  const memberHasMemberRole = IDs.roles.Member && memberRoles?.has(IDs.roles.Member);
  const entryOnlyVip = roles.length > 0 && roles.every((r?) => String(r) === String(IDs.roles.VIP || ""));
  if (memberHasMemberRole && entryOnlyVip) return true;
  return false;
}

function entryHasAnyRole(entry?, roleIds?) {
  const roles = Array.isArray(entry?.roles) ? entry.roles : [];
  if (!roles.length || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roles.some((roleId?) => roleIds.includes(roleId));
}

function filterEntriesByHelpChannel(entries?, channelId?, memberRoles = null) {
  const ch = String(channelId || "");
  const list = Array.isArray(entries) ? entries : [];
  if (!ch) return list;
  if (ch === HELP_CHANNEL_STAFF_COMMANDS_ID) return list;
  if (ch === HELP_CHANNEL_PUBLIC_COMMANDS_ID) {
            return list.filter((entry?) => {
      if (!entryHasAnyRole(entry, HELP_PRIVILEGED_ROLE_IDS)) return true;
      if (!memberRoles) return false;
      if (!hasAnyRole(memberRoles, [IDs.roles.PartnerManager].filter(Boolean))) return false;
      return entryHasAnyRole(entry, [IDs.roles.PartnerManager].filter(Boolean));
    });
  }
  if (ch === HELP_CHANNEL_PM_ONLY_ID) {
    return list.filter((entry?) => {
      if (!entryHasAnyRole(entry, HELP_PRIVILEGED_ROLE_IDS)) return true;
      return entryHasAnyRole(entry, [IDs.roles.PartnerManager].filter(Boolean));
    });
  }
  return list;
}

function chunkEntriesByCategory(entries?, maxPerPage?) {
  if (!entries.length) return [];
  const byCategory = new Map();
  for (const entry of entries) {
    const key = String(entry?.category || "misc").toLowerCase();
    if (key === "misc") continue;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(entry);
  }
  const orderedCategories = Array.from(byCategory.keys()).sort((a?, b?) => { const ai = CATEGORY_ORDER.indexOf(a); const bi = CATEGORY_ORDER.indexOf(b); const safeA = ai === -1 ? CATEGORY_ORDER.length : ai; const safeB = bi === -1 ? CATEGORY_ORDER.length : bi; return safeA - safeB; });
  const chunks = [];
  let currentPage = [];
  for (const cat of orderedCategories) {
    const catEntries = (byCategory.get(cat) || []).slice().sort((a?, b?) => String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"),);
    if (!catEntries.length) continue;
    if (currentPage.length + catEntries.length <= maxPerPage) {
      currentPage.push(...catEntries);
    } else {
      if (currentPage.length) chunks.push(currentPage);
      currentPage = [];
      if (catEntries.length <= maxPerPage) {
        currentPage = catEntries;
      } else {
        chunks.push(catEntries);
      }
    }
  }
  if (currentPage.length) chunks.push(currentPage);
  return chunks.length ? chunks : [];
}

function mergeAdjacentHelpChunks(chunks?, maxPerPage?) {
  if (!Array.isArray(chunks) || chunks.length <= 1) return chunks;
  const out = [];
  let buffer = null;
  for (const chunk of chunks) {
    const c = Array.isArray(chunk) ? chunk : [];
    if (!c.length) continue;
    if (buffer == null) {
      buffer = [...c];
      continue;
    }
    if (buffer.length + c.length <= maxPerPage) {
      buffer.push(...c);
    } else {
      out.push(buffer);
      buffer = [...c];
    }
  }
  if (buffer != null && buffer.length) out.push(buffer);
  return out.length ? out : chunks;
}

function renderPageText(page?, newUntilMap = null) {
  const grouped = new Map();
  for (const entry of page.items) {
    const key = String(entry.category || "misc").toLowerCase();
    if (key === "misc") continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const orderedKeys = Array.from(grouped.keys()).sort((a?, b?) => { const ai = CATEGORY_ORDER.indexOf(a); const bi = CATEGORY_ORDER.indexOf(b); const safeA = ai === -1 ? CATEGORY_ORDER.length : ai; const safeB = bi === -1 ? CATEGORY_ORDER.length : bi; return safeA - safeB; });

  const sections = [];
  for (const categoryKey of orderedKeys) {
    const categoryEntries = (grouped.get(categoryKey) || []).slice().sort((a?, b?) => String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"),);
    const categoryLabel = CATEGORY_LABELS[categoryKey] || categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
    const rows = categoryEntries.map((entry?) => {
      const invokeNorm = normalizeInvokeLookup(entry.invoke); const prefixForAlias = entry.prefixBase != null ? String(entry.prefixBase) : "+"; let aliasList = Array.isArray(entry.aliases) && entry.aliases.length ? entry.aliases.map((a?) => String(a || "").trim()).filter((a?) => a && normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, "")) !== invokeNorm) : []; const isTicketCommand = invokeNorm.startsWith("ticket") || String(entry.invoke || "").toLowerCase().startsWith("+ticket"); if (isTicketCommand && Array.isArray(entry.subAliases) && entry.subAliases.length) { const existingNorm = new Set(aliasList.map((a?) => normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, "")))); for (const a of entry.subAliases) { const s = String(a || "").trim(); if (!s) continue; const norm = normalizeInvokeLookup(prefixForAlias + s.replace(/^[/+]+/, "")); if (norm !== invokeNorm && !existingNorm.has(norm)) { existingNorm.add(norm); aliasList.push(s); } } } const aliasPart = aliasList.length ? " | " + aliasList.map((a?) => "`" + (a.startsWith("+") || a.startsWith("/") ? a : prefixForAlias + a) + "`").join(", ") : ""; const onlyMemberRole = Array.isArray(entry.roles) && entry.roles.length === 1 && String(entry.roles[0]) === String(IDs.roles.Member); const roleHint = Array.isArray(entry.roles) && entry.roles.length > 0 && !onlyMemberRole ? ` *(Richiede: ${entry.roles.map((id?) => `<@&${id}>`).join(", ")})*` : ""; const newBadge = isNewHelpEntry(entry, newUntilMap) ? ` ${HELP_NEW_EMOJI}` : ""; return `- \`${entry.invoke}\`${aliasPart} - ${entry.description}${newBadge}${roleHint}`;
    });
    sections.push(`**${categoryLabel}**\n${rows.join("\n")}`);
  }

  if (!page.items.length) return "<:vegax:1443934876440068179> Nessun comando disponibile in questa pagina.";
  const pageTitle = PAGE_TITLES[page.roleId] || "Comandi";
  const header = ["## Comandi Disponibili", "", ...(pageTitle !== "Comandi Disponibili" ? [`### ${pageTitle}`, ""] : []),
    "Ecco la lista dei comandi disponibili.",
    "Usa il prefix, slash o context menu in base al comando.",
    "Mini-help rapido: `+help <comando>`.",
    "",
    "",
  ].join("\n");
  const body = sections.join("\n");
  return { header, body };
}

function splitHelpTextByLength(text?, maxLen = MAX_HELP_TEXT_LENGTH) {
  const input = String(text || "");
  if (!input.length) return [""];
  if (input.length <= maxLen) return [input];

  const lines = input.split("\n");
  const chunks = [];
  let current = "";

  const pushCurrent = () => { if (!current.length) return; chunks.push(current); current = ""; };

  for (const line of lines) {
    const piece = current.length ? `\n${line}` : line;
    if ((current + piece).length <= maxLen) {
      current += piece;
      continue;
    }

    if (current.length) pushCurrent();

    if (line.length <= maxLen) {
      current = line;
      continue;
    }

    let rest = line;
    while (rest.length > maxLen) {
      chunks.push(rest.slice(0, maxLen));
      rest = rest.slice(maxLen);
    }
    current = rest;
  }

  pushCurrent();
  return chunks.length ? chunks : [input.slice(0, maxLen)];
}

const HELP_PAGE_FOOTER_RESERVED = 30;
const MAX_TEXTDISPLAY_LENGTH = 3800;

function splitBodyBySections(body?, maxBodyLen?) {
  const sections = body.split(/\n(?=\*\*[^*]+\*\*)/).filter(Boolean);
  if (!sections.length) return [""];
  const chunks = [];
  let current = [];
  let currentLen = 0;
  const sepLen = 1;
  for (const sec of sections) {
    const sep = current.length ? sepLen : 0;
    if (currentLen + sep + sec.length > maxBodyLen && current.length) {
      chunks.push(current.join("\n"));
      current = [];
      currentLen = 0;
    }
    if (sec.length > maxBodyLen) {
      if (current.length) {
        chunks.push(current.join("\n"));
        current = [];
        currentLen = 0;
      }
      const subChunks = splitHelpTextByLength(sec, maxBodyLen);
      for (const sub of subChunks) chunks.push(sub);
      continue;
    }
    current.push(sec);
    currentLen += sep + sec.length;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

function expandHelpDisplayPages(basePages?, newUntilMap = null) {
  const expanded = [];

  for (const page of basePages) {
    const result = renderPageText(page, newUntilMap);
    if (typeof result === "string") {
      expanded.push({ ...page, renderedText: result });
      continue;
    }
    const parts = result;
    const maxBodyLen = Math.max(200, MAX_TEXTDISPLAY_LENGTH - HELP_PAGE_FOOTER_RESERVED - parts.header.length);
    const bodyChunks = splitBodyBySections(parts.body, maxBodyLen);
    for (const chunk of bodyChunks) {
      expanded.push({
        ...page,
        renderedText: parts.header + chunk,
      });
    }
  }

  let total = expanded.length;
  expanded.forEach((page?, idx?) => {
    page.indexLabel = `${idx + 1}/${total}`;
    page.renderedText = `${String(page.renderedText || "").trimEnd()}\n\n**Pagina ${page.indexLabel}**`;
  });

  return expanded;
}

function buildNavigationRow(state?) {
  const base = `mhelp:${state.ownerId}:${state.channelId}:${state.currentIndex}:${state.total}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}:prev`)
      .setEmoji(`<a:vegaleftarrow:1462914743416131816>`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:next`)
      .setEmoji(`<a:vegarightarrow:1443673039156936837>`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentIndex >= state.total - 1),
    new ButtonBuilder()
      .setCustomId(`${base}:close`)
      .setEmoji("<:cancel:1461730653677551691>")
      .setStyle(ButtonStyle.Danger),
  );
}

function parseMainHelpCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "mhelp" || parts.length < 6) return null;
  const [, ownerId, channelId, pageRaw, totalRaw, action] = parts;
  if (!/^\d{16,20}$/.test(ownerId) || !/^\d{16,20}$/.test(channelId)) return null;
  if (!["prev", "next", "close"].includes(action)) return null;
  return {
    ownerId,
    channelId,
    page: Math.max(0, Math.floor(Number(pageRaw) || 0)),
    total: Math.max(1, Math.floor(Number(totalRaw) || 1)),
    action,
  };
}

async function buildMainHelpDisplayPages(guild?, member?, client?, channelId?) {
  const permissions = loadPermissions();
  const allEntries = buildEntries(client, permissions, { userId: member?.user?.id || member?.id });
  const newUntilMap = await ensureHelpNewUntilForEntries(allEntries, await loadHelpNewUntilMap());
  const memberRoles = member?.roles?.cache || new Map();
  const memberVisibleEntries = allEntries.filter((entry?) => canMemberSeeEntry(entry, memberRoles));
  const channelScopedEntries = filterEntriesByHelpChannel(memberVisibleEntries, String(channelId || ""), memberRoles);
  const sortedVisible = dedupeAndSortEntries(channelScopedEntries);
  const chunks = mergeAdjacentHelpChunks(
    chunkEntriesByCategory(sortedVisible, HELP_PAGE_SIZE),
    HELP_PAGE_SIZE,
  );
  const groupedPages = chunks.map((items?) => ({
    roleId: "all",
    items,
    indexLabel: "",
    groupLabel: PAGE_TITLES.all || "Comandi Disponibili",
  }));
  return expandHelpDisplayPages(groupedPages, newUntilMap);
}

async function handleMainHelpNavInteraction(interaction?) {
  const parsed = parseMainHelpCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== parsed.ownerId) {
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Puoi usare i bottoni solo sul tuo help.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => null);
    return true;
  }
  if (parsed.action === "close") {
    await interaction.deferUpdate().catch(() => null);
    await interaction.message?.delete?.().catch(() => null);
    return true;
  }
  const member =
    interaction.member ||
    (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
  const displayPages = await buildMainHelpDisplayPages(
    interaction.guild,
    member,
    interaction.client,
    parsed.channelId,
  );
  if (!displayPages.length) {
    await interaction.deferUpdate().catch(() => null);
    return true;
  }
  let page = parsed.page;
  if (parsed.action === "prev") page = Math.max(0, page - 1);
  else if (parsed.action === "next") page = Math.min(displayPages.length - 1, page + 1);
  page = Math.min(displayPages.length - 1, Math.max(0, page));
  const navState = {
    currentIndex: page,
    total: displayPages.length,
    ownerId: parsed.ownerId,
    channelId: parsed.channelId,
    guildId: interaction.guild.id,
  };
  await safeInteractionUpdate(interaction, {
    components: [buildHelpV2Container(displayPages[page], navState, interaction.guild.id)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_REPLY_MENTIONS,
  });
  return true;
}

function buildHelpV2Container(page?, navState?, guildId = "") {
  let content = page?.renderedText;
  if (content == null) {
    const r = renderPageText(page);
    content = typeof r === "string" ? r : r.header + r.body;
  }
  const components = [{ type: ComponentType.TextDisplay, content, },];
  if (navState.total > 1) {
    components.push((buildNavigationRow(navState).toJSON() as any));
  }
  return {
    type: ComponentType.Container,
    accentColor: resolveHelpAccentColorInt({}, guildId),
    components,
  };
}

function normalizeInvokeLookup(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[/+?!.\-]+/, "")
    .replace(/\s+/g, " ");
}

function getCategoryIndex(entry?) {
  const key = String(entry?.category || "misc").toLowerCase();
  const idx = CATEGORY_ORDER.indexOf(key);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function dedupeAndSortEntries(entries?) {
  const map = new Map();
  for (const entry of entries) {
    const key = `${entry.type}:${entry.invoke}`;
    if (!map.has(key)) map.set(key, entry);
  }
  return Array.from(map.values()).sort((a?, b?) => {
    const catCmp = getCategoryIndex(a) - getCategoryIndex(b);
    if (catCmp !== 0) return catCmp;
    return String(a.invoke || "").localeCompare(String(b.invoke || ""), "it");
  });
}

function formatRoleMentions(roleIds?) {
  if (!Array.isArray(roleIds)) return "Tutti";
  const roles = normalizeRoleList(roleIds);
  if (!roles.length) return "Nessun ruolo configurato";
  return roles.map((roleId?) => `<@&${roleId}>`).join(", ");
}

function getPrefixPermissionConfig(permissions?, commandName?) {
  const raw = permissions?.prefix?.[commandName];
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

function pushChunkedField(fields?, name?, lines?, inline = false, maxLen = 980) {
  if (!Array.isArray(lines) || !lines.length) return;
  let current = "";
  let idx = 0;

  const flush = () => {
    if (!current.trim().length) return; fields.push({
      name: idx === 0 ? name : `${name}(cont.)`,
      value: current.trim(),
      inline,
    });
    idx += 1;
    current = "";
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    const next = current.length ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      flush();
      current = line;
      continue;
    }
    current = next;
  }
  flush();
}

function collectCommandUsageSnippets(command?, commandName?, prefixBase?) {
  const snippets = new Set();
  const name = String(commandName || "").toLowerCase();
  const prefix = String(prefixBase || "+");
  const knownAliases = Array.isArray(command?.aliases) ? command.aliases.map((alias?) => String(alias || "").trim().toLowerCase(),).filter(Boolean) : [];

  const addSnippet = (value?) => { const text = String(value || "").trim(); if (!text) return; if (text.length > 200) return; snippets.add(text.replace(/\s+/g, " ")); };

  const candidateMeta = [command?.usage, command?.example, command?.helpUsage, ...(Array.isArray(command?.usages) ? command.usages : []), ...(Array.isArray(command?.examples) ? command.examples : []),];
  for (const candidate of candidateMeta) {
    if (typeof candidate !== "string") continue;
    const lines = candidate.split("\n").map((line?) => line.trim()).filter(Boolean);
    for (const line of lines) addSnippet(line);
  }

  const src = String(command?.execute || "");
  const backtickRegex = /`([^`\n]{3,200})`/g;
  let match = null;
  while ((match = backtickRegex.exec(src)) !== null) {
    const snippet = String(match[1] || "").trim();
    if (!snippet) continue;
    const lower = snippet.toLowerCase();
    if (lower.includes(`${prefix}${name}`) || lower.includes(`/${name}`)) {
      addSnippet(snippet);
      continue;
    }
    if (knownAliases.some((alias?) => lower.includes(`${prefix}${alias}`))) {
      addSnippet(snippet);
    }
  }

  const ordered = Array.from(snippets.values()).sort((a?: any, b?: any) => a.length - b.length,);
  return ordered.slice(0, 12);
}

function collectPrefixExampleLines(command?, commandName?, prefixBase?, subEntries = [], requestedSub = null) {
  const out = [];
  const push = (line?) => { const value = String(line || "").trim(); if (!value) return; if (!out.includes(value)) out.push(value); };

  const snippets = collectCommandUsageSnippets(command, commandName, prefixBase,);
  if (requestedSub) {
    for (const row of snippets) {
      const lower = (row as any).toLowerCase();
      if (
        lower.includes(`${prefixBase}${commandName} ${requestedSub}`) ||
        lower.includes(` ${requestedSub} `)
      ) {
        push(`- \`${row}\``);
      }
    }
  } else {
    for (const row of snippets) push(`- \`${row}\``);
  }

  if (subEntries.length) {
    for (const entry of subEntries) {
      push(`- \`${entry.invoke}\``);
    }
  } else {
    push(`- \`${prefixBase}${commandName}\``);
  }

  return out.slice(0, 16);
}

function buildPrefixDetailedHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const commands = Array.from(context?.client?.pcommands?.values?.() || [],).filter((cmd?: any) => String(cmd?.name || "").trim().length);
  if (!commands.length) return null;

  let command: any =
    commands.find(
      (cmd?: any) =>
        String(cmd.name || "")
          .trim()
          .toLowerCase() === queryToken,
    ) || null;
  if (!command) {
    command =
      commands.find(
        (cmd?: any) =>
          Array.isArray(cmd.aliases) &&
          cmd.aliases.some(
            (alias?) =>
              String(alias || "")
                .trim()
                .toLowerCase() === queryToken,
          ),
      ) || null;
  }
  if (!command) return null;

  const commandName = String(command.name || "").trim().toLowerCase();
  const prefixBase = getPrefixBase(command);
  const visibleForCommand = entries.filter((entry?) => { if (entry.type !== "prefix") return false; const invoke = normalizeInvokeLookup(entry.invoke); return invoke.split(" ")[0] === commandName; });
  if (!visibleForCommand.length) return null;
  const permissions = context?.permissions || {};
  const permConfig = getPrefixPermissionConfig(permissions, commandName);
  const subAliasesMap = command?.subcommandAliases && typeof command.subcommandAliases === "object" ? command.subcommandAliases : {};

  let requestedSub = tokens[1] || null;
  if (requestedSub && subAliasesMap[requestedSub]) {
    requestedSub =
      String(subAliasesMap[requestedSub] || "")
        .trim()
        .toLowerCase() || requestedSub;
  }

  const usageLines = [];
  const allSubs = Array.from(new Set(visibleForCommand.map((entry?) => normalizeInvokeLookup(entry.invoke).split(" ")[1] || null,).filter(Boolean),),);
  if (allSubs.length) {
    usageLines.push(`\`${prefixBase}${commandName} <subcommand>\``);
  } else {
    usageLines.push(`\`${prefixBase}${commandName}\``);
  }

  const aliases = Array.isArray(command.aliases) ? command.aliases.map((alias?) => String(alias || "").trim().toLowerCase(),).filter(Boolean) : [];
  if (aliases.length) {
    usageLines.push(
      `Alias comando: ${aliases.map((alias?) => `\`${prefixBase}${alias}\``).join(", ")}`,
    );
  }
  usageLines.push(`Ruoli richiesti: ${formatRoleMentions(permConfig.roles)}`);
  if (PREFIX_MUSIC_SESSION_OWNER_COMMANDS.has(commandName)) {
    usageLines.push(
      "Restrizione musica: solo l’utente che ha avviato la sessione (primo +play con coda ferma) può usare questo comando.",
    );
  }

  const subEntries = visibleForCommand.filter((entry?) => normalizeInvokeLookup(entry.invoke).split(" ").length > 1,).filter((entry?) => { if (!requestedSub) return true; return normalizeInvokeLookup(entry.invoke).split(" ")[1] === requestedSub; }).sort((a?, b?) => String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"),);

  const subLines = [];
  const visibleInvokeSet = getVisibleInvokeSet(visibleForCommand);
  for (const entry of subEntries) {
    const subName = normalizeInvokeLookup(entry.invoke).split(" ")[1];
    const subRoleIds = Array.isArray(permConfig.subcommands?.[subName]) ? permConfig.subcommands[subName] : permConfig.roles;
    const subAliases = entry.subAliases ?? extractDirectAliasesForSubcommand(command, subName);
    const subAliasPart = Array.isArray(subAliases) && subAliases.length ? ` (${subAliases.join(", ")})` : "";
    subLines.push(
      `- \`${prefixBase}${commandName} ${subName}\`${subAliasPart} - ${entry.description}`,
    );
    subLines.push(`Ruoli: ${formatRoleMentions(subRoleIds)}`);
  }
  if (requestedSub && !subLines.length) {
    const allKnownSubs = listPrefixSubcommandsForCommand(command, commandName, permissions,);
    for (const sub of allKnownSubs) {
      const invoke = `${prefixBase}${commandName} ${sub}`;
      const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
      const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
      const subRoleIds = Array.isArray(permConfig.subcommands?.[sub]) ? permConfig.subcommands[sub] : permConfig.roles;
      const subAliases = extractDirectAliasesForSubcommand(command, sub);
      const subAliasPart = subAliases.length ? ` (${subAliases.join(", ")})` : "";
      subLines.push(
        `- \`${invoke}\`${subAliasPart} - ${getPrefixSubcommandDescription(command, sub)}${lock}`,
      );
      subLines.push(`  Ruoli: ${formatRoleMentions(subRoleIds)}`);
    }
  }

  const snippetLines = collectPrefixExampleLines(command, commandName, prefixBase, subEntries.map((entry?) => ({ invoke: entry.invoke })), requestedSub,);

  const embed = new EmbedBuilder().setColor(resolveHelpEmbedColor(context)).setTitle(`Guida comando: ${prefixBase}${commandName}`)
    .setDescription(getPrefixDescription(command));

  const fields = [];
  pushChunkedField(fields, "Sintassi", usageLines);
  if (subLines.length) {
    pushChunkedField(
      fields,
      requestedSub ? `Subcommand: ${requestedSub}` : "Subcommands",
      subLines,
    );
  }
  pushChunkedField(fields, "Esempi di uso", snippetLines);
  if (fields.length) embed.addFields(fields.slice(0, 25));
  return embed;
}

function getOptionTypeLabel(type?) {
  const labels = { 1: "Subcommand", 2: "Gruppo", 3: "String", 4: "Integer", 5: "Boolean", 6: "User", 7: "Channel", 8: "Role", 9: "Mentionable", 10: "Number", 11: "Attachment", };
  return labels[type] || "Option";
}

function formatSlashOptionPlaceholder(option?) {
  if (!option?.name) return "";
  return option.required ? `<${option.name}>` : `[${option.name}]`;
}

function getSlashSampleValueByType(optionType?) {
  if (optionType === 3) return "testo";
  if (optionType === 4) return "10";
  if (optionType === 5) return "true";
  if (optionType === 6) return "@utente";
  if (optionType === 7) return "#canale";
  if (optionType === 8) return "@ruolo";
  if (optionType === 9) return "@utente";
  if (optionType === 10) return "1.5";
  if (optionType === 11) return "file";
  return "valore";
}

function buildSlashExampleLine(commandName?, groupName?, subName?, optionList = []) {
  const parts = [`/${commandName}`];
  if (groupName) parts.push(groupName);
  if (subName) parts.push(subName);
  for (const opt of optionList) {
    if (!opt?.name || opt.type < 3 || opt.type > 11) continue;
    parts.push(getSlashSampleValueByType(opt.type));
  }
  return `- \`${parts.join(" ")}\``;
}

function buildSlashDetailedHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const seen = new Set();
  const slashCommands = [];
  for (const cmd of Array.from(context?.client?.commands?.values?.() || [])) {
    if (!shouldIncludeSlashCommandInHelp(cmd)) continue;
    const dataJson = (cmd as any)?._helpDataJson || (cmd as any)?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const type = dataJson.type || ApplicationCommandType.ChatInput;
    if (type !== ApplicationCommandType.ChatInput) continue;
    const key = `${dataJson.name}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slashCommands.push({ cmd, dataJson });
  }
  if (!slashCommands.length) return null;

  const hit = slashCommands.find(({ dataJson }) => String(dataJson.name || "").trim().toLowerCase() === queryToken,);
  if (!hit) return null;

  const commandName = String(hit.dataJson.name || "").trim().toLowerCase();
  const visibleForCommand = entries.filter((entry?) => entry.type === "slash" && normalizeInvokeLookup(entry.invoke).split(" ")[0] === commandName,);
  if (!visibleForCommand.length) return null;

  const options = Array.isArray(hit.dataJson.options) ? hit.dataJson.options : [];
  const hasSub = options.some((opt?) => opt?.type === 1 || opt?.type === 2);
  const requestedSub = tokens[1] || null;

  const syntaxLines = [];
  const optionLines = [];
  const exampleLines = [];

  if (!hasSub) {
    const placeholders = options.filter((opt?) => opt?.type >= 3 && opt?.type <= 11).map((opt?) => formatSlashOptionPlaceholder(opt)).filter(Boolean);
    syntaxLines.push(
      `\`/${commandName}${placeholders.length ? ` ${placeholders.join(" ")}` : ""}\``,
    );
    exampleLines.push(buildSlashExampleLine(commandName, null, null, options));
    for (const opt of options) {
      if (!opt?.name || opt?.type < 3 || opt?.type > 11) continue;
      const required = opt.required ? "obbligatoria" : "opzionale";
      const choices = Array.isArray(opt.choices) && opt.choices.length ? ` | scelte: ${opt.choices.map((c?) => `\`${c.name}\``).join(", ")}`
        : "";
      optionLines.push(
        `- \`${opt.name}\` (${getOptionTypeLabel(opt.type)}, ${required}) - ${normalizeDescription(opt.description, "Nessuna descrizione.")}${choices}`,
      );
    }
  } else {
    for (const opt of options) {
      if (opt?.type === 1) {
        const subName = String(opt.name || "").trim().toLowerCase();
        if (requestedSub && requestedSub !== subName) continue;
        const subPlaceholders = (Array.isArray(opt.options) ? opt.options : []).filter((child?) => child?.type >= 3 && child?.type <= 11).map((child?) => formatSlashOptionPlaceholder(child)).filter(Boolean);
        syntaxLines.push(
          `\`/${commandName} ${subName}${subPlaceholders.length ? ` ${subPlaceholders.join(" ")}` : ""}\``,
        );
        exampleLines.push(
          buildSlashExampleLine(
            commandName,
            null,
            subName,
            Array.isArray(opt.options) ? opt.options : [],
          ),
        );
        optionLines.push(
          `- \`${subName}\` - ${normalizeDescription(opt.description, "Nessuna descrizione.")}`,
        );
        for (const child of Array.isArray(opt.options) ? opt.options : []) {
          if (!child?.name || child?.type < 3 || child?.type > 11) continue;
          const required = child.required ? "obbligatoria" : "opzionale";
          const choices = Array.isArray(child.choices) && child.choices.length ? ` | scelte: ${child.choices.map((c?) => `\`${c.name}\``).join(", ")}`
            : "";
          optionLines.push(
            `  - \`${child.name}\` (${getOptionTypeLabel(child.type)}, ${required})${choices}`,
          );
        }
      }
      if (opt?.type === 2 && Array.isArray(opt.options)) {
        const groupName = String(opt.name || "").trim().toLowerCase();
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const subName = String(sub.name || "").trim().toLowerCase();
          if (
            requestedSub &&
            requestedSub !== groupName &&
            requestedSub !== subName
          )
            continue;
          const subPlaceholders = (Array.isArray(sub.options) ? sub.options : []).filter((child?) => child?.type >= 3 && child?.type <= 11).map((child?) => formatSlashOptionPlaceholder(child)).filter(Boolean);
          syntaxLines.push(
            `\`/${commandName} ${groupName} ${subName}${subPlaceholders.length ? ` ${subPlaceholders.join(" ")}` : ""}\``,
          );
          exampleLines.push(
            buildSlashExampleLine(
              commandName,
              groupName,
              subName,
              Array.isArray(sub.options) ? sub.options : [],
            ),
          );
          optionLines.push(
            `- \`${groupName} ${subName}\` - ${normalizeDescription(sub.description, "Nessuna descrizione.")}`,
          );
          for (const child of Array.isArray(sub.options) ? sub.options : []) {
            if (!child?.name || child?.type < 3 || child?.type > 11) continue;
            const required = child.required ? "obbligatoria" : "opzionale";
            const choices = Array.isArray(child.choices) && child.choices.length ? ` | scelte: ${child.choices.map((c?) => `\`${c.name}\``).join(", ")}`
              : "";
            optionLines.push(
              `  - \`${child.name}\` (${getOptionTypeLabel(child.type)}, ${required})${choices}`,
            );
          }
        }
      }
    }
  }

  const perm = context?.permissions?.slash?.[commandName];
  const roleIds = Array.isArray(perm) ? perm : Array.isArray(perm?.roles) ? perm.roles : null;
  const effectiveSyntax = syntaxLines.length ? syntaxLines : [`\`/${commandName}\``];
  const embed = new EmbedBuilder().setColor(resolveHelpEmbedColor(context)).setTitle(`Guida comando: /${commandName}`)
    .setDescription(
      normalizeDescription(hit.dataJson.description, "Comando slash."),
    );

  const fields = [];
  pushChunkedField(fields, "Sintassi", effectiveSyntax);
  pushChunkedField(fields, "Permessi", [
    `Ruoli richiesti: ${formatRoleMentions(roleIds)}`,
  ]);
  if (optionLines.length) {
    pushChunkedField(fields, "Opzioni", optionLines);
  }
  if (requestedSub && !optionLines.length) {
    const visibleInvokeSet = getVisibleInvokeSet(visibleForCommand);
    const fallbackSubLines = [];
    for (const opt of options) {
      if (opt?.type === 1 && opt?.name) {
        const invoke = `/${commandName} ${opt.name}`;
        const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
        const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
        fallbackSubLines.push(
          `- \`${invoke}\` - ${normalizeDescription(opt.description, "Nessuna descrizione.")}${lock}`,
        );
      }
      if (opt?.type === 2 && Array.isArray(opt.options)) {
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const invoke = `/${commandName} ${opt.name} ${sub.name}`;
          const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
          const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
          fallbackSubLines.push(
            `- \`${invoke}\` - ${normalizeDescription(sub.description, "Nessuna descrizione.")}${lock}`,
          );
        }
      }
    }
    if (fallbackSubLines.length) {
      pushChunkedField(fields, "Subcommands disponibili", fallbackSubLines);
    }
  }
  pushChunkedField(
    fields,
    "Esempi di uso",
    exampleLines.length ? exampleLines : [`- \`/${commandName}\``],
  );
  if (fields.length) embed.addFields(fields.slice(0, 25));
  return embed;
}

function buildDetailedHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  return (
    buildPrefixDetailedHelpEmbed(query, entries, context) ||
    buildSlashDetailedHelpEmbed(query, entries, context) ||
    null
  );
}

function getVisibleInvokeSet(entries?) {
  const set = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const invoke = normalizeInvokeLookup(entry?.invoke);
    if (invoke) set.add(invoke);
  }
  return set;
}

function resolvePrefixCommandByToken(client?, token?) {
  const safeToken = String(token || "").trim().toLowerCase();
  if (!safeToken) return null;
  const commands = Array.from(client?.pcommands?.values?.() || []);
  for (const command of commands) {
    const name = String((command as any)?.name || "").trim().toLowerCase();
    if (name && name === safeToken) return command;
    const aliases = Array.isArray((command as any)?.aliases) ? (command as any).aliases.map((alias?) => String(alias || "").trim().toLowerCase(),) : [];
    if (aliases.includes(safeToken)) return command;
  }
  return null;
}

function listPrefixSubcommandsForCommand(command?, commandName?, permissions?) {
  const baseSubcommands = Array.from(new Set([...extractPrefixSubcommands(command), ...(Array.isArray(command?.subcommands) ? command.subcommands.map((s?) => String(s || "").trim().toLowerCase(),).filter(Boolean) : []),]),);
  const subcommands = Array.from(new Set(baseSubcommands));
  return subcommands.sort((a?, b?) => a.localeCompare(b, "it"));
}

function buildSubcommandFallbackEmbed(query?, visibleEntries?, context: Record<string, any> = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const permissions = context?.permissions || {};
  const visibleInvokeSet = getVisibleInvokeSet(visibleEntries);

  const prefixCommand: any = resolvePrefixCommandByToken(context?.client, queryToken,);
  if (prefixCommand) {
    const commandName = String(prefixCommand.name || "").trim().toLowerCase();
    const prefixBase = getPrefixBase(prefixCommand);
    const subcommands = listPrefixSubcommandsForCommand(prefixCommand, commandName, permissions,);
    if (subcommands.length) {
      const lines = subcommands.map((sub?) => {
        const invoke = `${prefixBase}${commandName}${sub}`;
        const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
        const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
        const subAliases = extractDirectAliasesForSubcommand(prefixCommand, sub);
        const subAliasPart = subAliases.length ? `(${subAliases.join(", ")})` : "";
        return `-\`${invoke}\`${subAliasPart}-${getPrefixSubcommandDescription(prefixCommand, sub)}${lock}`;
      });
      return new EmbedBuilder()
        .setColor(resolveHelpEmbedColor(context))
        .setTitle(`Subcommands: ${prefixBase}${commandName}`)
        .setDescription(lines.join("\n"));
    }
  }

  const seen = new Set();
  const slashCommands = [];
  for (const cmd of Array.from(context?.client?.commands?.values?.() || [])) {
    if (!shouldIncludeSlashCommandInHelp(cmd)) continue;
    const dataJson = (cmd as any)?._helpDataJson || (cmd as any)?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const type = dataJson.type || ApplicationCommandType.ChatInput;
    if (type !== ApplicationCommandType.ChatInput) continue;
    const key = `${dataJson.name}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slashCommands.push({ cmd, dataJson });
  }
  const slashHit = slashCommands.find(({ dataJson }) => String(dataJson?.name || "").trim().toLowerCase() === queryToken,);
  if (slashHit) {
    const commandName = String(slashHit.dataJson.name || "").trim().toLowerCase();
    const options = Array.isArray(slashHit.dataJson.options) ? slashHit.dataJson.options : [];
    const subLines = [];
    for (const opt of options) {
      if (opt?.type === 1 && opt?.name) {
        const invoke = `/${commandName} ${opt.name}`;
        const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
        const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
        subLines.push(
          `- \`${invoke}\` - ${normalizeDescription(opt.description, "Nessuna descrizione.")}${lock}`,
        );
      }
      if (opt?.type === 2 && Array.isArray(opt.options)) {
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const invoke = `/${commandName} ${opt.name} ${sub.name}`;
          const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
          const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
          subLines.push(
            `- \`${invoke}\` - ${normalizeDescription(sub.description, "Nessuna descrizione.")}${lock}`,
          );
        }
      }
    }
    if (subLines.length) {
      return new EmbedBuilder()
        .setColor(resolveHelpEmbedColor(context))
        .setTitle(`Subcommands: /${commandName}`)
        .setDescription(subLines.join("\n"));
    }
  }

  return null;
}

function buildMiniHelpEmbed(query?, entries?, context: Record<string, any> = {}) {
  const detailed = buildDetailedHelpEmbed(query, entries, context);
  if (detailed) return detailed;

  const normalizedQuery = normalizeInvokeLookup(query);
  const matches = entries.filter((entry?) => {
    const invoke = normalizeInvokeLookup(entry.invoke); if (!invoke) return false; const commandToken = invoke.split(" ")[0] || ""; const baseMatch = invoke === normalizedQuery || invoke.startsWith(`${normalizedQuery}`) ||
      commandToken === normalizedQuery;
    if (baseMatch) return true;
    if (entry.type !== "prefix" || !Array.isArray(entry.aliases)) return false;
    return entry.aliases.some(
      (alias?) => String(alias || "").toLowerCase() === normalizedQuery,
    );
  });

  if (!matches.length) {
    const fallback = buildSubcommandFallbackEmbed(query, entries, context);
    if (fallback) return fallback;
    return buildMiniHelpNotFoundEmbed(query);
  }

  const limited = matches.slice(0, 20);
  const newUntilMap = context.newUntilMap || null;
  const lines = limited.map((entry?) => {
    const categoryKey = String(entry.category || "").toLowerCase(); const categoryLabel = CATEGORY_LABELS[categoryKey] || categoryKey || "Misc"; const invokeNorm = normalizeInvokeLookup(entry.invoke); const prefixForAlias = entry.prefixBase != null ? String(entry.prefixBase) : "+"; let aliasList = Array.isArray(entry.aliases) && entry.aliases.length ? entry.aliases.map((a?) => String(a || "").trim()).filter((a?) => a && normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, "")) !== invokeNorm) : []; const isTicketCommand = invokeNorm.startsWith("ticket") || String(entry.invoke || "").toLowerCase().startsWith("+ticket"); if (isTicketCommand && Array.isArray(entry.subAliases) && entry.subAliases.length) { const existingNorm = new Set(aliasList.map((a?) => normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, "")))); for (const a of entry.subAliases) { const s = String(a || "").trim(); if (!s) continue; const norm = normalizeInvokeLookup(prefixForAlias + s.replace(/^[/+]+/, "")); if (norm !== invokeNorm && !existingNorm.has(norm)) { existingNorm.add(norm); aliasList.push(s); } } } const aliasPart = aliasList.length ? " | " + aliasList.map((a?) => "`" + (a.startsWith("+") || a.startsWith("/") ? a : prefixForAlias + a) + "`").join(", ") : ""; const onlyMemberRole = Array.isArray(entry.roles) && entry.roles.length === 1 && String(entry.roles[0]) === String(IDs.roles.Member); const roleHint = Array.isArray(entry.roles) && entry.roles.length > 0 && !onlyMemberRole ? `\n  \`Ruolo:\` ${entry.roles.map((id?) => `<@&${id}>`).join(", ")}` : ""; const newBadge = isNewHelpEntry(entry, newUntilMap) ? ` ${HELP_NEW_EMOJI}` : ""; return `- \`${entry.invoke}\`${aliasPart} - ${entry.description}${newBadge}\n\`Categoria:\` ${categoryLabel}${roleHint}`;
  });
  const extra = matches.length > limited.length ? `\n\n...e altri**${matches.length - limited.length}**risultati.`
    : "";

  return new EmbedBuilder()
    .setColor(resolveHelpEmbedColor(context))
    .setTitle(`Mini Help: ${query}`.replace(/^(Mini Help:)(\S)/, "$1 $2"))
    .setDescription(`${lines.join("\n")}${extra}`);
}

/** Catalog for site wiki — same entries/filter as +help for the given Discord roles. */
function buildWikiHelpCatalog(client?, roleIds = []) {
  const permissions = loadPermissions();
  const allEntries = buildEntries(client, permissions);
  const memberRoles = new Set(
    (Array.isArray(roleIds) ? roleIds : [])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId && !memberRoles.has(memberRoleId)) memberRoles.add(memberRoleId);

  const visible = allEntries.filter((entry?) => canMemberSeeEntry(entry, memberRoles));
  const byCat = new Map();
  for (const entry of visible) {
    const key = String(entry?.category || "misc").toLowerCase();
    if (!key || key === "misc") continue;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(entry);
  }

  const categories = [];
  const pushCat = (key?) => {
    const list = byCat.get(key);
    if (!list || !list.length) return;
    list.sort((a?, b?) => String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"));
    const title = CATEGORY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
    categories.push({
      id: key,
      title,
      commands: list.map((entry?) => {
        const invoke = String(entry.invoke || "").trim();
        const description = String(entry.description || "").trim() || "Nessuna descrizione disponibile.";
        const aliases = Array.isArray(entry.aliases)
          ? entry.aliases.map((a?) => String(a || "").trim()).filter(Boolean)
          : [];
        const prefixBase = entry.prefixBase != null ? String(entry.prefixBase) : "+";
        const aliasDisplay = aliases.map((a?) =>
          a.startsWith("+") || a.startsWith("/") ? a : `${prefixBase}${a}`,
        );
        const roles = Array.isArray(entry.roles) ? entry.roles.map(String) : [];
        return {
          invoke,
          type: String(entry.type || "prefix"),
          description,
          aliases: aliasDisplay,
          roles,
          rolesCsv: roles.join(","),
          usage: invoke,
          example: invoke,
          blurb: description.length > 160 ? `${description.slice(0, 159).trim()}…` : description,
          search: `${invoke} ${description} ${title} ${aliasDisplay.join(" ")}`.toLowerCase(),
          categoryTitle: title,
        };
      }),
    });
    byCat.delete(key);
  };

  for (const key of CATEGORY_ORDER) pushCat(key);
  for (const key of Array.from(byCat.keys()).sort((a?, b?) => a.localeCompare(b, "it"))) {
    pushCat(key);
  }

  return {
    categories,
    commandCount: categories.reduce((n?, c?) => n + (c.commands?.length || 0), 0),
    economyVisible: isEconomyCommandsVisible(client),
  };
}

export = {
  name: "help",
  allowEmptyArgs: true,
  description: "Apre la guida ai comandi disponibili su questo server.",
  usage: "+help [comando]",
  examples: ["+help", "+help setup", "+help points"],
  parseMainHelpCustomId,
  handleMainHelpNavInteraction,
  buildEntries,
  canMemberSeeEntry,
  loadPermissions,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  buildWikiHelpCatalog,
  async execute(message?, args?, client?) {
    if (!message.guild || !message.member) return;
    if (!isViniliFullFeatureGuild(message.guild.id)) {
      return executeTenantHelp(message, args);
    }
    await message.channel.sendTyping().catch(() => { });
    const permissions = loadPermissions();
    const allEntries = buildEntries(client, permissions, { userId: message.author.id });
    const newUntilMap = await ensureHelpNewUntilForEntries(allEntries, await loadHelpNewUntilMap());
    const freshMember = await withHelpTimeout(
      getGuildMemberCached(message.guild, message.author.id, { ttlMs: 20_000, preferFresh: true, }),
      null,
      "getGuildMemberCached",
      HELP_MEMBER_TIMEOUT_MS,
    );
    const resolvedMember = freshMember || message.member;
    const memberRoles = resolvedMember?.roles?.cache || new Map();
    const rolePages = PAGE_ROLE_IDS.filter((roleId?) => memberRoles?.has(roleId),);
    const hasPartnerManager = Boolean(memberRoles?.has?.(IDs.roles.PartnerManager),);
    const hasHighStaff = Boolean(memberRoles?.has?.(IDs.roles.HighStaff));
    const hasFounder = Boolean(memberRoles?.has?.(IDs.roles.Founder));
    if (
      !rolePages.includes(IDs.roles.Staff) &&
      (hasPartnerManager || hasHighStaff || hasFounder)
    ) {
      rolePages.push(IDs.roles.Staff);
    }
    const channelId = String(message.channel?.id || "");
    const memberVisibleEntries = allEntries.filter((entry?) => canMemberSeeEntry(entry, memberRoles));
    const channelScopedEntries = filterEntriesByHelpChannel(memberVisibleEntries, channelId, memberRoles);
    const visibleEntriesForQuery = dedupeAndSortEntries(channelScopedEntries);

    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    if (query.length) {
      const embed = buildMiniHelpEmbed(query, visibleEntriesForQuery, {
        client,
        permissions,
        guildId: message.guild.id,
      });
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }

    const sortedVisible = dedupeAndSortEntries(channelScopedEntries);
    const chunks = mergeAdjacentHelpChunks(
      chunkEntriesByCategory(sortedVisible, HELP_PAGE_SIZE),
      HELP_PAGE_SIZE,
    );
    const groupedPages = chunks.map((items?, idx?) => ({ roleId: "all", items, indexLabel: "", groupLabel: PAGE_TITLES.all || "Comandi Disponibili", }));
    const displayPages = expandHelpDisplayPages(groupedPages, newUntilMap);

    if (!displayPages.length) {
      return safeMessageReply(message, {
        embeds: [buildNoAvailableCommandsEmbed()],
        allowedMentions: NO_REPLY_MENTIONS,
      });
    }

    const channelIdForNav = String(message.channel?.id || "");
    const navState = {
      currentIndex: 0,
      total: displayPages.length,
      ownerId: message.author.id,
      channelId: channelIdForNav,
      guildId: message.guild.id,
    };

    await safeMessageReply(message, {
      components: [buildHelpV2Container(displayPages[0], navState, message.guild.id)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: NO_REPLY_MENTIONS,
    });
  },
};