/** Vocali pubbliche: quali canali sono hub (giochi, duo, pubblici) e nomi dei canali creati. */
const { ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");

const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const DIGIT_FROM_SUPERSCRIPT = Object.fromEntries(Object.entries(SUPERSCRIPT_MAP).map(([d, s]) => [s, d]));
const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const MIN_SUFFIX_DIGITS = 2;

function getGameVoiceHubCategoryId(client = null) {
  const fromConfig = String(client?.config?.gameVoiceHubs?.categoryId || "").trim();
  if (fromConfig) return fromConfig;
  return String(IDs.categories?.categoryLimitate || "1519315215102120147").trim();
}

function isGameVoiceHubsEnabled(client?) {
  return client?.config?.gameVoiceHubs?.enabled !== false;
}

function isGameVoiceHubChannel(channel?, client = null) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  if (client && !isGameVoiceHubsEnabled(client)) return false;
  const cat = getGameVoiceHubCategoryId(client);
  if (!cat || String(channel.parentId || "") !== cat) return false;
  // Hub = canale senza suffisso superscript; gli spawn hanno ⁰¹/⁰²/…
  return parseVoiceSuffixIndex(channel.name) === 0;
}

function discoverGameHubChannelIds(guild?, client = null) {
  if (!isGameVoiceHubsEnabled(client)) return [];
  const cat = getGameVoiceHubCategoryId(client);
  if (!cat || !guild?.channels?.cache) return [];
  return [...guild.channels.cache.values()]
    .filter((ch?) => isGameVoiceHubChannel(ch, client))
    .map((ch?) => String(ch.id));
}

function getConfiguredGameHubChannelIds(client?) {
  const fromConfig = client?.config?.gameVoiceHubs?.channelIds;
  if (!Array.isArray(fromConfig) || !fromConfig.length) return [];
  return fromConfig.map((id?) => String(id || "").trim()).filter(Boolean);
}

function getDuoHubChannelIds(client?) {
  const fromConfig = client?.config?.publicVoiceHubs?.channelIds;
  if (Array.isArray(fromConfig) && fromConfig.length) {
    return fromConfig.map((id?) => String(id || "").trim()).filter(Boolean);
  }
  const fromIds = Array.isArray(IDs.publicVoiceHubChannelIds) ? IDs.publicVoiceHubChannelIds : [];
  return fromIds.map((id?) => String(id || "").trim()).filter(Boolean);
}

function getHubChannelIds(client?, guild = null) {
  const duo = getDuoHubChannelIds(client);
  if (!isGameVoiceHubsEnabled(client)) return duo;
  const g =
    guild ||
    client?.guilds?.cache?.get(String(IDs.guilds?.main || "")) ||
    null;
  const configured = getConfiguredGameHubChannelIds(client);
  const discovered = discoverGameHubChannelIds(g, client);
  return [...new Set([...duo, ...configured, ...discovered])];
}

/** Categoria spawn: gaming hub → categoryLimitate; duo/trio → publics. */
function getPublicVoiceHubCategoryId(client?, hubChannel = null) {
  if (hubChannel && isGameVoiceHubChannel(hubChannel, client)) {
    return getGameVoiceHubCategoryId(client);
  }
  const gameCat = getGameVoiceHubCategoryId(client);
  if (hubChannel?.parentId && gameCat && String(hubChannel.parentId) === gameCat) {
    return gameCat;
  }
  const fromConfig = String(
    client?.config?.publicVoiceHubs?.categoryId
      || client?.config?.publicVoiceHubs?.spawnCategoryId
      || "",
  ).trim();
  if (fromConfig) return fromConfig;
  const fromIds = String(IDs.categories?.categoryPublics || "").trim();
  if (fromIds) return fromIds;
  return String(hubChannel?.parentId || "").trim();
}

function isPublicVoiceHubId(channelId?, client?, guild = null) {
  const id = String(channelId || "").trim();
  if (!id) return false;
  if (getHubChannelIds(client, guild).includes(id)) return true;
  const g =
    guild ||
    client?.guilds?.cache?.get(String(IDs.guilds?.main || "")) ||
    null;
  const ch = g?.channels?.cache?.get(id);
  if (isGameVoiceHubChannel(ch, client)) return true;
  /* hubSpawnUnderHub3: lobby "crea una …" = hub anche se ID non in lista */
  if (
    ch?.type === ChannelType.GuildVoice &&
    /crea\s+un[a']?\s+/i.test(String(ch.name || "")) &&
    voiceHubGroupKeyFromName(ch.name)
  ) {
    return true;
  }
  return false;
}

function stripVoiceSuffix(name?) {
  return String(name || "").replace(INDEX_SUFFIX_RE, "").trimEnd();
}

function parseVoiceSuffixIndex(name?) {
  const match = String(name || "").match(INDEX_SUFFIX_RE);
  if (!match) return 0;
  const digits = [...match[0]].map((ch?) => DIGIT_FROM_SUPERSCRIPT[ch] ?? "").join("");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function toSuperscriptNumber(value?, minDigits = MIN_SUFFIX_DIGITS) {
  const normalized = Math.max(1, Number(value) || 1).toString().padStart(minDigits, "0");
  return normalized.split("").map((digit?) => SUPERSCRIPT_MAP[digit] || digit).join("");
}

const HUB_GROUP_LABELS = {
  duo: "Duo",
  trio: "Trio",
  quad: "Quad",
  penta: "Penta",
  hexa: "Hexa",
  setta: "Setta",
  octa: "Octa",
  lounge: "Lounge",
  squad: "Squad",
};

/** Hub per cui non si spawnano stanze (lobby resta, create disattivata). */
const DEFAULT_DISABLED_CREATE_GROUPS = new Set(["penta", "hexa", "setta", "octa"]);

function getDisabledCreateGroups(client?) {
  const fromConfig = client?.config?.publicVoiceHubs?.disabledCreateGroups;
  if (Array.isArray(fromConfig)) {
    return new Set(
      fromConfig.map((g?) => String(g || "").trim().toLowerCase()).filter(Boolean),
    );
  }
  return DEFAULT_DISABLED_CREATE_GROUPS;
}

function isHubCreateDisabledForChannel(channel?, client?) {
  const key = resolveHubGroupKey(channel, client);
  // Solo duo/trio/… classici; gli hub gaming non sono in disabledCreateGroups.
  if (!key || key.startsWith("game:")) return false;
  return getDisabledCreateGroups(client).has(key);
}

const HUB_CHANNEL_GROUP_KEYS = Object.fromEntries(
  [
    [String(IDs.channels?.vocaleDuo1 || "").trim(), "duo"],
    [String(IDs.channels?.vocaleTrio1 || "").trim(), "trio"],
    /* vocaleQuad1 e vocaleSquad1 possono coincidere: il canale live è "squad" */
    [String(IDs.channels?.vocaleSquad1 || IDs.channels?.vocaleQuad1 || "").trim(), "squad"],
    [String(IDs.channels?.vocaleQuad1 || "").trim(), "squad"],
    [String(IDs.channels?.vocalePenta1 || "").trim(), "penta"],
    [String(IDs.channels?.vocaleHexa1 || "").trim(), "hexa"],
    [String(IDs.channels?.vocaleSetta1 || "").trim(), "setta"],
    [String(IDs.channels?.vocaleOcta1 || "").trim(), "octa"],
  ].filter(([id]) => id),
);

const HUB_LOBBY_CREATE_PHRASE_RE = /\bcrea\s+un[a']?\s+/gi;

function stripHubLobbyCreatePhrase(name?) {
  return String(name || "")
    .replace(HUB_LOBBY_CREATE_PHRASE_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function voiceHubGroupKeyFromName(name?) {
  const raw = String(name || "");
  if (/\bduo\b/i.test(raw)) return "duo";
  if (/\btrio\b/i.test(raw)) return "trio";
  if (/\bsquad\b/i.test(raw)) return "squad";
  if (/\bquad\b/i.test(raw)) return "quad";
  if (/\bpenta\b/i.test(raw)) return "penta";
  if (/\bhexa\b/i.test(raw)) return "hexa";
  if (/\bsetta\b/i.test(raw)) return "setta";
  if (/\bocta\b/i.test(raw)) return "octa";
  if (/\blounge\b/i.test(raw)) return "lounge";
  return "";
}

function voiceHubGroupKey(name?, channelId?) {
  /* Preferisci il nome: evita mismatch tipo ID "quad" su canale "crea una squad". */
  const fromName = voiceHubGroupKeyFromName(name);
  if (fromName) return fromName;
  return HUB_CHANNEL_GROUP_KEYS[String(channelId || "").trim()] || "";
}

function resolveHubGroupKey(channel?, client = null) {
  if (!channel) return "";
  const classic = voiceHubGroupKey(channel.name, channel.id);
  if (classic) return classic;
  // Gaming: numerazione per gioco (stesso base name hub/spawn nella categoryLimitate).
  const gameCat = getGameVoiceHubCategoryId(client);
  if (gameCat && String(channel.parentId || "") === gameCat) {
    const base = stripVoiceSuffix(channel.name);
    if (base) return `game:${base}`;
  }
  return "";
}

function resolveHubSpawnBaseName(hubChannel?) {
  const stripped = stripVoiceSuffix(hubChannel?.name || "");
  const withoutPhrase = stripHubLobbyCreatePhrase(stripped);
  if (withoutPhrase) return withoutPhrase;
  const fromIdKey = HUB_CHANNEL_GROUP_KEYS[String(hubChannel?.id || "").trim()];
  if (fromIdKey && HUB_GROUP_LABELS[fromIdKey]) return HUB_GROUP_LABELS[fromIdKey];
  return stripped;
}

function isHubGroupSpawnChannel(channel?, hubChannel?, client?) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  if (isPublicVoiceHubId(channel.id, client, channel.guild)) return false;
  const hubKey = resolveHubGroupKey(hubChannel, client);
  if (!hubKey || resolveHubGroupKey(channel, client) !== hubKey) return false;
  return parseVoiceSuffixIndex(channel.name) > 0;
}

async function botCanManageVoiceHubs(guild?) {
  if (!guild) return false;
  let me = guild.members?.me;
  if (!me && typeof guild.members?.fetchMe === "function") {
    me = await guild.members.fetchMe().catch(() => null);
  }
  if (!me) return false;
  try {
    return me.permissions.has(PermissionsBitField.Flags.ManageChannels | PermissionsBitField.Flags.MoveMembers);
  } catch {
    return false;
  }
}

export = { INDEX_SUFFIX_RE, MIN_SUFFIX_DIGITS, getGameVoiceHubCategoryId, isGameVoiceHubsEnabled, isGameVoiceHubChannel, getHubChannelIds, getPublicVoiceHubCategoryId, isPublicVoiceHubId, stripVoiceSuffix, parseVoiceSuffixIndex, toSuperscriptNumber, isHubCreateDisabledForChannel, voiceHubGroupKeyFromName, resolveHubGroupKey, resolveHubSpawnBaseName, isHubGroupSpawnChannel, botCanManageVoiceHubs };
