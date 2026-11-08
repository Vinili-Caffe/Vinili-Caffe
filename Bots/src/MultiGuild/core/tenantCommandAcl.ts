const path = require("path") as typeof import("path");
const fs = require("fs") as typeof import("fs");
const {
  MUSIC_PREFIX_COMMANDS,
  TTS_PREFIX_COMMANDS,
  UTILITY_PREFIX_COMMANDS,
  TENANT_ALWAYS_PREFIX_COMMANDS,
  MINIGAMES_PREFIX_COMMANDS,
  PARTNERSHIP_PREFIX_COMMANDS,
  MODERATION_PREFIX_COMMANDS,
  resolveTenantPrefixFeatureCategory,
} = require("./openMediaCommands") as typeof import("./openMediaCommands");
const { mapCategoryToFeature } = require("./accessPolicy") as typeof import("./accessPolicy");
const { resolveGuildAccess, readRegistryFile } = require("./guildRegistry") as typeof import("./guildRegistry");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");
const { isMultiGuildLayerEnabled } = require("./env") as typeof import("./env");
const { GLOBAL_TENANT_COMMAND_NAMES } = require("../../shared/discord/applicationCommandDeployScopes") as typeof import("../../shared/discord/applicationCommandDeployScopes");
const {
  resolvePrefixCommandDescription,
  resolveApplicationCommandDescription,
} = require("./prefixCommandDescriptions") as typeof import("./prefixCommandDescriptions");

const CATEGORY_META = {
  utility: { label: "Utility", order: 10 },
  music: { label: "Musica", order: 20 },
  tts: { label: "TTS", order: 30 },
  minigames: { label: "Minigames", order: 40 },
  moderation: { label: "Moderazione", order: 50 },
  partnership: { label: "Partnership", order: 60 },
  level: { label: "Level", order: 70 },
  stats: { label: "Stats", order: 80 },
  economy: { label: "Economy", order: 90 },
  staff: { label: "Staff", order: 100 },
  admin: { label: "Admin", order: 110 },
  community: { label: "Community", order: 120 },
  security: { label: "Security", order: 130 },
  ticket: { label: "Ticket", order: 140 },
  dev: { label: "Dev", order: 150 },
};

const PREFIX_TYPE_LABEL = "Prefix";

const TENANT_SLASH_COMMAND_DEFS = Object.freeze([
  {
    name: "partnership",
    displayName: "/partnership",
    type: "chat",
    discordType: 1,
    feature: "partnership",
    description: "Apre il flusso per inviare una partnership.",
    usage: "/partnership [manager]",
    examples: ["/partnership", "/partnership @manager"],
  },
  {
    name: "Partner messaggio",
    displayName: "Partner messaggio",
    type: "message",
    discordType: 3,
    feature: "partnership",
    description: "Menu contesto messaggio: invia una partnership dal messaggio selezionato.",
    usage: "Clic destro su un messaggio → App → Partner messaggio",
    examples: [],
  },
]);

const SLASH_TYPE_LABELS = Object.freeze({
  chat: "Slash",
  message: "Contesto messaggio",
  user: "Contesto utente",
});

const MODE_INCLUDE = "include";
const MODE_EXCLUDE = "exclude";

const GALEONI_ECONOMY_PREFIX_COMMANDS = new Set([
  "bal",
  "work",
  "daily",
  "weekly",
  "monthly",
  "rob",
  "pay",
  "shop",
  "roulette",
  "slots",
  "blackjack",
  "rps",
  "scratch",
  "coinflip",
  "tris",
  "duel",
]);

function isGaleoniEconomyPrefixCommand(commandName?) {
  return GALEONI_ECONOMY_PREFIX_COMMANDS.has(normalizeCommandName(commandName));
}

function shouldSkipAclForGaleoniEconomy(message?, commandName?) {
  if (!isGaleoniEconomyPrefixCommand(commandName)) return false;
  try {
    const { resolveEconomyMode } = require("../../Vinili/Community/services/activeEconomyService") as typeof import("../../Vinili/Community/services/activeEconomyService");
    return resolveEconomyMode(message?.client) === "galeoni";
  } catch (_) {
    return false;
  }
}

function normalizeCommandName(commandName?) {
  return String(commandName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeCommandAclKey(raw?) {
  const s = String(raw || "").trim();
  const m = /^s:([123]):(.+)$/i.exec(s);
  if (m) {
    const name = m[2].trim();
    if (!name || name.length > 64) return "";
    return `s:${m[1]}:${name}`;
  }
  return normalizeCommandName(s);
}

function isSlashCommandAclKey(raw?) {
  return /^s:[123]:.+/i.test(String(raw || "").trim());
}

function slashCatalogAclKey(def?) {
  const type = Number(def?.discordType) || (def?.type === "user" ? 2 : def?.type === "message" ? 3 : 1);
  const name = String(def?.name || "").trim();
  if (!name) return "";
  return `s:${type}:${name}`;
}

function normalizeMode(raw?) {
  const m = String(raw || "")
    .trim()
    .toLowerCase();
  if (m === "include" || m === "i" || m === "allow" || m === "only") return MODE_INCLUDE;
  if (m === "exclude" || m === "e" || m === "deny" || m === "block") return MODE_EXCLUDE;
  return null;
}

function normalizeIdList(raw?) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!/^\d{16,22}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function emptyAcl() {
  return {
    enabled: true,
    roleMode: null,
    roleIds: [],
    channelMode: null,
    channelIds: [],
  };
}

function decodeCommandAclEntry(raw?) {
  if (!raw || typeof raw !== "object") return emptyAcl();
  const roleMode = normalizeMode(raw.rm ?? raw.roleMode);
  const channelMode = normalizeMode(raw.cm ?? raw.channelMode);
  const roleIds = normalizeIdList(raw.r ?? raw.roleIds);
  const channelIds = normalizeIdList(raw.c ?? raw.channelIds);
  const enabled = !(raw.off === true || raw.off === 1 || raw.enabled === false);
  return {
    enabled,
    roleMode: roleMode || null,
    roleIds,
    channelMode: channelMode || null,
    channelIds,
  };
}

function isAclEmpty(acl?) {
  if (!acl) return true;
  if (acl.enabled === false) return false;
  const hasRoles = Boolean(acl.roleMode && Array.isArray(acl.roleIds) && acl.roleIds.length);
  const hasChannels = Boolean(acl.channelMode && Array.isArray(acl.channelIds) && acl.channelIds.length);
  return !hasRoles && !hasChannels;
}

function cloneCommandAcl(acl?) {
  if (!acl || typeof acl !== "object") return emptyAcl();
  return {
    enabled: acl.enabled !== false,
    roleMode: acl.roleMode || null,
    roleIds: Array.isArray(acl.roleIds) ? acl.roleIds.map((x?) => String(x)) : [],
    channelMode: acl.channelMode || null,
    channelIds: Array.isArray(acl.channelIds) ? acl.channelIds.map((x?) => String(x)) : [],
  };
}

function partnershipSlashAclKey() {
  return "s:1:partnership";
}

const VINILI_SKIP_PARTNERSHIP_ACL_INHERIT = new Set([
  "profile",
  "help",
  "user",
  "server",
]);

function shouldSkipPartnershipAclInherit(commandName?, guildId = null) {
  const cmd = normalizeCommandName(commandName);
  if (!cmd || !VINILI_SKIP_PARTNERSHIP_ACL_INHERIT.has(cmd)) return false;
  const gid = String(guildId || "").trim();
  if (!gid) return true;
  try {
    const { isViniliFullFeatureGuild } = require("./guildFeatureScope") as typeof import("./guildFeatureScope");
    if (isViniliFullFeatureGuild(gid)) return true;
  } catch (_) {}
  return isViniliProtectedGuild(gid);
}

function resolveInheritedCommandAcl(aclMap?, commandName?, guildId = null) {
  const cmd = normalizeCommandName(commandName);
  if (!cmd || isSlashCommandAclKey(cmd)) return null;
  if (!PARTNERSHIP_PREFIX_COMMANDS.has(cmd)) return null;
  if (shouldSkipPartnershipAclInherit(cmd, guildId)) return null;
  const map = aclMap && typeof aclMap === "object" ? aclMap : {};
  const direct = map[cmd];
  if (direct && !isAclEmpty(direct)) return null;
  const source = map[partnershipSlashAclKey()];
  if (!source || isAclEmpty(source)) return null;
  return cloneCommandAcl(source);
}

function applyPartnershipPrefixInheritance(commands?, guildId = null) {
  const out = commands && typeof commands === "object" ? { ...commands } : {};
  const source = out[partnershipSlashAclKey()];
  if (!source || isAclEmpty(source)) return out;
  for (const name of PARTNERSHIP_PREFIX_COMMANDS) {
    if (shouldSkipPartnershipAclInherit(name, guildId)) continue;
    const direct = out[name];
    if (direct && !isAclEmpty(direct)) continue;
    out[name] = { ...cloneCommandAcl(source), inheritedFromSlash: true };
  }
  return out;
}

function encodeCommandAclEntry(input?) {
  const enabled = input?.enabled !== false;
  const roleMode = normalizeMode(input?.roleMode);
  const channelMode = normalizeMode(input?.channelMode);
  let roleIds = normalizeIdList(input?.roleIds);
  let channelIds = normalizeIdList(input?.channelIds);
  if (!roleMode) roleIds = [];
  if (!channelMode) channelIds = [];
  const out: Record<string, any> = {};
  if (!enabled) out.off = 1;
  if (roleMode && roleIds.length) {
    out.rm = roleMode === MODE_INCLUDE ? "i" : "e";
    out.r = roleIds;
  }
  if (channelMode && channelIds.length) {
    out.cm = channelMode === MODE_INCLUDE ? "i" : "e";
    out.c = channelIds;
  }
  return Object.keys(out).length ? out : null;
}

function decodeCommandsMap(raw?) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = normalizeCommandAclKey(key);
    if (!name) continue;
    const acl = decodeCommandAclEntry(value);
    if (isAclEmpty(acl)) continue;
    out[name] = acl;
  }
  return out;
}

function categoryCommandsSeed() {
  return {
    utility: [...UTILITY_PREFIX_COMMANDS],
    music: [...MUSIC_PREFIX_COMMANDS],
    tts: [...TTS_PREFIX_COMMANDS],
    minigames: [...MINIGAMES_PREFIX_COMMANDS],
    moderation: [...MODERATION_PREFIX_COMMANDS],
    partnership: [...PARTNERSHIP_PREFIX_COMMANDS],
  };
}

let prefixMetaCache = null;
let prefixAliasNamesCache = null;
let slashMetaCache = null;

function folderToCategoryId(folderName?) {
  const raw = String(folderName || "")
    .trim()
    .toLowerCase();
  if (!raw) return "utility";
  if (raw === "staff" || raw === "partner") return "staff";
  if (raw === "admin" || raw === "administration") return "admin";
  if (raw === "dev" || raw === "developer") return "dev";
  if (raw === "community") return "community";
  if (CATEGORY_META[raw]) return raw;
    return raw;
}

/*
 * Catalogo comandi della dashboard: si legge da quello che il bot ha caricato davvero (client.pcommands /
 * client.commands). Le vecchie cartelle Vinili/Prefix e Commands non esistono più dopo la riorganizzazione
 * (i comandi ora stanno in tante cartelle "discord/prefix" e "discord/slash") e il catalogo risultava vuoto.
 */
let catalogClient = null;

function setCommandCatalogClient(client?) {
  if (!client || client === catalogClient) return;
  catalogClient = client;
  prefixMetaCache = null;
  prefixAliasNamesCache = null;
  slashMetaCache = null;
}

const COMMAND_FILE_RE = /\.(cjs|mjs|js|cts|mts|ts)$/i;

function listPrefixCommandSources() {
  const out: { mod: any; file: string; category: string }[] = [];
  const reg = catalogClient?.pcommands;
  if (reg && typeof reg.values === "function" && reg.size > 0) {
    for (const mod of reg.values()) {
      if (!mod?.name) continue;
      out.push({ mod, file: `${String(mod.name)}.ts`, category: folderToCategoryId(mod.folder) });
    }
    return out;
  }
  const root = path.resolve(__dirname, "../../Vinili/Prefix");
  if (!fs.existsSync(root)) return out;
  for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const category = folderToCategoryId(folder.name);
    const dir = path.join(root, folder.name);
    for (const file of fs.readdirSync(dir)) {
      if (!COMMAND_FILE_RE.test(file) || file.endsWith(".d.ts")) continue;
      try {
        out.push({ mod: require(path.join(dir, file)), file, category });
      } catch (_) {}
    }
  }
  return out;
}

function listSlashCommandSources(roots?) {
  const out: { mod: any; category: string }[] = [];
  const reg = catalogClient?.commands;
  if (reg && typeof reg.values === "function" && reg.size > 0) {
    for (const mod of reg.values()) {
      if (mod?.data) out.push({ mod, category: folderToCategoryId(mod.category) });
    }
    return out;
  }
  for (const root of Array.isArray(roots) ? roots : []) {
    if (!fs.existsSync(root)) continue;
    for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const category = folderToCategoryId(folder.name);
      const dir = path.join(root, folder.name);
      for (const file of fs.readdirSync(dir)) {
        if (!COMMAND_FILE_RE.test(file) || file.endsWith(".d.ts")) continue;
        if (file.replace(COMMAND_FILE_RE, "").endsWith("Helpers")) continue;
        try {
          out.push({ mod: require(path.join(dir, file)), category });
        } catch (_) {}
      }
    }
  }
  return out;
}

function loadPrefixCommandMeta() {
  if (prefixMetaCache) return prefixMetaCache;
  const map: Record<string, any> = {};
  const aliasNames = new Set();
  try {
    for (const src of listPrefixCommandSources()) {
      const category = src.category;
      {
        const file = src.file;
        try {
          const mod = src.mod;
          if (mod?.skipLoad || mod?.skipPrefix) continue;
          const name = normalizeCommandName(mod?.name || path.basename(file).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, ""));
          if (!name) continue;
          if (
            name === "sezioneproibita" ||
            name === "libriproibiti" ||
            name === "forbiddenbooks"
          ) {
            continue;
          }
          const aliases = Array.isArray(mod?.aliases)
            ? mod.aliases.map((x?) => normalizeCommandName(x)).filter(Boolean)
            : [];
          for (const alias of aliases) {
            if (alias !== name) aliasNames.add(alias);
          }
          const examples = Array.isArray(mod?.examples)
            ? mod.examples.map((x?) => String(x || "").trim()).filter(Boolean).slice(0, 6)
            : [];
          const cooldownRaw = mod?.cooldown ?? mod?.cooldownSeconds ?? mod?.cooldownMs;
          let cooldownSeconds = null;
          if (typeof cooldownRaw === "number" && Number.isFinite(cooldownRaw) && cooldownRaw > 0) {
            cooldownSeconds = cooldownRaw >= 1000 ? Math.round(cooldownRaw / 1000) : Math.round(cooldownRaw);
          }
                    if (map[name]) continue;
          map[name] = {
            description: resolvePrefixCommandDescription(name, mod?.description),
            usage: String(mod?.usage || "").trim(),
            examples,
            aliases,
            cooldownSeconds,
            category,
          };
        } catch (_) {}
      }
    }
  } catch (_) {}
  /* vuoto = bot non ancora pronto: niente cache, si riprova alla prossima richiesta */
  if (Object.keys(map).length) {
    prefixMetaCache = map;
    prefixAliasNamesCache = aliasNames;
  } else {
    prefixAliasNamesCache = aliasNames;
  }
  return map;
}

function discordTypeToSlashKind(discordType?) {
  const t = Number(discordType) || 1;
  if (t === 2) return "user";
  if (t === 3) return "message";
  return "chat";
}

function getObsoleteSlashNameSet() {
  try {
    const { DEFAULT_OBSOLETE_SLASH_NAMES } = require("../../shared/discord/purgeObsoleteApplicationCommands") as typeof import("../../shared/discord/purgeObsoleteApplicationCommands");
    return new Set(
      (Array.isArray(DEFAULT_OBSOLETE_SLASH_NAMES) ? DEFAULT_OBSOLETE_SLASH_NAMES : []).map((n?) =>
        String(n || "")
          .trim()
          .toLowerCase(),
      ),
    );
  } catch (_) {
    return new Set(["music", "gringott", "squalifica", "dmbroadcast"]);
  }
}

function loadSlashCommandMeta() {
  if (slashMetaCache) return slashMetaCache;
  const items = [];
  const seen = new Set();
  const obsoleteNames = getObsoleteSlashNameSet();
  const roots = [
    path.resolve(__dirname, "../../Commands"),
    path.resolve(__dirname, "../Commands"),
  ];
  try {
    for (const src of listSlashCommandSources(roots)) {
      {
        const category = src.category;
        {
          try {
            const mod = src.mod;
            if (mod?.skipDeploy === true) continue;
            const data = mod?.data;
            if (!data || typeof data.toJSON !== "function") continue;
            const json = data.toJSON();
            const discordName = String(json?.name || "").trim();
            if (!discordName) continue;
            if (obsoleteNames.has(discordName.toLowerCase())) continue;
            const discordType = Number(json?.type) || 1;
            const type = discordTypeToSlashKind(discordType);
            const aclKey = `s:${discordType}:${discordName}`;
            if (seen.has(aclKey)) continue;
            seen.add(aclKey);
            let cat = category;
            const nameLc = discordName.toLowerCase();
            if (
              GLOBAL_TENANT_COMMAND_NAMES.has(nameLc) ||
              nameLc === "delete" ||
              /partnership/i.test(discordName)
            ) {
              cat = "partnership";
            }
            items.push({
              name: aclKey,
              displayName: discordType === 1 ? `/${discordName}` : discordName,
              category: cat,
              kind: "slash",
              type,
              discordType,
              discordName,
              typeLabel: SLASH_TYPE_LABELS[type] || SLASH_TYPE_LABELS.chat,
              description: resolveApplicationCommandDescription(discordName, json?.description),
              usage: discordType === 1 ? `/${discordName}` : "",
              examples: [],
              aliases: [],
              cooldownSeconds: null,
              syncsToDiscord: true,
            });
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
  items.sort((a?, b?) =>
    String(a.displayName || a.name).localeCompare(String(b.displayName || b.name), "it"),
  );
  if (items.length) slashMetaCache = items;
  return items;
}

function isDashboardFullCommandCatalogGuild(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  try {
    const { isViniliFullFeatureGuild } = require("./guildFeatureScope") as typeof import("./guildFeatureScope");
    if (isViniliFullFeatureGuild(gid)) return true;
  } catch (_) {}
  return isViniliProtectedGuild(gid);
}

function getPrefixAliasNames() {
  if (!prefixAliasNamesCache) loadPrefixCommandMeta();
  return prefixAliasNamesCache || new Set();
}

function resolveCatalogFeatures(guildId?) {
  const gid = String(guildId || "").trim();
  if (isDashboardFullCommandCatalogGuild(gid)) {
    const all: Record<string, any> = {};
    for (const key of Object.keys(CATEGORY_META)) {
      const featureKey = mapCategoryToFeature(key) || key;
      all[featureKey] = true;
    }
        for (const extra of [
      "ticket",
      "security",
      "community_automations",
      "website",
      "staff_tools",
      "partnership",
      "utility",
      "music",
      "tts",
      "minigames",
      "moderation",
      "level",
      "stats",
      "economy",
    ]) {
      all[extra] = true;
    }
    return all;
  }
  const access = gid ? resolveGuildAccess(gid) : null;
  if (access?.managed && access?.entry?.features && typeof access.entry.features === "object") {
    return access.entry.features;
  }
      try {
    const defaults = readRegistryFile()?.defaults?.features;
    if (defaults && typeof defaults === "object") return { ...defaults };
  } catch (_) {}
  return {};
}

function listTenantSlashCatalogItems(guildId?) {
  const gid = String(guildId || "").trim();
  if (isDashboardFullCommandCatalogGuild(gid)) {
    return loadSlashCommandMeta().map((item?) => ({ ...item }));
  }
  const features = resolveCatalogFeatures(gid);
  const allowedGlobal = GLOBAL_TENANT_COMMAND_NAMES || new Set();
  const items = [];

  for (const def of TENANT_SLASH_COMMAND_DEFS) {
    const globalKey = String(def.name || "")
      .trim()
      .toLowerCase();
    if (!globalKey || !allowedGlobal.has(globalKey)) continue;
    const featureKey = def.feature || null;
    if (featureKey && features[featureKey] !== true) continue;
    const aclKey = slashCatalogAclKey(def);
    if (!aclKey) continue;
    items.push({
      name: aclKey,
      displayName: def.displayName || def.name,
      category: featureKey || "partnership",
      kind: "slash",
      type: def.type || "chat",
      discordType: Number(def.discordType) || 1,
      discordName: def.name,
      typeLabel: SLASH_TYPE_LABELS[def.type] || SLASH_TYPE_LABELS.chat,
      description: resolveApplicationCommandDescription(def.name, def.description),
      usage: def.usage || "",
      examples: Array.isArray(def.examples) ? def.examples : [],
      aliases: [],
      cooldownSeconds: null,
      syncsToDiscord: true,
    });
  }

  items.sort((a?, b?) =>
    String(a.displayName || a.name).localeCompare(String(b.displayName || b.name), "it"),
  );
  return items;
}

function buildFullViniliCommandCatalog() {
  const metaMap = loadPrefixCommandMeta();
  const aliasNames = getPrefixAliasNames();
  const categories = [];
  const categoryIndex = new Map();

  function ensureCategory(category?) {
    if (categoryIndex.has(category)) return categoryIndex.get(category);
    const catMeta = CATEGORY_META[category] || { label: category, order: 500 };
    const row = {
      id: category,
      label: catMeta.label,
      order: catMeta.order,
      kind: "prefix",
      commands: [],
    };
    categoryIndex.set(category, row);
    categories.push(row);
    return row;
  }

  for (const [name, meta] of Object.entries(metaMap)) {
    if (!name || aliasNames.has(name)) continue;
    const category =
      resolveTenantPrefixFeatureCategory(name) ||
      String(meta.category || "utility").toLowerCase() ||
      "utility";
        const catId = PARTNERSHIP_PREFIX_COMMANDS.has(name) ? "partnership" : category;
    const row = ensureCategory(catId);
    row.commands.push({
      name,
      displayName: name,
      category: catId,
      kind: "prefix",
      typeLabel: PREFIX_TYPE_LABEL,
      description: resolvePrefixCommandDescription(name, meta.description),
      usage: meta.usage || "",
      examples: Array.isArray(meta.examples) ? meta.examples : [],
      aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
      cooldownSeconds: meta.cooldownSeconds || null,
      alwaysAvailable: true,
      syncsToDiscord: false,
    });
  }

  for (const slashItem of loadSlashCommandMeta()) {
    const row = ensureCategory(slashItem.category || "utility");
    row.commands.push({ ...slashItem });
  }

  for (const row of categories) {
    row.commands.sort((a?, b?) =>
      String(a.displayName || a.name).localeCompare(String(b.displayName || b.name), "it"),
    );
  }
  categories.sort((a?, b?) => a.order - b.order || a.label.localeCompare(b.label, "it"));
  return categories.filter((row?) => row.commands.length);
}

function buildTenantCommandCatalog(guildId?) {
  const gid = String(guildId || "").trim();
  if (isDashboardFullCommandCatalogGuild(gid)) {
    return buildFullViniliCommandCatalog();
  }
  const features = resolveCatalogFeatures(gid);
  const metaMap = loadPrefixCommandMeta();
  const aliasNames = getPrefixAliasNames();
  const seed = categoryCommandsSeed();
  const categories = [];
  const categoryIndex = new Map();

  function ensureCategory(category?) {
    if (categoryIndex.has(category)) return categoryIndex.get(category);
    const catMeta = CATEGORY_META[category] || { label: category, order: 500 };
    const row = {
      id: category,
      label: catMeta.label,
      order: catMeta.order,
      kind: "prefix",
      commands: [],
    };
    categoryIndex.set(category, row);
    categories.push(row);
    return row;
  }

  for (const [category, commands] of Object.entries(seed)) {
    const featureKey = mapCategoryToFeature(category);
    if (featureKey && features[featureKey] !== true) {
      if (category !== "utility") continue;
    }

    const items = [];
    const seen = new Set();
    for (const cmd of commands) {
      const name = normalizeCommandName(cmd);
      if (!name || seen.has(name)) continue;
      if (aliasNames.has(name)) continue;
      seen.add(name);
      if (featureKey && features[featureKey] !== true && !TENANT_ALWAYS_PREFIX_COMMANDS.has(name)) {
        continue;
      }
      const meta = metaMap[name] || {};
      items.push({
        name,
        displayName: name,
        category,
        kind: "prefix",
        typeLabel: PREFIX_TYPE_LABEL,
        description: resolvePrefixCommandDescription(name, meta.description),
        usage: meta.usage || "",
        examples: Array.isArray(meta.examples) ? meta.examples : [],
        aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
        cooldownSeconds: meta.cooldownSeconds || null,
        alwaysAvailable: TENANT_ALWAYS_PREFIX_COMMANDS.has(name),
        syncsToDiscord: false,
      });
    }
    if (!items.length) continue;
    items.sort((a?, b?) => a.name.localeCompare(b.name, "it"));
    const row = ensureCategory(category);
    row.commands.push(...items);
  }

  for (const slashItem of listTenantSlashCatalogItems(gid)) {
    const row = ensureCategory(slashItem.category || "partnership");
    row.commands.push(slashItem);
  }

  for (const row of categories) {
    row.commands.sort((a?, b?) =>
      String(a.displayName || a.name).localeCompare(String(b.displayName || b.name), "it"),
    );
  }

  categories.sort((a?, b?) => a.order - b.order || a.label.localeCompare(b.label, "it"));
  return categories;
}

function memberPassesRoleAcl(member?, acl?) {
  if (!acl?.roleMode || !Array.isArray(acl.roleIds) || !acl.roleIds.length) return true;
  if (!member?.roles?.cache) return false;
  const has = acl.roleIds.some((id?) => member.roles.cache.has(String(id)));
  if (acl.roleMode === MODE_INCLUDE) return has;
  if (acl.roleMode === MODE_EXCLUDE) return !has;
  return true;
}

function channelPassesChannelAcl(channel?, channelId?, acl?) {
  if (!acl?.channelMode || !Array.isArray(acl.channelIds) || !acl.channelIds.length) return true;
  const cid = String(channelId || channel?.id || "").trim();
  if (!cid) return false;
  const listed = acl.channelIds.includes(cid);
  const parentId = channel?.parentId ? String(channel.parentId) : "";
  const listedParent = parentId && acl.channelIds.includes(parentId);
  const hit = listed || listedParent;
  if (acl.channelMode === MODE_INCLUDE) return hit;
  if (acl.channelMode === MODE_EXCLUDE) return !hit;
  return true;
}

function peekDashboardCommandAcl(guildId?, commandName?) {
  if (!isMultiGuildLayerEnabled()) return null;
  const gid = String(guildId || "").trim();
  const cmd = normalizeCommandName(commandName);
  if (!gid || !cmd) return null;
  let aclMap: Record<string, any> = {};
  try {
    const { getTenantCommandAclMapSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
    aclMap = getTenantCommandAclMapSync(gid) || {};
  } catch (_) {
    return null;
  }
  let acl = aclMap[cmd];
  if (!acl || isAclEmpty(acl)) {
    const inherited = resolveInheritedCommandAcl(aclMap, cmd, gid);
    if (inherited) acl = inherited;
  }
  if (!acl || isAclEmpty(acl)) return null;
  return cloneCommandAcl(acl);
}

function dashboardChannelIncludeAllows(message?, commandName?) {
  if (!isMultiGuildLayerEnabled()) return false;
  const guildId = String(message?.guild?.id || "").trim();
  const cmd = normalizeCommandName(commandName);
  if (!guildId || !cmd) return false;
  const acl = peekDashboardCommandAcl(guildId, cmd);
  if (!acl || acl.enabled === false) return false;
  if (acl.channelMode !== MODE_INCLUDE) return false;
  return channelPassesChannelAcl(message?.channel, message?.channelId, acl);
}

function resolveTenantCommandAcl(message?, commandName?, options: Record<string, any> = {}) {
  if (!isMultiGuildLayerEnabled()) return null;
  const guildId = String(message?.guild?.id || "").trim();
  if (!guildId) return null;

  let fullFeature = false;
  try {
    const { isViniliFullFeatureGuild } = require("./guildFeatureScope") as typeof import("./guildFeatureScope");
    fullFeature = isViniliFullFeatureGuild(guildId);
  } catch (_) {}
  const protectedOrMain = isViniliProtectedGuild(guildId) || fullFeature;

  const cmd = normalizeCommandName(commandName);
  if (!cmd) return null;

      if (protectedOrMain && shouldSkipAclForGaleoniEconomy(message, cmd)) {
    return null;
  }

  const boardFeatureByCommand = {
    quote: "quote",
    myquote: "quote",
    repost: "repost",
    myrepost: "repost",
    clip: "clip",
    myclip: "clip",
  };
  const boardFeature = boardFeatureByCommand[cmd];
  if (boardFeature && !protectedOrMain) {
    try {
      const { isTenantBoardFeatureEnabledSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
      if (!isTenantBoardFeatureEnabledSync(guildId, boardFeature)) {
        if (options.returnDetails) {
          return {
            allowed: false,
            reason: "board_feature_disabled",
            requiredRoles: null,
            channels: null,
          };
        }
        return false;
      }
    } catch (_) {}
  }

  if (!protectedOrMain) {
    const access = resolveGuildAccess(guildId);
    if (!access?.managed) return null;
    const category = resolveTenantPrefixFeatureCategory(cmd);
    if (!category && !TENANT_ALWAYS_PREFIX_COMMANDS.has(cmd)) return null;
  }

  let aclMap: Record<string, any> = {};
  try {
    const { getTenantCommandAclMapSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
    aclMap = getTenantCommandAclMapSync(guildId) || {};
  } catch (_) {
    return null;
  }
  let acl = aclMap[cmd];
  if (!acl || isAclEmpty(acl)) {
    const inherited = resolveInheritedCommandAcl(aclMap, cmd, guildId);
    if (inherited) {
      acl = inherited;
    } else if (protectedOrMain) {
                        acl = null;
    }
  }
  if (!acl || isAclEmpty(acl)) return null;

  if (acl.enabled === false) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "tenant_command_disabled",
        requiredRoles: null,
        channels: null,
      };
    }
    return false;
  }

  const roleOk = memberPassesRoleAcl(message?.member, acl);
  if (!roleOk) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "tenant_command_role",
        requiredRoles: acl.roleMode === MODE_INCLUDE ? acl.roleIds : null,
        channels: null,
      };
    }
    return false;
  }

  const channelOk = channelPassesChannelAcl(message?.channel, message?.channelId, acl);
  if (!channelOk) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "tenant_command_channel",
        requiredRoles: null,
        channels: acl.channelMode === MODE_INCLUDE ? acl.channelIds : null,
      };
    }
    return false;
  }

  if (options.returnDetails) {
    return {
      allowed: true,
      reason: protectedOrMain ? "vinili_command_acl" : "tenant_command_acl",
      requiredRoles: null,
      channels: null,
    };
  }
  return true;
}

export = {
  setCommandCatalogClient,
  normalizeCommandName,
  normalizeCommandAclKey,
  isSlashCommandAclKey,
  normalizeMode,
  normalizeIdList,
  emptyAcl,
  encodeCommandAclEntry,
  isAclEmpty,
  cloneCommandAcl,
  applyPartnershipPrefixInheritance,
  partnershipSlashAclKey,
  decodeCommandsMap,
  buildTenantCommandCatalog,
  listTenantSlashCatalogItems,
  resolveTenantCommandAcl,
  peekDashboardCommandAcl,
  dashboardChannelIncludeAllows,
  memberPassesRoleAcl,
  channelPassesChannelAcl,
};
