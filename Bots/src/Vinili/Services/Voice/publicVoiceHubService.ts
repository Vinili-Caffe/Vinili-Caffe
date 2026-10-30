const { ChannelType, PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { queueCategoryRenumber } = require("../Community/communityOpsService") as typeof import("../Community/communityOpsService");
const { buildRecoveryVoiceState } = require("../../../shared/discord/voiceStateRecovery") as typeof import("../../../shared/discord/voiceStateRecovery");

const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const DIGIT_FROM_SUPERSCRIPT = Object.fromEntries(Object.entries(SUPERSCRIPT_MAP).map(([d, s]) => [s, d]));
const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const EMPTY_DELETE_DELAY_MS = 1500;
const MIN_SUFFIX_DIGITS = 2;
const HUB_LOBBY_SPEAK_FLAGS = [
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.UseVAD,
  PermissionsBitField.Flags.Stream,
  PermissionsBitField.Flags.UseEmbeddedActivities,
  PermissionsBitField.Flags.UseExternalApps,
];
const HUB_SPAWN_MEMBER_TEXT_FLAGS = [PermissionsBitField.Flags.SendMessages];

const userCreateLocks = new Set();
const hubCreateLocks = new Map();
const spawnedHubByChannel = new Map();
const emptyDeleteTimers = new Map();

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
/** Marker deploy: spawn SEMPRE sotto hub (voice-only reorder; text non interferisce). */
const HUB_SPAWN_STACK_MARKER = "hubSpawnUnderHub3";

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

function channelCategorySortPosition(ch?) {
  if (!ch) return -1;
  const raw = Number(ch.rawPosition);
  if (Number.isFinite(raw)) return raw;
  const pos = Number(ch.position);
  return Number.isFinite(pos) ? pos : -1;
}

function listCategoryChannelsSorted(guild?, parentId?) {
  return [...guild.channels.cache.values()]
    .filter((ch?) => String(ch.parentId || "") === String(parentId || ""))
    .sort((a?, b?) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));
}

/**
 * hubSpawnUnderHub3: ordine VOCE nella categoria (Discord UI ordina i vocali
 * tra loro; mischiare text+voice in setPositions lasciava gli spawn SOPRA gli hub).
 */
function listCategoryVoiceChannelsSorted(guild?, parentId?) {
  return [...guild.channels.cache.values()]
    .filter(
      (ch?) =>
        String(ch.parentId || "") === String(parentId || "") &&
        (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice),
    )
    .sort(
      (a?, b?) =>
        a.rawPosition - b.rawPosition || Number(BigInt(a.id) - BigInt(b.id)),
    );
}

/** Stesso gruppo di discord.js `_sortedChannels` per un vocale (parent + voice types). */
function listSortableVoiceSiblings(guild?, parentId?) {
  return [...guild.channels.cache.values()]
    .filter(
      (ch?) =>
        String(ch.parentId || "") === String(parentId || "") &&
        (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice),
    )
    .sort(
      (a?, b?) =>
        a.rawPosition - b.rawPosition || Number(BigInt(a.id) - BigInt(b.id)),
    );
}

/**
 * Indice per Channel#setPosition (discord.js: indice nel gruppo sortable, NON rawPosition).
 * rawPosition passato a setPosition mette lo spawn in cima / sopra l'hub.
 */
function resolveVoiceSetPositionIndex(siblings?, moveId?, afterId?) {
  const list = Array.isArray(siblings) ? siblings : [];
  const afterIdx = list.findIndex((ch?) => String(ch.id) === String(afterId));
  if (afterIdx < 0) return null;
  let targetIdx = afterIdx + 1;
  const moveIdx = list.findIndex((ch?) => String(ch.id) === String(moveId));
  if (moveIdx !== -1 && moveIdx < targetIdx) targetIdx -= 1;
  if (moveIdx === targetIdx) return null; // già a posto
  if (targetIdx < 0) targetIdx = 0;
  if (targetIdx >= list.length) targetIdx = Math.max(0, list.length - 1);
  return targetIdx;
}

/** Coda del gruppo hub (hub + spawn dello stesso tipo), come le stanze sotto l'hub. */
function resolveHubSpawnCreatePosition(guild?, hubChannel?, client?) {
  const hubKey = resolveHubGroupKey(hubChannel, client);
  if (!hubKey) return null;
  const group = listHubGroupChannels(guild, hubChannel, client);
  let tailPos = channelCategorySortPosition(hubChannel);
  for (const ch of group) {
    const pos = channelCategorySortPosition(ch);
    if (pos > tailPos) tailPos = pos;
  }
  /* rawPosition+1 → Channel Create / setPositions (API), non Channel#setPosition */
  return tailPos >= 0 ? tailPos + 1 : null;
}

async function applyHubSpawnCreatePosition(voiceChannel?, rawPosition?, reason?) {
  if (!voiceChannel || rawPosition === undefined || rawPosition === null) return;
  const target = Number(rawPosition);
  if (!Number.isFinite(target)) return;
  /* Preferisci setPositions (raw API). Channel#setPosition interpreta l'argomento come INDICE. */
  if (voiceChannel.guild?.channels?.setPositions) {
    const ok = await voiceChannel.guild.channels
      .setPositions([{ channel: voiceChannel.id, position: target }])
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] setPositions failed:", err?.message || err);
        return false;
      });
    if (ok) return;
  }
  const parentId = String(voiceChannel.parentId || "");
  const siblings = listSortableVoiceSiblings(voiceChannel.guild, parentId);
  const anchor = siblings.find((ch?) => channelCategorySortPosition(ch) === target - 1) || null;
  const idx = anchor
    ? resolveVoiceSetPositionIndex(siblings, voiceChannel.id, anchor.id)
    : null;
  if (idx == null) return;
  await voiceChannel
    .setPosition(idx, { reason: reason || "Vocale hub spawn in coda gruppo" })
    .catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] setPosition(index) failed:", err?.message || err);
    });
}

/** Posiziona lo spawn subito sotto l'ultimo canale del gruppo hub (hub o spawn precedente). */
async function placeSpawnAfterHubGroupTail(created?, hubChannel?, guild?, client?, reason?) {
  if (!created?.id || !hubChannel || !guild) return false;
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  await refreshParentChannelsCache(guild, parentId, client, { force: true });
  const freshHub = guild.channels.cache.get(hubChannel.id) || hubChannel;
  const freshCreated = guild.channels.cache.get(created.id) || created;
  const group = listHubGroupChannels(guild, freshHub, client).filter(
    (ch?) =>
      String(ch.id) !== String(freshCreated.id) &&
      (isPublicVoiceHubId(ch.id, client) || isHubGroupSpawnChannel(ch, freshHub, client)),
  );
  const sortedGroup = group.sort(
    (a?, b?) =>
      channelCategorySortPosition(a) - channelCategorySortPosition(b) ||
      String(a.id).localeCompare(String(b.id)),
  );
  const anchor = sortedGroup[sortedGroup.length - 1] || freshHub;
  const anchorFresh = guild.channels.cache.get(anchor.id) || anchor;
  const siblings = listSortableVoiceSiblings(guild, parentId || freshCreated.parentId);
  const targetIdx = resolveVoiceSetPositionIndex(siblings, freshCreated.id, anchorFresh.id);
  if (targetIdx == null) return true;

  let ok = await freshCreated
    .setPosition(targetIdx, { reason: reason || "Vocale hub spawn sotto gruppo" })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] place after tail failed:", err?.message || err);
      return false;
    });
  if (!ok && typeof guild.channels?.setPositions === "function") {
    const anchorPos = channelCategorySortPosition(anchorFresh);
    if (anchorPos >= 0) {
      ok = await guild.channels
        .setPositions([{ channel: freshCreated.id, position: anchorPos + 1 }])
        .then(() => true)
        .catch(() => false);
    }
  }
  return ok;
}

function listHubGroupChannels(guild?, hubChannel?, client = null) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  const hubKey = resolveHubGroupKey(hubChannel, client);
  if (!hubKey || !parentId) return [];
  return listCategoryVoiceChannelsSorted(guild, parentId).filter(
    (ch?) => resolveHubGroupKey(ch, client) === hubKey,
  );
}

function nextSpawnSuffixIndex(groupChannels?, hubId?) {
  const used = new Set();
  for (const ch of groupChannels) {
    if (String(ch.id) === String(hubId)) continue;
    const n = parseVoiceSuffixIndex(ch.name);
    if (n > 0) used.add(n);
  }
  let i = 1;
  while (used.has(i)) i += 1;
  return i;
}

function resolveInsertSlot(hubChannel?, guild?, client?) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  const hubKey = resolveHubGroupKey(hubChannel, client);
  if (!hubKey || !parentId) return null;
  const siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  const hubIndex = siblings.findIndex((ch?) => String(ch.id) === String(hubChannel.id));
  if (hubIndex < 0) return null;

  let insertAt = hubIndex + 1;
  for (let i = hubIndex + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (ch.type !== ChannelType.GuildVoice && ch.type !== ChannelType.GuildStageVoice) continue;
    if (isPublicVoiceHubId(ch.id, client, guild)) break;
    if (resolveHubGroupKey(ch, client) !== hubKey) break;
    insertAt = i + 1;
  }

  const prev = siblings[insertAt - 1];
  if (!prev) return null;
  const prevPos = channelCategorySortPosition(prev);
  if (prevPos < 0) return null;
  // Sempre subito sotto l'ultimo canale del gruppo (hub o spawn precedente).
  return prevPos + 1;
}

function resolveInsertPosition(hubChannel?, guild?, client?) {
  // Preferisci lo slot per indice fratelli (subito dopo l'ultimo spawn del gruppo),
  // non solo rawPosition+1 (con buchi Discord finiva sotto l'hub sbagliato).
  const bySlot = resolveInsertSlot(hubChannel, guild, client);
  if (bySlot != null) return bySlot;
  return resolveHubSpawnCreatePosition(guild, hubChannel, client);
}

async function refreshParentChannelsCache(guild?, parentId?, client?, options: Record<string, any> = {}) {
  if (!guild?.channels?.fetch || !parentId) return;
  const force = options.force === true;
  const parentIdStr = String(parentId);
  const hubIds = client ? getHubChannelIds(client) : [];

  if (force || hubIds.some((id?) => !guild.channels.cache.has(id))) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const cachedInParent = [...guild.channels.cache.values()].filter(
    (ch?) => String(ch.parentId || "") === parentIdStr,
  );
  const hubsInParent = hubIds
    .map((id?) => guild.channels.cache.get(id))
    .filter((ch?) => ch && String(ch.parentId || "") === parentIdStr);
  if (!hubsInParent.length && !cachedInParent.length) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const siblings = listCategoryChannelsSorted(guild, parentId);
  const missingHubInSiblings = hubsInParent.some(
    (hub?) => !siblings.some((ch?) => String(ch.id) === String(hub.id)),
  );
  if (missingHubInSiblings) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const voiceInParentCount = cachedInParent.filter((ch?) => ch.type === ChannelType.GuildVoice).length;
  if (voiceInParentCount < hubsInParent.length) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  }
}

function verifyHubGroupChannelOrder(guild?, hubChannel?, client?) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  if (!parentId) return { ok: true, misplaced: [] };
  const freshHub = guild.channels.cache.get(hubChannel.id) || hubChannel;
  /* hubSpawnUnderHub3: solo vocali — come li vede Discord in UI */
  const siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  const hubIdx = siblings.findIndex((ch?) => String(ch.id) === String(freshHub.id));
  if (hubIdx < 0) return { ok: true, misplaced: [] };

  const spawns = siblings
    .filter((ch?) => isHubGroupSpawnChannel(ch, freshHub, client))
    .sort((a?, b?) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
  const misplaced = [];
  for (let i = 0; i < spawns.length; i += 1) {
    const idx = siblings.findIndex((ch?) => String(ch.id) === String(spawns[i].id));
    const expectedIdx = hubIdx + 1 + i;
    if (idx !== expectedIdx) {
      misplaced.push({ id: spawns[i].id, name: spawns[i].name, idx, expectedIdx });
    }
  }
  return { ok: misplaced.length === 0, misplaced };
}

function buildDesiredSiblingsWithHubSpawns(siblings?, hub?, spawns?) {
  const spawnIdSet = new Set(spawns.map((ch?) => String(ch.id)));
  const withoutSpawns = siblings.filter((ch?) => !spawnIdSet.has(String(ch.id)));
  const hubIdx = withoutSpawns.findIndex((ch?) => String(ch.id) === String(hub.id));
  if (hubIdx < 0) return siblings;
  return [
    ...withoutSpawns.slice(0, hubIdx + 1),
    ...spawns,
    ...withoutSpawns.slice(hubIdx + 1),
  ];
}

function siblingsOrderEqual(left?, right?) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (String(left[i].id) !== String(right[i].id)) return false;
  }
  return true;
}

function computeCategoryPositionUpdates(currentSorted?, desiredOrder?) {
  if (currentSorted.length !== desiredOrder.length) return [];
  const base = Math.min(...currentSorted.map((ch?) => Number(ch.rawPosition)));
  if (!Number.isFinite(base)) return [];
  const orderMismatch = currentSorted.some((ch?, i?) => String(desiredOrder[i]?.id) !== String(ch.id));
  const updates = [];
  for (let i = 0; i < desiredOrder.length; i += 1) {
    const ch = desiredOrder[i];
    const wantPos = base + i;
    const posMismatch = Number(ch.rawPosition) !== wantPos;
    /* hubSpawnUnderHub3: se l'ordine è sbagliato, riscrivi TUTTE le posizioni voice
       (update parziali Discord spesso non scambiano duo⁰¹ ↔ hub). */
    if (orderMismatch || posMismatch) {
      updates.push({ channel: ch.id, position: wantPos });
    }
  }
  return updates;
}

function isStanzaLobbyOrRoomChannel(ch?, parentId = "") {
  const id = String(ch?.id || "").trim();
  const lobbyId = String(IDs.channels?.stanzaLobbyVoice || "").trim();
  if (lobbyId && id === lobbyId) return true;
  if (!ch?.isVoiceBased?.()) return false;
  /* hub duo/trio/squad/chill/cinema non sono stanze temporanee */
  if (isPublicVoiceHubId(id, null, ch.guild)) return false;
  const pinIds = new Set(getPinnedTopPublicVoiceIds());
  if (pinIds.has(id)) return false;
  const n = String(ch?.name || "");
  if (/crea una\s/i.test(n)) return false;
  /* hubSpawnUnderHub3: duo⁰¹/trio⁰¹/squad⁰¹ NON sono stanze Coffee —
     altrimenti finiscono sotto "crea una stanza" e SOPRA gli hub. */
  if (parseVoiceSuffixIndex(n) > 0 && voiceHubGroupKeyFromName(n)) return false;
  /* Coffee crea le stanze: reorder Vinyls le tiene sotto l'hub "crea una stanza". */
  if (/Stanza di\s+/i.test(n)) return true;
  if (parentId && String(ch.parentId || "") !== String(parentId)) return false;
  try {
    const coffee = require("../../../Caffè/Services/Voice/stanzaVoiceRoomsService") as typeof import("../../../Caffè/Services/Voice/stanzaVoiceRoomsService");
    if (typeof coffee.isManagedStanzaRoomChannel === "function") {
      return Boolean(coffee.isManagedStanzaRoomChannel(ch, parentId || String(ch.parentId || "")));
    }
  } catch (_) {}
  return false;
}

function getPinnedTopPublicVoiceIds() {
  /* cinema + chill sempre in cima a VOCALI (cinema primo, poi chill; sopra stanza/hub) */
  return [
    String(IDs.channels?.serataFilm || "").trim(),
    String(IDs.channels?.vocaleLounge1 || "").trim(),
  ].filter((id?) => /^\d{16,22}$/.test(id));
}

function buildLimitateCategoryDesiredOrder(guild?, client?, parentId?) {
  /* hubSpawnUnderHub3: solo voice — setPositions su mix text+voice rompeva lo stack UI */
  const siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  const used = new Set();
  const ordered = [];

  for (const pinId of getPinnedTopPublicVoiceIds()) {
    const pinned = siblings.find((ch?) => String(ch.id) === pinId);
    if (!pinned || used.has(String(pinned.id))) continue;
    ordered.push(pinned);
    used.add(String(pinned.id));
  }

  // Hub stanze temporanee + le sue stanze SOPRA gli altri hub (duo/trio/…).
  const stanzaLobbyId = String(IDs.channels?.stanzaLobbyVoice || "").trim();
  const stanzaLobby = siblings.find((ch?) => String(ch.id) === stanzaLobbyId);
  if (stanzaLobby) {
    ordered.push(stanzaLobby);
    used.add(String(stanzaLobby.id));
    for (const ch of siblings) {
      if (used.has(String(ch.id))) continue;
      if (!isStanzaLobbyOrRoomChannel(ch, parentId)) continue;
      ordered.push(ch);
      used.add(String(ch.id));
    }
  }

  /* Hub da ID configurati + discovery "crea una …" (se ID stale, non perdiamo il gruppo). */
  const hubIdSet = new Set(getHubChannelIds(client, guild).map((id?) => String(id)));
  const hubs = [];
  for (const ch of siblings) {
    if (hubIdSet.has(String(ch.id))) {
      hubs.push(ch);
      continue;
    }
    /* fallback nome: crea una duo/trio/squad… = hub lobby */
    if (/crea\s+un[a']?\s+/i.test(String(ch.name || "")) && voiceHubGroupKeyFromName(ch.name)) {
      hubs.push(ch);
    }
  }
  hubs.sort((a?, b?) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));

  for (const hub of hubs) {
    if (used.has(String(hub.id))) continue;
    ordered.push(hub);
    used.add(String(hub.id));
    const spawns = siblings
      .filter((ch?) => !used.has(String(ch.id)) && isHubGroupSpawnChannel(ch, hub, client))
      .sort((a?, b?) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
    for (const spawn of spawns) {
      ordered.push(spawn);
      used.add(String(spawn.id));
    }
  }
  for (const ch of siblings) {
    if (!used.has(String(ch.id))) ordered.push(ch);
  }
  return ordered;
}

async function applyCategoryPositionUpdates(guild?, updates?) {
  if (!updates.length) return { applied: 0 };
  const movable = [];
  for (const row of updates) {
    const ch = guild.channels.cache.get(row.channel);
    if (!ch) continue;
    if (ch.manageable === false) continue;
    movable.push(row);
  }
  if (!movable.length) return { applied: 0, reason: "nothing_movable" };
  try {
    if (typeof guild.channels?.setPositions === "function") {
      await guild.channels.setPositions(movable);
    } else {
      for (const row of movable) {
        const ch = guild.channels.cache.get(row.channel);
        if (ch?.setPosition) await ch.setPosition(row.position);
      }
    }
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return { applied: movable.length };
  } catch (err) {
    return {
      applied: 0,
      reason: "set_positions_failed",
      error: err?.message || String(err),
    };
  }
}

async function moveMisplacedHubSpawns(guild?, client?, parentId?, desiredOrder?, options: Record<string, any> = {}) {
  const gapMs = Number(options.gapMs) > 0 ? Number(options.gapMs) : 350;
  let moved = 0;
  for (let targetIdx = 0; targetIdx < desiredOrder.length; targetIdx += 1) {
    const target = desiredOrder[targetIdx];
    if (!target || isPublicVoiceHubId(target.id, client, guild)) continue;
    if (target.type !== ChannelType.GuildVoice && target.type !== ChannelType.GuildStageVoice) {
      continue;
    }
    /* Solo spawn hub (duo/trio/…) — non altre voice random */
    const isSpawn = parseVoiceSuffixIndex(target.name) > 0 && resolveHubGroupKey(target, client);
    if (!isSpawn && !isHubGroupSpawnChannel(target, desiredOrder[targetIdx - 1] || target, client)) {
      /* keep moving only superscript spawns */
      if (parseVoiceSuffixIndex(target.name) <= 0) continue;
    }

    let prev = null;
    for (let i = targetIdx - 1; i >= 0; i -= 1) {
      const ch = desiredOrder[i];
      if (ch?.type === ChannelType.GuildVoice || ch?.type === ChannelType.GuildStageVoice) {
        prev = ch;
        break;
      }
    }

    const siblings = listSortableVoiceSiblings(guild, parentId);
    const currentIdx = siblings.findIndex((ch?) => String(ch.id) === String(target.id));
    const prevIdx = prev ? siblings.findIndex((ch?) => String(ch.id) === String(prev.id)) : -1;
    if (prev && currentIdx === prevIdx + 1) continue;
    if (!prev && currentIdx === 0) continue;

    const fresh = guild.channels.cache.get(target.id) || target;
    if (fresh.manageable === false) continue;

    let ok = false;
    if (prev) {
      const idx = resolveVoiceSetPositionIndex(siblings, fresh.id, prev.id);
      if (idx == null) continue;
      ok = await fresh
        .setPosition(idx, { reason: "hubSpawnUnderHub3 spawn under hub" })
        .then(() => true)
        .catch(() => false);
      if (!ok && typeof guild.channels?.setPositions === "function") {
        const prevPos = channelCategorySortPosition(guild.channels.cache.get(prev.id) || prev);
        if (prevPos >= 0) {
          ok = await guild.channels
            .setPositions([{ channel: fresh.id, position: prevPos + 1 }])
            .then(() => true)
            .catch(() => false);
        }
      }
    } else {
      ok = await fresh.setPosition(0, { reason: "hubSpawnUnderHub3 spawn top" }).then(() => true).catch(() => false);
    }
    if (ok) {
      moved += 1;
      if (gapMs > 0) await pauseMs(gapMs);
      if (options.skipFetch !== true) {
        await guild.channels.fetch(undefined, { force: true }).catch(() => null);
      }
    }
  }
  return moved;
}

async function reorderLimitateCategory(guild?, client?, options: Record<string, any> = {}) {
  const stats = { moved: 0, failed: 0, parentId: "" };
  if (!guild || !(await botCanManageVoiceHubs(guild))) return stats;
  const quick = options.quick === true;
  const maxAttempts = quick ? 1 : 3;
  const retryPauseMs = quick ? 0 : 450;
  const spawnGapMs = quick ? 0 : 350;

  const parentId = String(
    options.parentId ||
      getPublicVoiceHubCategoryId(client) ||
      IDs.categories?.categoryPublics ||
      IDs.categories?.categoryLimitate ||
      guild.channels.cache.get(getHubChannelIds(client)[0] || "")?.parentId ||
      "",
  );
  if (!parentId) return stats;
  stats.parentId = parentId;

  await refreshParentChannelsCache(guild, parentId, client, { force: options.forceFetch === true && !quick });
  const desired = buildLimitateCategoryDesiredOrder(guild, client, parentId);
  let siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  if (siblingsOrderEqual(siblings, desired)) return stats;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    siblings = listCategoryVoiceChannelsSorted(guild, parentId);
    const desiredOrder = buildLimitateCategoryDesiredOrder(guild, client, parentId);
    if (siblingsOrderEqual(siblings, desiredOrder)) break;

    const updates = computeCategoryPositionUpdates(siblings, desiredOrder);
    const batch = await applyCategoryPositionUpdates(guild, updates);
    if (batch.applied > 0) {
      stats.moved += batch.applied;
      if (retryPauseMs > 0) await pauseMs(retryPauseMs);
      siblings = listCategoryVoiceChannelsSorted(guild, parentId);
      if (siblingsOrderEqual(siblings, desiredOrder)) break;
    }

    /* hubSpawnUnderHub3: dopo setPositions, forza move spawn→sotto hub uno a uno */
    const spawnMoved = await moveMisplacedHubSpawns(guild, client, parentId, desiredOrder, {
      gapMs: spawnGapMs,
      skipFetch: quick,
    });
    if (spawnMoved > 0) {
      stats.moved += spawnMoved;
      if (retryPauseMs > 0) await pauseMs(retryPauseMs);
      continue;
    }

    if (batch.applied > 0) continue;

    stats.failed += 1;
    if (!quick) {
      global.logger?.warn?.(
        "[publicVoiceHub] limitate reorder failed:",
        batch.reason || "spawn_move_failed",
        batch.error || "",
        siblings.map((ch?) => `${ch.name}@${ch.rawPosition}`).join(" | "),
      );
    }
    break;
  }

  return stats;
}

function pauseMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, ms));
}

async function ensureHubGroupChannelOrder(guild?, hubChannel?, client?, options: Record<string, any> = {}) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  const stats: any = await reorderLimitateCategory(guild, client, {
    parentId,
    forceFetch: options.forceFetch === true,
  });
  stats.hubId = String(hubChannel?.id || "");
  const verify = verifyHubGroupChannelOrder(guild, hubChannel, client);
  if (!verify.ok) stats.misplaced = verify.misplaced;
  return stats;
}

async function realignAllPublicVoiceHubGroups(guild?, client?) {
  const summary = { moved: 0, skipped: 0, failed: 0, misplaced: [] };
  if (!guild || !(await botCanManageVoiceHubs(guild))) return summary;
  await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  const parentIds = new Set();
  const duoParent = getPublicVoiceHubCategoryId(client);
  if (duoParent) parentIds.add(duoParent);
  const gameParent = getGameVoiceHubCategoryId(client);
  if (gameParent && isGameVoiceHubsEnabled(client)) parentIds.add(gameParent);
  for (const parentId of parentIds) {
    const stats = await reorderLimitateCategory(guild, client, { forceFetch: true, parentId });
    summary.moved += stats.moved || 0;
    summary.failed += stats.failed || 0;
  }
  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    const verify = verifyHubGroupChannelOrder(guild, hub, client);
    if (!verify.ok && Array.isArray(verify.misplaced)) summary.misplaced.push(...verify.misplaced);
  }
  return summary;
}

async function realignPublicVoiceHubGroupsOnStartup(client?) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  if (!(await botCanManageVoiceHubs(guild))) {
    global.logger?.warn?.("[publicVoiceHub] realign skipped: missing ManageChannels/MoveMembers or members.me");
    return { ok: false, reason: "missing_permissions" };
  }
  const summary = await realignAllPublicVoiceHubGroups(guild, client);
  if (summary.misplaced.length) {
    global.logger?.warn?.(
      "[publicVoiceHub] realign incomplete:",
      summary.misplaced.map((row?) => `${row.name || row.id} idx=${row.idx} expected=${row.expectedIdx}`).join("; "),
      `(moved=${summary.moved} failed=${summary.failed})`,
    );
    return { ok: false, reason: "misplaced_after_realign", summary };
  }
  if (summary.failed > 0) {
    global.logger?.warn?.(
      "[publicVoiceHub] realign had failures:",
      `moved=${summary.moved} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    return { ok: false, reason: "move_failed", summary };
  }
  return { ok: true, summary };
}

function copyPermissionOverwrites(channel?) {
  const cache = channel.permissionOverwrites?.cache;
  if (!cache) return [];
  const entries = typeof cache.values === "function" ? [...cache.values()] : [];
  return entries.map((overwrite?) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));
}

function hubLobbyRoleIds(guild?) {
  const ids = new Set([String(guild.roles.everyone.id)]);
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId) ids.add(memberRoleId);
  return [...ids];
}

function mergeOverwriteFlags(overwrite?, flags?, allow?) {
  const allowBits = new PermissionsBitField(overwrite.allow?.bitfield ?? overwrite.allow ?? 0n);
  const denyBits = new PermissionsBitField(overwrite.deny?.bitfield ?? overwrite.deny ?? 0n);
  for (const flag of flags) {
    if (allow) {
      denyBits.remove(flag);
      allowBits.add(flag);
    } else {
      allowBits.remove(flag);
      denyBits.add(flag);
    }
  }
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: allowBits.bitfield,
    deny: denyBits.bitfield,
  };
}

function mergeOverwriteSpeak(overwrite?, allowSpeak?) {
  return mergeOverwriteFlags(overwrite, HUB_LOBBY_SPEAK_FLAGS, allowSpeak);
}

function mergeSpawnOverwriteForRole(overwrite?, lobbyRoles?) {
  const id = String(overwrite.id);
  let patched = lobbyRoles.has(id) ? mergeOverwriteSpeak(overwrite, true) : overwrite;
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId && id === memberRoleId) {
    patched = mergeOverwriteFlags(patched, HUB_SPAWN_MEMBER_TEXT_FLAGS, true);
  }
  return patched;
}

async function ensureSpawnedChannelMemberTextAccess(channel?, guild?) {
  if (!channel?.permissionOverwrites?.cache || !channel.manageable) return;
  const patch = {
    SendMessages: true,
    UseEmbeddedActivities: true,
    UseExternalApps: true,
  };
  const targets = [];
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId) targets.push(memberRoleId);
  const everyoneId = String(guild?.roles?.everyone?.id || "").trim();
  if (everyoneId) targets.push(everyoneId);
  for (const roleId of targets) {
    const existing = channel.permissionOverwrites.cache.get(roleId);
    if (existing) {
      await channel.permissionOverwrites.edit(roleId, patch).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] spawn activity/text edit failed:", channel.id, err?.message || err);
      });
      continue;
    }
    if (roleId === memberRoleId) {
      await channel.permissionOverwrites
        .create(roleId, { type: OverwriteType.Role, ...patch })
        .catch((err?) => {
          global.logger?.warn?.("[publicVoiceHub] spawn activity/text create failed:", channel.id, err?.message || err);
        });
    }
  }
}

function hubOverwriteSpeakDenied(overwrite?) {
  if (!overwrite) return false;
  try {
    return overwrite.deny?.has?.(PermissionsBitField.Flags.Speak) === true;
  } catch {
    return false;
  }
}

function buildSpawnPermissionOverwrites(hubChannel?, guild?) {
  const lobbyRoles = new Set(hubLobbyRoleIds(guild));
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  const byId = new Map();
  for (const overwrite of copyPermissionOverwrites(hubChannel)) {
    byId.set(String(overwrite.id), overwrite);
  }
  const result = [];
  for (const overwrite of byId.values()) {
    result.push(mergeSpawnOverwriteForRole(overwrite, lobbyRoles));
  }
  for (const roleId of lobbyRoles) {
    if (byId.has(roleId)) continue;
    let entry = {
      id: roleId,
      type: OverwriteType.Role,
      allow:
        PermissionsBitField.Flags.Speak |
        PermissionsBitField.Flags.UseVAD |
        PermissionsBitField.Flags.Stream |
        PermissionsBitField.Flags.UseEmbeddedActivities |
        PermissionsBitField.Flags.UseExternalApps,
      deny: 0n,
    };
    if (memberRoleId && roleId === memberRoleId) {
      entry = mergeOverwriteFlags(entry, HUB_SPAWN_MEMBER_TEXT_FLAGS, true);
    }
    result.push(entry);
  }
  return result;
}

async function ensureHubLobbySpeakDenied(hubChannel?, guild?) {
  if (!hubChannel?.permissionOverwrites || !hubChannel.manageable) return;
  for (const roleId of hubLobbyRoleIds(guild)) {
    const existing = hubChannel.permissionOverwrites.cache.get(roleId);
    const patch = {
      Speak: false,
      UseVAD: false,
      Stream: false,
      UseEmbeddedActivities: false,
      UseExternalApps: false,
      Connect: true,
      ViewChannel: true,
    };
    if (existing) {
      // Anche se Speak è già negato, forza Connect/View (lobby join).
      await hubChannel.permissionOverwrites.edit(roleId, patch).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] hub speak deny edit failed:", hubChannel.id, roleId, err?.message || err);
      });
      continue;
    }
    await hubChannel.permissionOverwrites
      .create(roleId, { type: OverwriteType.Role, ...patch })
      .catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] hub speak deny create failed:", hubChannel.id, roleId, err?.message || err);
      });
  }
}

async function ensurePublicVoiceHubChannelsOnReady(client?) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return;
  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    // Gaming hub: permessi già a posto, non forzare speak-deny da duo.
    if (isGameVoiceHubChannel(hub, client)) continue;
    await ensureHubLobbySpeakDenied(hub, guild);
  }
}

async function recoverPublicVoiceHubOnStartup(client?) {
  if (
    client?.config?.publicVoiceHubs?.enabled === false &&
    client?.config?.gameVoiceHubs?.enabled === false
  ) {
    return { lobbies: 0, spawned: 0 };
  }
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { lobbies: 0, spawned: 0 };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return { lobbies: 0, spawned: 0 };

  await guild.channels.fetch().catch(() => null);
  await guild.members.fetch({ withPresences: false }).catch(() => null);

  let spawned = 0;
  let lobbies = 0;

  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;

    for (const ch of listHubGroupChannels(guild, hub, client)) {
      if (!isHubGroupSpawnChannel(ch, hub, client)) continue;
      rememberSpawnedChannel(ch.id, hubId);
      await ensureSpawnedChannelMemberTextAccess(ch, guild);
      spawned += 1;
      if ((await countHumanMembersResolved(ch)) === 0) {
        scheduleSpawnedChannelDelete(ch, client);
      }
    }

        const lobbyUserIds = [
      ...new Set(
        [...guild.voiceStates.cache.values()]
          .filter((vs?) => String(vs.channelId || "") === String(hubId))
          .map((vs?) => String(vs.id || "").trim())
          .filter(Boolean),
      ),
    ];
    for (const userId of lobbyUserIds) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || member.user?.bot) continue;
      const oldState = buildRecoveryVoiceState(guild, member, null);
      const newState = buildRecoveryVoiceState(guild, member, hubId);
      await handlePublicVoiceHubJoin(oldState, newState, client);
      lobbies += 1;
    }
  }

  if (lobbies > 0 || spawned > 0) {
    global.logger?.info?.(`[publicVoiceHub] recovery: lobbies=${lobbies} spawned=${spawned}`);
  }
  return { lobbies, spawned };
}

function startPublicVoiceHubSetup(client?) {
  setImmediate(() => {
    (async () => {
      await ensurePublicVoiceHubChannelsOnReady(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] hub permission sync failed:", err?.message || err),
      );
      await recoverPublicVoiceHubOnStartup(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] lobby recovery failed:", err?.message || err),
      );
      await realignPublicVoiceHubGroupsOnStartup(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] realign failed:", err?.message || err),
      );
      await sweepEmptySpawnedHubChannels(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] empty sweep failed:", err?.message || err),
      );
    })();
  });

  if (!client.__publicVoiceHubEmptySweep) {
    client.__publicVoiceHubEmptySweep = setInterval(() => {
      sweepEmptySpawnedHubChannels(client).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] empty sweep failed:", err?.message || err);
      });
    }, 60_000);
    client.__publicVoiceHubEmptySweep.unref?.();
  }
}

async function withHubCreateLock(hubId?, fn?) {
  const key = String(hubId || "");
  if (!key) return fn();
  while (hubCreateLocks.has(key)) {
    await hubCreateLocks.get(key).catch(() => {});
  }
  const job = Promise.resolve().then(fn).finally(() => {
    if (hubCreateLocks.get(key) === job) hubCreateLocks.delete(key);
  });
  hubCreateLocks.set(key, job);
  return job;
}

function rememberSpawnedChannel(channelId?, hubId?) {
  const cid = String(channelId || "");
  const hid = String(hubId || "");
  if (cid && hid) spawnedHubByChannel.set(cid, hid);
}

function forgetSpawnedChannel(channelId?) {
  const cid = String(channelId || "");
  if (!cid) return;
  spawnedHubByChannel.delete(cid);
  const timer = emptyDeleteTimers.get(cid);
  if (timer) {
    clearTimeout(timer);
    emptyDeleteTimers.delete(cid);
  }
}

function isSpawnedHubChannel(channel?, client?) {
  const id = String(channel?.id || "");
  if (!id || isPublicVoiceHubId(id, client, channel?.guild)) return false;
  if (spawnedHubByChannel.has(id)) return true;
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  if (!INDEX_SUFFIX_RE.test(String(channel.name || ""))) return false;
  const parentId = String(channel.parentId || "");
  const hubKey = resolveHubGroupKey(channel, client);
  if (!hubKey) return false;
  const spawnCategoryId = getPublicVoiceHubCategoryId(client, channel);
  for (const hubId of getHubChannelIds(client, channel.guild)) {
    const hub = channel.guild?.channels?.cache?.get(hubId);
    if (!hub) continue;
    const hubParent = String(hub.parentId || "");
    const sameCategory =
      parentId &&
      (parentId === hubParent || (spawnCategoryId && parentId === spawnCategoryId));
    if (!sameCategory) continue;
    if (resolveHubGroupKey(hub, client) === hubKey) return true;
  }
  return false;
}

function resolveVoiceStateUser(guild?, vs?) {
  const member = vs?.member || guild?.members?.cache?.get?.(vs?.id);
  const user = member?.user || guild?.client?.users?.cache?.get?.(vs?.id) || null;
  return { member: member || null, user };
}

function countHumanMembers(channel?) {
  const guild = channel?.guild;
  const channelId = String(channel?.id || "");
  if (!guild?.voiceStates?.cache || !channelId) return 0;
  let n = 0;
  for (const vs of guild.voiceStates.cache.values()) {
    if (String(vs.channelId || "") !== channelId) continue;
    const { member, user } = resolveVoiceStateUser(guild, vs);
    if (user?.bot || member?.user?.bot) continue;
    if (!user && !member) continue;
    n += 1;
  }
  return n;
}

function hasBotMemberInChannel(channel?) {
  const guild = channel?.guild;
  const channelId = String(channel?.id || "");
  if (!guild?.voiceStates?.cache || !channelId) return false;
  for (const vs of guild.voiceStates.cache.values()) {
    if (String(vs.channelId || "") !== channelId) continue;
    const { member, user } = resolveVoiceStateUser(guild, vs);
    if (user?.bot || member?.user?.bot) return true;
  }
  return false;
}

async function countHumanMembersResolved(channel?) {
  const guild = channel?.guild;
  const channelId = String(channel?.id || "");
  if (!guild?.voiceStates?.cache || !channelId) return 0;
  let n = 0;
  for (const vs of [...guild.voiceStates.cache.values()]) {
    if (String(vs.channelId || "") !== channelId) continue;
    let { member, user } = resolveVoiceStateUser(guild, vs);
    if (!member && vs?.id) {
      member = await guild.members.fetch(vs.id).catch(() => null);
      user = member?.user || user;
    }
    if (user?.bot || member?.user?.bot) continue;
    if (!member && !user) continue;
        const stillHere = String(member?.voice?.channelId || guild.voiceStates.cache.get(vs.id)?.channelId || "") === channelId;
    if (!stillHere) continue;
    n += 1;
  }
  return n;
}

function resolveMemberVoiceChannelId(guild?, userId?, member = null) {
  const uid = String(userId || member?.id || "");
  if (!uid) return "";
  const fromCache = guild?.voiceStates?.cache?.get?.(uid);
  if (fromCache?.channelId) return String(fromCache.channelId);
  const fromMember = member?.voice?.channelId;
  return fromMember ? String(fromMember) : "";
}

function memberStillInVoiceChannel(member?, channelId?, guild = null) {
  const expected = String(channelId || "");
  if (!expected) return false;
  const current = resolveMemberVoiceChannelId(guild || member?.guild, member?.id, member);
  return Boolean(current && current === expected);
}

function isUserDisconnectedVoiceError(err?) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("not connected to voice") || msg.includes("target user is not connected");
}

async function resolveGuildMemberVoiceState(guild?, member?, userId?) {
  const uid = String(userId || member?.id || "");
  if (!guild || !uid) return member || null;
  const cached = guild.members.cache.get(uid) || member;
  if (cached?.voice?.channelId) return cached;
  return guild.members.fetch(uid).catch(() => cached || null);
}

async function cleanupUnusedSpawnedChannel(created?, reason?) {
  if (!created?.id) return;
  try {
    const { isProtectedStreamerStageChannelId } = require("../Community/streamerStageGuardService") as typeof import("../Community/streamerStageGuardService");
    if (isProtectedStreamerStageChannelId(created.id)) {
      global.logger?.warn?.("[publicVoiceHub] refused delete of protected streamer stage:", created.id);
      return;
    }
  } catch {
    /* ignore */
  }
  forgetSpawnedChannel(created.id);
  await created.delete(reason).catch(() => {});
}

function scheduleSpawnedChannelDelete(channel?, client?) {
  const channelId = String(channel?.id || "");
  if (!channelId) return;
  try {
    const { isProtectedStreamerStageChannelId } = require("../Community/streamerStageGuardService") as typeof import("../Community/streamerStageGuardService");
    if (isProtectedStreamerStageChannelId(channelId, client)) {
      global.logger?.warn?.("[publicVoiceHub] skip empty-delete for protected streamer stage:", channelId);
      return;
    }
  } catch {
    /* ignore */
  }
  const existing = emptyDeleteTimers.get(channelId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    emptyDeleteTimers.delete(channelId);
    const guild = channel.guild;
    if (!guild) {
      forgetSpawnedChannel(channelId);
      return;
    }
    const fresh =
      guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!fresh?.isVoiceBased?.()) {
      forgetSpawnedChannel(channelId);
      return;
    }
    const humans = await countHumanMembersResolved(fresh);
    if (humans > 0) return;
    try {
      const { isProtectedStreamerStageChannelId } = require("../Community/streamerStageGuardService") as typeof import("../Community/streamerStageGuardService");
      if (isProtectedStreamerStageChannelId(channelId, client)) {
        global.logger?.warn?.("[publicVoiceHub] abort empty-delete protected streamer stage:", channelId);
        return;
      }
    } catch {
      /* ignore */
    }
    if (!fresh.manageable && !fresh.deletable) {
      global.logger?.warn?.("[publicVoiceHub] empty spawn not deletable:", channelId, fresh.name);
      return;
    }
    const deleted = await fresh.delete("Vocale hub temporanea vuota").then(() => true).catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] empty spawn delete failed:", channelId, err?.message || err);
      return false;
    });
    if (!deleted) return;
    const hubId = spawnedHubByChannel.get(channelId) || null;
    forgetSpawnedChannel(channelId);
    let hub = hubId ? guild.channels.cache.get(hubId) : null;
    if (!hub) {
      const hubKey = resolveHubGroupKey(fresh, client);
      if (hubKey) {
        hub = getHubChannelIds(client, guild)
          .map((id?) => guild.channels.cache.get(id))
          .find(
            (row?) =>
              row &&
              String(row.parentId || "") === String(fresh.parentId || "") &&
              resolveHubGroupKey(row, client) === hubKey,
          );
      }
    }
    if (hub) {
      await reorderLimitateCategory(guild, client, {
        parentId: getPublicVoiceHubCategoryId(client, hub) || fresh.parentId,
        forceFetch: true,
      }).catch(() => null);
    }
    queueCategoryRenumber(client, guild.id, 5000);
  }, EMPTY_DELETE_DELAY_MS);
  timer.unref?.();
  emptyDeleteTimers.set(channelId, timer);
}

function scheduleHubSpawnFollowUp(guild?, client?, hubChannel?, createdChannelId?) {
  const guildId = String(guild?.id || "");
  const hubId = String(hubChannel?.id || "");
  const channelId = String(createdChannelId || "");
  if (!guildId || !hubId) return;
  setImmediate(() => {
    (async () => {
      const liveGuild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!liveGuild) return;
      const hub = liveGuild.channels.cache.get(hubId) || (await liveGuild.channels.fetch(hubId).catch(() => null));
      if (!hub) return;
      const created =
        liveGuild.channels.cache.get(channelId) ||
        (channelId ? await liveGuild.channels.fetch(channelId).catch(() => null) : null);
      if (created) {
        await ensureSpawnedChannelMemberTextAccess(created, liveGuild).catch(() => null);
      }
      await reorderLimitateCategory(liveGuild, client, {
        parentId: getPublicVoiceHubCategoryId(client, hub) || hub.parentId,
        forceFetch: true,
      }).catch(() => null);
      queueCategoryRenumber(client, liveGuild.id, 5000);
    })().catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] deferred follow-up failed:", err?.message || err);
    });
  });
}

async function handlePublicVoiceHubJoin(oldState?, newState?, client?) {
  const joinedId = String(newState.channelId || "");
  if (!joinedId) return;

  const guild = newState.guild;
  if (!guild) return;
  const uid = String(newState.id || newState.member?.id || "").trim();
  if (!uid) return;

  let member = newState.member || guild.members.cache.get(uid) || null;
  if (!member) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  const hub =
    newState.channel ||
    guild.channels.cache.get(joinedId) ||
    (await guild.channels.fetch(joinedId).catch(() => null));
  if (!member || member.user?.bot || !hub?.isVoiceBased?.()) return;

  const isGameHub = isGameVoiceHubChannel(hub, client);
  if (isGameHub) {
    if (!isGameVoiceHubsEnabled(client)) return;
  } else if (!isPublicVoiceHubId(joinedId, client, guild)) {
    return;
  } else if (client?.config?.publicVoiceHubs?.enabled === false) {
    return;
  }

  if (isHubCreateDisabledForChannel(hub, client)) return;
  if (!(await botCanManageVoiceHubs(guild))) {
    global.logger?.warn?.("[publicVoiceHub] bot missing ManageChannels/MoveMembers");
    return;
  }

  if (userCreateLocks.has(uid)) return;
  userCreateLocks.add(uid);

  try {
    await withHubCreateLock(joinedId, async () => {
      // Fast path: niente force-fetch prima del create (rallentava e abortiva penta–octa).
      const spawnParentId = getPublicVoiceHubCategoryId(client, hub);
      await refreshParentChannelsCache(guild, spawnParentId || hub.parentId, client, { force: false });
      const freshHub = guild.channels.cache.get(joinedId) || hub;
      const groupKey = resolveHubGroupKey(freshHub, client);
      const group = listHubGroupChannels(guild, freshHub, client);
      const nextIndex = nextSpawnSuffixIndex(group, joinedId);
      const spawnName = `${resolveHubSpawnBaseName(freshHub)}${toSuperscriptNumber(nextIndex, MIN_SUFFIX_DIGITS)}`;

      if (!memberStillInVoiceChannel(member, joinedId, guild)) {
        return;
      }

      // Gaming: hub limit 1 (lobby); spawn illimitato. Duo/trio: copia limit hub.
      const spawnUserLimit = isGameVoiceHubChannel(freshHub, client)
        ? Math.max(0, Number(client?.config?.gameVoiceHubs?.spawnUserLimit ?? 0) || 0)
        : Math.max(0, Number(freshHub.userLimit) || 0);

      const createOptions = {
        name: spawnName,
        type: ChannelType.GuildVoice,
        parent: spawnParentId || freshHub.parentId || undefined,
        userLimit: spawnUserLimit,
        bitrate: freshHub.bitrate || undefined,
        rtcRegion: freshHub.rtcRegion || undefined,
        permissionOverwrites: buildSpawnPermissionOverwrites(freshHub, guild),
        reason: `Vocale hub ${freshHub.name}`,
      };
      /* hubSpawnUnderHub3: NON passare position in create — Discord la tratta come slot
         e spesso inserisce SOPRA l'hub; placeSpawnAfterHubGroupTail sistema sotto. */

      const created = await guild.channels.create(createOptions).catch((err?) => {
        global.logger?.warn?.(
          "[publicVoiceHub] create failed:",
          freshHub?.name || joinedId,
          groupKey,
          err?.message || err,
        );
        return null;
      });
      if (!created) return;

      rememberSpawnedChannel(created.id, joinedId);

      // Muovi subito l'utente; posizione/reorder subito dopo (sync).
      let freshMember = await resolveGuildMemberVoiceState(guild, member, uid);
      if (!memberStillInVoiceChannel(freshMember, joinedId, guild)) {
        // Se già finito nello spawn (race), ok; altrimenti cleanup.
        if (!memberStillInVoiceChannel(freshMember, created.id, guild)) {
          await cleanupUnusedSpawnedChannel(created, "Utente non più in lobby hub");
          return;
        }
      } else {
        let moved = false;
        for (let attempt = 0; attempt < 2 && !moved; attempt += 1) {
          freshMember = await resolveGuildMemberVoiceState(guild, freshMember || member, uid);
          if (!memberStillInVoiceChannel(freshMember, joinedId, guild)) break;
          moved = await freshMember.voice
            .setChannel(created)
            .then(() => true)
            .catch((err?) => {
              if (!isUserDisconnectedVoiceError(err)) {
                global.logger?.warn?.(
                  "[publicVoiceHub] move failed:",
                  freshHub?.name || joinedId,
                  attempt,
                  err?.message || err,
                );
              }
              return false;
            });
          if (!moved) await pauseMs(200);
        }
        if (!moved && !memberStillInVoiceChannel(freshMember, created.id, guild)) {
          await cleanupUnusedSpawnedChannel(created, "Move utente fallito");
          return;
        }
      }

      /* hubSpawnUnderHub3: solo place sotto coda gruppo + reorder categoria voice-only.
         applyHubSpawnCreatePosition(position pre-create) riposizionava con raw stale → SOPRA l'hub. */
      await placeSpawnAfterHubGroupTail(
        created,
        freshHub,
        guild,
        client,
        `Vocale hub ${freshHub.name} spawn ${spawnName}`,
      ).catch(() => null);
      await reorderLimitateCategory(guild, client, {
        parentId: spawnParentId || freshHub.parentId,
        forceFetch: true,
        quick: false,
      }).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] sync reorder failed:", err?.message || err);
      });

      const verify = verifyHubGroupChannelOrder(guild, freshHub, client);
      if (!verify.ok) {
        global.logger?.warn?.(
          "[publicVoiceHub] spawn still misplaced after sync reorder:",
          spawnName,
          verify.misplaced?.map((row?) => `${row.name}@${row.idx}->${row.expectedIdx}`).join("; "),
        );
        await placeSpawnAfterHubGroupTail(created, freshHub, guild, client, "hub spawn retry under group").catch(
          () => null,
        );
        await reorderLimitateCategory(guild, client, {
          parentId: spawnParentId || freshHub.parentId,
          forceFetch: true,
        }).catch(() => null);
      }

      scheduleHubSpawnFollowUp(guild, client, freshHub, created.id);
    });
  } finally {
    userCreateLocks.delete(uid);
  }
}

async function handlePublicVoiceHubEmpty(oldState?, newState?, client?) {
  const leftId = String(oldState.channelId || "");
  if (!leftId || isPublicVoiceHubId(leftId, client, oldState.guild || newState.guild)) return;
  if (String(newState.channelId || "") === leftId) return;

  const guild = oldState.guild || newState.guild;
  let channel = oldState.channel;
  if (!channel?.isVoiceBased?.()) {
    channel =
      guild?.channels?.cache?.get(leftId) ||
      (await guild?.channels?.fetch?.(leftId).catch(() => null));
  }
  if (!channel?.isVoiceBased?.() || !isSpawnedHubChannel(channel, client)) return;

  if ((await countHumanMembersResolved(channel)) > 0) return;
  if (hasBotMemberInChannel(channel)) return;
  scheduleSpawnedChannelDelete(channel, client);
}

async function sweepEmptySpawnedHubChannels(client?) {
  if (
    client?.config?.publicVoiceHubs?.enabled === false &&
    client?.config?.gameVoiceHubs?.enabled === false
  ) {
    return 0;
  }
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return 0;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return 0;

  let queued = 0;
  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    for (const ch of listHubGroupChannels(guild, hub, client)) {
      if (!isHubGroupSpawnChannel(ch, hub, client)) continue;
      rememberSpawnedChannel(ch.id, hubId);
      if ((await countHumanMembersResolved(ch)) > 0) continue;
      if (hasBotMemberInChannel(ch)) continue;
      scheduleSpawnedChannelDelete(ch, client);
      queued += 1;
    }
  }
  return queued;
}

export = {
  getHubChannelIds,
  getDuoHubChannelIds,
  getGameVoiceHubCategoryId,
  isGameVoiceHubChannel,
  isGameVoiceHubsEnabled,
  getPublicVoiceHubCategoryId,
  isPublicVoiceHubId,
  isSpawnedHubChannel,
  stripVoiceSuffix,
  voiceHubGroupKey,
  resolveHubGroupKey,
  resolveHubSpawnBaseName,
  isHubGroupSpawnChannel,
  parseVoiceSuffixIndex,
  toSuperscriptNumber,
  handlePublicVoiceHubJoin,
  handlePublicVoiceHubEmpty,
  recoverPublicVoiceHubOnStartup,
  ensurePublicVoiceHubChannelsOnReady,
  startPublicVoiceHubSetup,
  sweepEmptySpawnedHubChannels,
  buildSpawnPermissionOverwrites,
  hubLobbyRoleIds,
  resolveInsertSlot,
  resolveInsertPosition,
  placeSpawnAfterHubGroupTail,
  reorderLimitateCategory,
  buildLimitateCategoryDesiredOrder,
  ensureHubGroupChannelOrder,
  realignAllPublicVoiceHubGroups,
  realignPublicVoiceHubGroupsOnStartup,
  refreshParentChannelsCache,
  verifyHubGroupChannelOrder,
  buildDesiredSiblingsWithHubSpawns,
  computeCategoryPositionUpdates,
};