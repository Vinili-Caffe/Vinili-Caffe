const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { botPhotoCdnUrl } = require("../../Utils/Discord/botPhotosCdn") as typeof import("../../Utils/Discord/botPhotosCdn");
const BASILISK_IMAGE_URL = botPhotoCdnUrl("balisco.gif");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { HOUSES, HOUSE_META } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { housePointPeriodKey } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const BASILISK_STATE_KEY = "hogwartsBasiliskScope";
const PHOENIX_PET_ID = "mini-phoenix-pet";
const HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID = "__event__";
const HOUSE_CHANNEL_KEYS = Object.freeze({ gryffindor: "hogwartsHouseGryffindor", hufflepuff: "hogwartsHouseHufflepuff", ravenclaw: "hogwartsHouseRavenclaw", slytherin: "hogwartsHouseSlytherin" });
const SCOPE_GLOBAL = "global";
const SCOPE_HOUSE = "house";
const scopeStateByClient = new WeakMap();
let basiliskPersistTimer = null;
let basiliskPersistClient = null;

function snapshotScopeSlice(state?, scope?) {
  const base = {
    recent: Array.isArray(state?.recent) ? state.recent.slice(-8) : [],
    lastStrikeAt: Math.floor(Number(state?.lastStrikeAt) || 0),
    struckUserIds: Array.isArray(state?.struckUserIds) ? state.struckUserIds.map(String).filter(Boolean) : [],
    struckPeriodKey: String(state?.struckPeriodKey || ""),
  };
  if (scope === SCOPE_HOUSE) {
    const curses: Record<string, any> = {};
    const raw = state?.persistentCurses && typeof state.persistentCurses === "object" ? state.persistentCurses : {};
    for (const [houseId, row] of Object.entries(raw)) {
      const normalized = normalizePersistentCurseRow(row);
      if (normalized) curses[String(houseId)] = normalized;
    }
    return { ...base, persistentCurses: curses };
  }
  return {
    ...base,
    persistentCurse: normalizePersistentCurseRow(state?.persistentCurse) || null,
  };
}

function schedulePersistBasiliskScopeState(client?) {
  if (!client) return;
  basiliskPersistClient = client;
  if (basiliskPersistTimer) return;
  basiliskPersistTimer = setTimeout(() => {
    basiliskPersistTimer = null;
    void persistBasiliskScopeState(basiliskPersistClient);
  }, 400);
  basiliskPersistTimer.unref?.();
}

async function persistBasiliskScopeState(client?) {
  if (!client) return;
  const bag = getScopeBag(client);
  await setBotState(BASILISK_STATE_KEY, {
    global: snapshotScopeSlice(bag.global, SCOPE_GLOBAL),
    house: snapshotScopeSlice(bag.house, SCOPE_HOUSE),
  }).catch((err?) => {
    global.logger?.warn?.("[BASILISK] persist state failed:", err?.message || err);
  });
}

async function hydrateBasiliskScopeState(client?) {
  if (!client) return;
  const bag = getScopeBag(client);
  if (bag.__hydrated) return;
  bag.__hydrated = true;
  const stored = await getBotState(BASILISK_STATE_KEY, null);
  if (!stored || typeof stored !== "object") return;

  const globalStored = stored.global;
  if (globalStored && typeof globalStored === "object") {
    const g = getScopeState(client, SCOPE_GLOBAL);
    if (Array.isArray(globalStored.recent)) g.recent = globalStored.recent.slice(-8);
    g.lastStrikeAt = Math.floor(Number(globalStored.lastStrikeAt) || 0);
    g.persistentCurse = normalizePersistentCurseRow(globalStored.persistentCurse);
    if (Array.isArray(globalStored.struckUserIds)) g.struckUserIds = globalStored.struckUserIds.map(String).filter(Boolean);
    g.struckPeriodKey = String(globalStored.struckPeriodKey || "");
  }

  const houseStored = stored.house;
  if (houseStored && typeof houseStored === "object") {
    const h = getScopeState(client, SCOPE_HOUSE);
    if (Array.isArray(houseStored.recent)) h.recent = houseStored.recent.slice(-8);
    h.lastStrikeAt = Math.floor(Number(houseStored.lastStrikeAt) || 0);
    if (Array.isArray(houseStored.struckUserIds)) h.struckUserIds = houseStored.struckUserIds.map(String).filter(Boolean);
    h.struckPeriodKey = String(houseStored.struckPeriodKey || "");
    h.persistentCurses = {};
    const raw = houseStored.persistentCurses && typeof houseStored.persistentCurses === "object" ? houseStored.persistentCurses : {};
    for (const [houseId, row] of Object.entries(raw)) {
      const normalized = normalizePersistentCurseRow(row);
      if (normalized) h.persistentCurses[String(houseId)] = normalized;
    }
  }
}

function getScopeBag(client?) {
  let bag = scopeStateByClient.get(client);
  if (!bag) {
    bag = {
      global: { recent: [], lastStrikeAt: 0, persistentCurse: null, struckUserIds: [], struckPeriodKey: "" },
      house: { recent: [], lastStrikeAt: 0, persistentCurses: {}, struckUserIds: [], struckPeriodKey: "" },
    };
    scopeStateByClient.set(client, bag);
  }
  return bag;
}

function normalizeHouseId(houseId?) {
  const hid = String(houseId || "").trim().toLowerCase();
  return HOUSES.includes(hid) ? hid : "";
}

function isMainChatMinigameCfg(cfg?) {
  const chatId = String(IDs.channels?.chat || "").trim();
  const channelId = String(cfg?.channelId || "").trim();
  return Boolean(chatId && channelId === chatId);
}

function persistentCurseAppliesToMinigame(curse?, cfg?, scope?) {
  if (!curse) return false;
  if (scope === SCOPE_HOUSE) {
    const currentHouseId = resolveStrikeHouseIdForMinigame(cfg);
    const curseHouseId = normalizeHouseId(curse.announceHouseId);
    return Boolean(currentHouseId && curseHouseId && currentHouseId === curseHouseId);
  }
  return isMainChatMinigameCfg(cfg);
}

function normalizePersistentCurseRow(row?) {
  if (!row) return null;
  const remaining = Math.floor(Number(row.remainingMinigames) || 0);
  const announceHouseId = normalizeHouseId(row.announceHouseId);
  const blockedUserIds = (Array.isArray(row.blockedUserIds) ? row.blockedUserIds : [])
    .map((uid?) => String(uid || "").trim())
    .filter(Boolean);
  if (remaining <= 0 || !announceHouseId || !blockedUserIds.length) return null;
  return { ...row, announceHouseId, blockedUserIds, remainingMinigames: remaining };
}

function listActivePersistentCurses(client?, scope = SCOPE_GLOBAL) {
  if (scope === SCOPE_HOUSE) {
    const map = getScopeState(client, scope).persistentCurses || {};
    return HOUSES.map((houseId?) => normalizePersistentCurseRow(map[houseId])).filter(Boolean);
  }
  const row = normalizePersistentCurseRow(getScopeState(client, scope).persistentCurse);
  return row ? [row] : [];
}

function getScopeState(client?, scope?) {
  const bag = getScopeBag(client);
  return scope === SCOPE_HOUSE ? bag.house : bag.global;
}

function safeInt(value?, fallback?, min?, max?) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function randomBetween(min?, max?) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function parseBasiliskCfgRaw(raw?) {
  if (!raw || raw.enabled === false) return null;
  return {
    chancePercent: Math.min(100, Math.max(0, Number(raw.chancePercent) || 2)),
    wholeHouseChancePercent: Math.min(100, Math.max(0, Number(raw.wholeHouseChancePercent) || 0.35)),
    persistentPlayersChancePercent: Math.min(100, Math.max(0, Number(raw.persistentPlayersChancePercent) || 2.5)),
    persistentMinigamesMin: safeInt(raw.persistentMinigamesMin, 4, 2, 8),
    persistentMinigamesMax: safeInt(raw.persistentMinigamesMax, 5, 2, 10),
    blockedPlayerCount: Math.min(10, Math.max(1, Math.floor(Number(raw.blockedPlayerCount ?? raw.blockedCount) || 3))),
    announceDelayMs: Math.max(0, Math.min(20_000, Math.floor(Number(raw.announceDelayMs) || 5000))),
    phoenixCureChancePercent: Math.min(100, Math.max(0, Number(raw.phoenixCureChancePercent) || 6)),
    avoidRepeatStrikeHouses: Math.min(3, Math.max(0, Math.floor(Number(raw.avoidRepeatStrikeHouses ?? raw.avoidRepeatAnnounceHouses) || 2))),
    minGapBetweenStrikesMs: Math.max(0, Math.floor(Number(raw.minGapBetweenStrikesMs) || 0)),
    onlyDuringHogwartsEvent: raw.onlyDuringHogwartsEvent !== false,
  };
}

function readBasiliskCfg(client?, scope = SCOPE_GLOBAL) {
  const root = client?.config?.minigames || {};
  const raw = scope === SCOPE_HOUSE
    ? (root.hogwartsHouseBasilisk || root.hogwartsBasilisk)
    : root.hogwartsBasilisk;
  return parseBasiliskCfgRaw(raw);
}

function resolveBasiliskScope(cfg?) {
  if (isHouseChannelMinigameCfg(cfg)) return SCOPE_HOUSE;
  const chatId = String(IDs.channels?.chat || "").trim();
  const channelId = String(cfg?.channelId || "").trim();
  if (chatId && channelId === chatId) return SCOPE_GLOBAL;
  return "";
}

function isBasiliskFeatureActive(client?, scope = SCOPE_GLOBAL) {
  const cfg = readBasiliskCfg(client, scope);
  if (!cfg) return false;
  if (!cfg.onlyDuringHogwartsEvent) return true;
  const eventCfg = resolveHogwartsEventConfig(client);
  if (!eventCfg?.enabled) return false;
  const now = Date.now();
  const start = Number(eventCfg.sortingStartMs ?? eventCfg.startMs);
  const end = Number(eventCfg.endMs);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}

function passBasiliskMinGap(client?, cfg?, scope = SCOPE_GLOBAL) {
  const minGap = Math.max(0, Number(cfg?.minGapBetweenStrikesMs) || 0);
  if (minGap <= 0) return true;
  const lastAt = Math.floor(Number(getScopeState(client, scope).lastStrikeAt) || 0);
  return !(lastAt > 0 && Date.now() - lastAt < minGap);
}

function rollBasiliskNormal(client?, cfg?) {
  if (!cfg || !isBasiliskFeatureActive(client)) return false;
  return Math.random() * 100 < cfg.chancePercent;
}

function rollBasiliskWholeHouse(client?, cfg?) {
  if (!cfg || !isBasiliskFeatureActive(client)) return false;
  return Math.random() * 100 < cfg.wholeHouseChancePercent;
}

function rollBasiliskPersistentPlayers(client?, cfg?) {
  if (!cfg || !isBasiliskFeatureActive(client)) return false;
  return Math.random() * 100 < cfg.persistentPlayersChancePercent;
}

function rollBasilisk(client?, scope = SCOPE_GLOBAL) {
  const cfg = readBasiliskCfg(client, scope);
  if (!cfg || !passBasiliskMinGap(client, cfg, scope)) return false;
  return rollBasiliskNormal(client, cfg);
}

function hogwartsEventKey(client?) {
  return String(resolveHogwartsEventConfig(client)?.eventKey || "hogwarts").trim() || "hogwarts";
}

function resolveHouseChannelId(houseId?) {
  const hid = String(houseId || "").trim().toLowerCase();
  const key = HOUSE_CHANNEL_KEYS[hid];
  if (!key) return "";
  return String(IDs.channels?.[key] || "").trim();
}

function isHouseMinigameChannelId(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId) return false;
  return HOUSES.some((houseId?) => resolveHouseChannelId(houseId) === chId);
}

function isHouseChannelMinigameCfg(cfg?) {
  if (!cfg) return false;
  if (cfg.hogwartsHouseChannelSpawn) return true;
  if (cfg.hogwartsHouseChannelMeta && typeof cfg.hogwartsHouseChannelMeta === "object") return true;
  const channelId = String(cfg.channelId || "").trim();
  return isHouseMinigameChannelId(channelId);
}

function resolveStrikeHouseIdForMinigame(cfg?) {
  if (!isHouseChannelMinigameCfg(cfg)) return "";
  const fromMeta = String(cfg.hogwartsHouseChannelMeta?.houseId || cfg.hogwartsHouseChannelMeta?.soloHouseId || "").trim().toLowerCase();
  if (fromMeta && HOUSES.includes(fromMeta)) return fromMeta;
  const channelId = String(cfg.channelId || "").trim();
  for (const houseId of HOUSES) {
    if (resolveHouseChannelId(houseId) === channelId) return houseId;
  }
  return "";
}

function isBasiliskEligibleMinigame(cfg?) {
  if (!cfg) return false;
  const channelId = String(cfg.channelId || "").trim();
  if (!channelId) return false;
  if (isHouseChannelMinigameCfg(cfg)) return true;
  const chatId = String(IDs.channels?.chat || "").trim();
  return Boolean(chatId && channelId === chatId);
}

function houseLabel(houseId?) {
  return HOUSE_META[String(houseId || "").trim()]?.label || houseId || "casa";
}

function readMinigameWins(profile?, periodKey?) {
  return Math.max(0, Math.floor(Number(profile?.profile?.events?.hogwarts?.shopBoostUsage?.byPeriod?.[periodKey]?.minigameWins) || 0));
}

function shuffle(list?) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

async function resolveGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds) return null;
  return client.guilds.cache.get(gid) || client.guilds.fetch(gid).catch(() => null);
}

async function filterUserIdsInGuild(client?, guildId?, userIds?) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
    .map((uid?) => String(uid || "").trim())
    .filter(Boolean))];
  if (!ids.length) return [];
  const guild = await resolveGuild(client, guildId);
  if (!guild) return [];
  const present = [];
  const missing = [];
  for (const uid of ids) {
    if (guild.members.cache.has(uid)) present.push(uid);
    else missing.push(uid);
  }
  for (const uid of missing) {
    const member = await guild.members.fetch(uid).catch(() => null);
    if (member) present.push(uid);
  }
  return present;
}

function pickTopRanked(rows?, count?) {
  const sorted = rows.slice().sort((a?, b?) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  if (!sorted.length) return [];
  if (sorted.every((row?) => row.score <= 0)) return [];
  const picked = [];
  let idx = 0;
  while (picked.length < count && idx < sorted.length) {
    const score = sorted[idx].score;
    const tied = sorted.filter((row?) => row.score === score);
    const shuffled = shuffle(tied);
    for (const row of shuffled) {
      if (picked.length >= count) break;
      if (!picked.some((p?) => p.id === row.id)) picked.push(row);
    }
    idx += tied.length;
  }
  return picked.slice(0, count);
}

async function countSortedMembersInHouse(client?, guildId?, houseId?) {
  const gid = String(guildId || "").trim();
  const hid = String(houseId || "").trim().toLowerCase();
  if (!gid || !HOUSES.includes(hid)) return 0;
  const eventKey = hogwartsEventKey(client);
  const count = await SiteDocument.countDocuments({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
    guildId: gid,
    dedupeKey: eventKey,
    status: hid,
  }).catch(() => 0);
  return Math.max(0, Math.floor(Number(count) || 0));
}

function syncStruckUsersPeriod(state?) {
  const periodKey = String(housePointPeriodKey()?.key || "").trim();
  if (!periodKey) return;
  if (state.struckPeriodKey !== periodKey) {
    state.struckUserIds = [];
    state.struckPeriodKey = periodKey;
  }
}

function recordBasiliskStruckUsers(client?, scope?, userIds?) {
  const state = getScopeState(client, scope);
  syncStruckUsersPeriod(state);
  const incoming = (Array.isArray(userIds) ? userIds : [])
    .map((uid?) => String(uid || "").trim())
    .filter(Boolean);
  if (!incoming.length) return;
  const merged = new Set([...(state.struckUserIds || []), ...incoming]);
  state.struckUserIds = [...merged];
  schedulePersistBasiliskScopeState(client);
}

function getCrossScopeBasiliskExcludeUserIds(client?, scope?) {
  const otherScope = scope === SCOPE_HOUSE ? SCOPE_GLOBAL : SCOPE_HOUSE;
  const state = getScopeState(client, otherScope);
  syncStruckUsersPeriod(state);
  const excluded = new Set(state.struckUserIds || []);
  if (otherScope === SCOPE_GLOBAL) {
    const persistent = readActivePersistentCurse(client, SCOPE_GLOBAL);
    for (const uid of persistent?.blockedUserIds || []) {
      const id = String(uid || "").trim();
      if (id) excluded.add(id);
    }
  } else {
    for (const curse of listActivePersistentCurses(client, SCOPE_HOUSE)) {
      for (const uid of curse.blockedUserIds || []) {
        const id = String(uid || "").trim();
        if (id) excluded.add(id);
      }
    }
  }
  return excluded;
}

async function resolveTopMinigamePlayersInHouse(client?, guildId?, houseId?, count?, excludeUserIds = null) {
  const gid = String(guildId || "").trim();
  const hid = String(houseId || "").trim().toLowerCase();
  if (!gid || !HOUSES.includes(hid)) return [];
  const eventKey = hogwartsEventKey(client);
  const periodKey = String(housePointPeriodKey()?.key || "").trim();
  const sortingRows = await SiteDocument.find({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
    guildId: gid,
    dedupeKey: eventKey,
    status: hid,
  })
    .select("userId")
    .lean()
    .catch(() => []);
  const userIds = sortingRows.map((row?) => String(row?.userId || "").trim()).filter(Boolean);
  if (!userIds.length) return [];
  const guildMemberIds = await filterUserIdsInGuild(client, gid, userIds);
  if (!guildMemberIds.length) return [];
  const winsPath = periodKey ? `profile.events.hogwarts.shopBoostUsage.byPeriod.${periodKey}.minigameWins` : "";
  const profiles = await ActivityUserProfile.find({ guildId: gid, userId: { $in: guildMemberIds } })
    .select(winsPath ? `userId ${winsPath}` : "userId")
    .lean()
    .catch(() => []);
  const ranked = profiles.map((profile?) => ({
    id: String(profile?.userId || "").trim(),
    score: periodKey ? readMinigameWins(profile, periodKey) : 0,
  }));
  const exclude = excludeUserIds instanceof Set
    ? excludeUserIds
    : new Set((Array.isArray(excludeUserIds) ? excludeUserIds : []).map((uid?) => String(uid || "").trim()).filter(Boolean));
  const eligible = exclude.size ? ranked.filter((row?) => row.id && !exclude.has(row.id)) : ranked;
  return pickTopRanked(eligible, count);
}

function pickRandomStrikeHouse(client?, preferredHouseId = "", scope = SCOPE_GLOBAL) {
  const preferred = String(preferredHouseId || "").trim().toLowerCase();
  if (preferred && HOUSES.includes(preferred)) {
    getScopeState(client, scope).lastStrikeAt = Date.now();
    schedulePersistBasiliskScopeState(client);
    return preferred;
  }
  const cfg = readBasiliskCfg(client, scope);
  const state = getScopeState(client, scope);
  const avoid = new Set(state.recent.slice(-Math.max(0, cfg?.avoidRepeatStrikeHouses || 0)));
  let pool = HOUSES.filter((houseId?) => !avoid.has(houseId));
  if (!pool.length) pool = HOUSES.slice();
  const picked = pool[Math.floor(Math.random() * pool.length)] || HOUSES[0];
  state.recent = [...state.recent, picked].slice(-8);
  state.lastStrikeAt = Date.now();
  schedulePersistBasiliskScopeState(client);
  return picked;
}

function resolveMinigameLocationLabel(cfg?) {
  const channelId = String(cfg?.channelId || IDs.channels?.chat || "").trim();
  return channelId ? `in <#${channelId}>` : "nella chat";
}

function resolveStrikeHouseRoleId(client?, houseId?) {
  try {
    const { resolveHouseRoleId } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
    return String(resolveHouseRoleId(client, houseId) || "").trim();
  } catch (_) {
    return "";
  }
}

function buildBasiliskMentionContent(plan?, client?) {
  if (plan?.mode === "whole_house") {
    const houseId = String(plan.announceHouseId || "").trim();
    const label = houseLabel(houseId);
    const roleId = client ? resolveStrikeHouseRoleId(client, houseId) : "";
    const houseTag = roleId ? `<@&${roleId}>` : `**${label}**`;
    return `<:VC_gothsnake:1512513984283021413> ${houseTag} — **tutta la casata è pietrificata dal Basilisco.**`;
  }
  if (plan?.mode === "persistent_players" || plan?.mode === "players") {
    const ids = (plan.blockedUserIds || []).map((uid?) => String(uid || "").trim()).filter(Boolean);
    if (!ids.length) return "";
    const rounds = Math.max(1, Math.floor(Number(plan.remainingMinigames) || 0));
    if (plan.mode === "persistent_players" && rounds > 1) {
      return `<:VC_gothsnake:1512513984283021413> **Pietrificati dal Basilisco** (${rounds} minigiochi): ${ids.map((uid?) => `<@${uid}>`).join(" ")}`;
    }
    return `<:VC_gothsnake:1512513984283021413> **Pietrificati dal Basilisco:** ${ids.map((uid?) => `<@${uid}>`).join(" ")}`;
  }
  const ids = (plan.blockedUserIds || []).map((uid?) => String(uid || "").trim()).filter(Boolean);
  if (!ids.length) return "";
  return `<:VC_gothsnake:1512513984283021413> **Pietrificati dal Basilisco:** ${ids.map((uid?) => `<@${uid}>`).join(" ")}`;
}

function resolveBasiliskImageUrl() {
  return BASILISK_IMAGE_URL || "";
}

function buildBasiliskEmbed(plan?, cfg?, imageUrl = "") {
  const houseId = String(plan.announceHouseId || "").trim();
  const label = houseLabel(houseId);
  const meta = HOUSE_META[houseId];
  const embed = new EmbedBuilder().setColor(meta?.primary || "#1a472a");
  const location = plan.locationLabel || resolveMinigameLocationLabel(cfg);
  const blockedCount = (plan.blockedUserIds || []).length;
  const inHouseChannel = isHouseChannelMinigameCfg(cfg);
  const isWholeHouse = plan.mode === "whole_house";
  const isPersistent = plan.mode === "persistent_players";
  const roundsLeft = Math.max(1, Math.floor(Number(plan.remainingMinigames) || plan.totalMinigames || 1));
  const title = isWholeHouse
    ? (inHouseChannel
      ? "<:VC_gothsnake:1512513984283021413> Il Basilisco ferma la casata!"
      : "<:VC_gothsnake:1512513984283021413> Il Basilisco pietrifica una casata!")
    : isPersistent
      ? (inHouseChannel
        ? "<:VC_gothsnake:1512513984283021413> Il Basilisco maledice la casata!"
        : "<:VC_gothsnake:1512513984283021413> Il Basilisco scatena una maledizione!")
      : (inHouseChannel
        ? "<:VC_gothsnake:1512513984283021413> Il Basilisco colpisce la casata!"
        : "<:VC_gothsnake:1512513984283021413> Il Basilisco colpisce la chat!");
  let bodyLines;
  if (isWholeHouse) {
    bodyLines = [
      plan.skipMinigame
        ? `Uno sguardo gelido attraversa ${location}.`
        : `Uno sguardo gelido precede il minigioco ${location}.`,
      "",
      `Il Basilisco ha **pietrificato tutta ${label}**: nessun membro smistato della casata può partecipare${plan.skipMinigame ? "." : " a questo round."}`,
    ];
    if (plan.skipMinigame) {
      bodyLines.push("", "🚫 Il minigioco programmato viene **saltato**.");
    } else {
      bodyLines.push("", "⏳ Il blocco dura **fino alla fine del minigioco** in corso.");
    }
  } else if (isPersistent) {
    bodyLines = [
      `Uno sguardo gelido precede il minigioco ${location}.`,
      "",
      inHouseChannel
        ? `Il Basilisco ha **pietrificato i ${blockedCount} compagni più attivi** ai minigiochi di **${label}**: resteranno bloccati per **${roundsLeft} minigiochi** nella **sala comune di ${label}**.`
        : `Il Basilisco ha maledetto **${label}**: i **${blockedCount} più attivi** ai minigiochi della **chat principale** resteranno **pietrificati per ${roundsLeft} minigiochi** consecutivi in **#chat**.`,
      "",
      "⏳ La maledizione persiste su **più round** — finché non si esaurisce.",
    ];
  } else {
    bodyLines = [
      `Uno sguardo gelido precede il minigioco ${location}.`,
      "",
      inHouseChannel
        ? `Il Basilisco ha colpito **${label}**: i **${blockedCount} compagni più attivi** ai minigiochi della **sala comune** sono **pietrificati** e non possono partecipare a questo round.`
        : `Il Basilisco ha colpito **${label}**: i **${blockedCount} compagni più attivi** ai minigiochi della **chat principale** sono **pietrificati** e non possono partecipare a questo round.`,
      "",
      "⏳ Il blocco dura **fino alla fine del minigioco** in corso.",
    ];
  }
  embed.setTitle(title).setDescription(bodyLines.join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

async function prunePersistentCurseGuildMembers(client?, guildId?, scope = SCOPE_GLOBAL, houseId = "") {
  if (scope === SCOPE_HOUSE) {
    const hid = normalizeHouseId(houseId);
    if (!hid) return null;
    const state = getScopeState(client, scope);
    const row = state.persistentCurses?.[hid];
    if (!row) return null;
    const blockedUserIds = await filterUserIdsInGuild(client, guildId, row.blockedUserIds || []);
    if (!blockedUserIds.length) {
      delete state.persistentCurses[hid];
      schedulePersistBasiliskScopeState(client);
      return null;
    }
    if (blockedUserIds.length !== (row.blockedUserIds || []).length) {
      row.blockedUserIds = blockedUserIds;
      schedulePersistBasiliskScopeState(client);
    }
    return row;
  }

  const state = getScopeState(client, scope);
  const row = state.persistentCurse;
  if (!row) return null;
  const blockedUserIds = await filterUserIdsInGuild(client, guildId, row.blockedUserIds || []);
  if (!blockedUserIds.length) {
    state.persistentCurse = null;
    schedulePersistBasiliskScopeState(client);
    return null;
  }
  if (blockedUserIds.length !== (row.blockedUserIds || []).length) {
    row.blockedUserIds = blockedUserIds;
    schedulePersistBasiliskScopeState(client);
  }
  return row;
}

function clearPersistentCurse(client?, scope = SCOPE_GLOBAL, houseId = "") {
  if (scope === SCOPE_HOUSE) {
    const hid = normalizeHouseId(houseId);
    if (!hid) return;
    const state = getScopeState(client, scope);
    if (state.persistentCurses?.[hid]) delete state.persistentCurses[hid];
    schedulePersistBasiliskScopeState(client);
    return;
  }
  getScopeState(client, scope).persistentCurse = null;
  schedulePersistBasiliskScopeState(client);
}

function readActivePersistentCurse(client?, scope = SCOPE_GLOBAL, houseId = "") {
  if (scope === SCOPE_HOUSE) {
    const hid = normalizeHouseId(houseId);
    if (!hid) return null;
    const row = normalizePersistentCurseRow(getScopeState(client, scope).persistentCurses?.[hid]);
    if (!row) clearPersistentCurse(client, scope, hid);
    return row;
  }
  const row = normalizePersistentCurseRow(getScopeState(client, scope).persistentCurse);
  if (!row) clearPersistentCurse(client, scope);
  return row;
}

function startPersistentCurse(client?, payload?, scope = SCOPE_GLOBAL) {
  if (!client || !payload?.announceHouseId || !payload.blockedUserIds?.length) return null;
  const announceHouseId = normalizeHouseId(payload.announceHouseId);
  if (!announceHouseId) return null;
  const total = Math.max(1, Math.floor(Number(payload.totalMinigames) || 1));
  const row = {
    announceHouseId,
    blockedUserIds: payload.blockedUserIds.map((uid?) => String(uid || "").trim()).filter(Boolean),
    remainingMinigames: total,
    totalMinigames: total,
    startedAtMs: Date.now(),
  };
  if (scope === SCOPE_HOUSE) {
    const state = getScopeState(client, scope);
    if (!state.persistentCurses || typeof state.persistentCurses !== "object") state.persistentCurses = {};
    state.persistentCurses[announceHouseId] = row;
  } else {
    getScopeState(client, scope).persistentCurse = row;
  }
  schedulePersistBasiliskScopeState(client);
  return row;
}

function buildPlanFromPersistentCurse(curse?, cfg?, scope = SCOPE_GLOBAL) {
  if (!curse) return null;
  return {
    scope,
    mode: "persistent_players",
    announceHouseId: curse.announceHouseId,
    blockedHouseIds: [],
    blockedUserIds: curse.blockedUserIds.slice(),
    skipMinigame: false,
    locationLabel: resolveMinigameLocationLabel(cfg),
    remainingMinigames: curse.remainingMinigames,
    totalMinigames: curse.totalMinigames,
    shouldAnnounce: false,
  };
}

function consumePersistentCurseRound(client?, scope = SCOPE_GLOBAL, houseId = "") {
  const active = readActivePersistentCurse(client, scope, houseId);
  if (!active) return null;
  const hid = scope === SCOPE_HOUSE ? normalizeHouseId(houseId || active.announceHouseId) : "";
  const state = getScopeState(client, scope);
  const row = scope === SCOPE_HOUSE ? state.persistentCurses?.[hid] : state.persistentCurse;
  if (!row) return null;
  row.remainingMinigames = Math.max(0, Math.floor(Number(row.remainingMinigames) || 0) - 1);
  if (row.remainingMinigames <= 0) {
    const ended = { ...row, remainingMinigames: 0 };
    clearPersistentCurse(client, scope, hid);
    return ended;
  }
  schedulePersistBasiliskScopeState(client);
  return null;
}

function buildPersistentCurseEndEmbed(houseId?, inHouseChannel = false) {
  const label = houseLabel(houseId);
  const meta = HOUSE_META[houseId];
  return new EmbedBuilder()
    .setColor(meta?.primary || "#1a472a")
    .setTitle("<:VC_gothsnake:1512513984283021413> Maledizione del Basilisco terminata")
    .setDescription(
      inHouseChannel
        ? `<a:VC_pixeltime:1482535344103620771> La pietrificazione sui migliori di **${label}** nella **sala comune** è **scaduta**: possono di nuovo giocare ai minigiochi di casata.`
        : `<a:VC_pixeltime:1482535344103620771> La maledizione del Basilisco su **${label}** in **chat principale** è **terminata**: i tre più attivi tornano in gioco.`,
    );
}

async function announcePersistentCurseEnd(client?, houseId?, scope = SCOPE_GLOBAL) {
  const hid = String(houseId || "").trim();
  if (!hid) return;
  const mainId = String(IDs.channels?.chat || "").trim();
  const houseChannelId = resolveHouseChannelId(hid);
  if (scope === SCOPE_HOUSE) {
    if (houseChannelId) {
      await sendBasiliskEmbedToChannel(client, houseChannelId, buildPersistentCurseEndEmbed(hid, true));
    }
    return;
  }
  await sendBasiliskEmbedToChannel(client, mainId, buildPersistentCurseEndEmbed(hid, false));
}

async function planBasiliskStrike(client?, cfg?, options: Record<string, any> = {}) {
  await hydrateBasiliskScopeState(client);
  const scope = resolveBasiliskScope(cfg);
  if (!scope) return null;
  if (scope === SCOPE_HOUSE) {
    const { isWithinHouseChannelMinigameHours } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
    if (!isWithinHouseChannelMinigameHours(client)) return null;
  }
  const basiliskCfg = readBasiliskCfg(client, scope);
  if (!basiliskCfg || !isBasiliskFeatureActive(client, scope)) return null;
  const guildId = String(cfg?.guildId || IDs.guilds?.main || "").trim();
  if (!guildId) return null;
  const fixedHouseId = resolveStrikeHouseIdForMinigame(cfg);
  const inHouseChannel = scope === SCOPE_HOUSE;
  const locationLabel = resolveMinigameLocationLabel(cfg);
  if (scope === SCOPE_HOUSE) {
    if (fixedHouseId) {
      await prunePersistentCurseGuildMembers(client, guildId, scope, fixedHouseId);
      const activePersistent = readActivePersistentCurse(client, scope, fixedHouseId);
      if (activePersistent && persistentCurseAppliesToMinigame(activePersistent, cfg, scope)) {
        return buildPlanFromPersistentCurse(activePersistent, cfg, scope);
      }
    }
  } else if (isMainChatMinigameCfg(cfg)) {
    await prunePersistentCurseGuildMembers(client, guildId, scope);
    const activePersistent = readActivePersistentCurse(client, scope);
    if (activePersistent && persistentCurseAppliesToMinigame(activePersistent, cfg, scope)) {
      return buildPlanFromPersistentCurse(activePersistent, cfg, scope);
    }
  }
  if (!passBasiliskMinGap(client, basiliskCfg, scope)) return null;
  if (rollBasiliskWholeHouse(client, basiliskCfg)) {
    const targetHouseId = pickRandomStrikeHouse(client, fixedHouseId, scope);
    if (!targetHouseId) return null;
    const memberCount = await countSortedMembersInHouse(client, guildId, targetHouseId);
    if (memberCount <= 0) return null;
    return {
      scope,
      mode: "whole_house",
      announceHouseId: targetHouseId,
      blockedHouseIds: [targetHouseId],
      blockedUserIds: [],
      skipMinigame: inHouseChannel,
      memberCount,
      locationLabel,
    };
  }
  if (rollBasiliskPersistentPlayers(client, basiliskCfg)) {
    const targetHouseId = pickRandomStrikeHouse(client, fixedHouseId, scope);
    if (!targetHouseId) return null;
    const crossExclude = getCrossScopeBasiliskExcludeUserIds(client, scope);
    const topPlayers = await resolveTopMinigamePlayersInHouse(client, guildId, targetHouseId, basiliskCfg.blockedPlayerCount, crossExclude);
    if (!topPlayers.length) return null;
    const minR = Math.min(basiliskCfg.persistentMinigamesMin, basiliskCfg.persistentMinigamesMax);
    const maxR = Math.max(basiliskCfg.persistentMinigamesMin, basiliskCfg.persistentMinigamesMax);
    const totalMinigames = randomBetween(minR, maxR);
    const blockedUserIds = topPlayers.map((row?) => row.id);
    recordBasiliskStruckUsers(client, scope, blockedUserIds);
    startPersistentCurse(client, { announceHouseId: targetHouseId, blockedUserIds, totalMinigames }, scope);
    return {
      scope,
      mode: "persistent_players",
      announceHouseId: targetHouseId,
      blockedHouseIds: [],
      blockedUserIds,
      skipMinigame: false,
      locationLabel,
      remainingMinigames: totalMinigames,
      totalMinigames,
      shouldAnnounce: true,
    };
  }
  if (!rollBasiliskNormal(client, basiliskCfg)) return null;
  const targetHouseId = pickRandomStrikeHouse(client, fixedHouseId, scope);
  if (!targetHouseId) return null;
  const crossExclude = getCrossScopeBasiliskExcludeUserIds(client, scope);
  const topPlayers = await resolveTopMinigamePlayersInHouse(client, guildId, targetHouseId, basiliskCfg.blockedPlayerCount, crossExclude);
  if (!topPlayers.length) return null;
  const blockedUserIds = topPlayers.map((row?) => row.id);
  recordBasiliskStruckUsers(client, scope, blockedUserIds);
  return {
    scope,
    mode: "players",
    announceHouseId: targetHouseId,
    blockedHouseIds: [],
    blockedUserIds,
    skipMinigame: false,
    locationLabel,
    shouldAnnounce: true,
  };
}

async function sendBasiliskEmbedToChannel(client?, channelId?, embed?) {
  const chId = String(channelId || "").trim();
  if (!chId || !embed) return false;
  const channel = await getClientChannelCached(client, chId);
  if (!channel?.send) return false;
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  return true;
}

function resolveBasiliskAnnounceChannelId(cfg?) {
  if (isHouseChannelMinigameCfg(cfg)) {
    return String(cfg.channelId || "").trim();
  }
  return String(IDs.channels?.chat || cfg?.channelId || "").trim();
}

function buildAnnounceCfgForContext(houseId?, inHouseChannel?) {
  if (inHouseChannel) {
    const channelId = resolveHouseChannelId(houseId);
    return { channelId, hogwartsHouseChannelMeta: { houseId: String(houseId || "").trim() } };
  }
  return { channelId: String(IDs.channels?.chat || "").trim() };
}

function buildBasiliskAllowedMentions(plan?, client?) {
  if (plan?.mode === "whole_house") {
    const roleId = resolveStrikeHouseRoleId(client, plan?.announceHouseId);
    if (roleId) return { roles: [roleId] };
    return { parse: [] };
  }
  const blockedUserIds = (plan?.blockedUserIds || []).map((uid?) => String(uid || "").trim()).filter(Boolean);
  if (blockedUserIds.length) return { users: blockedUserIds };
  return { parse: [] };
}

async function sendBasiliskStrikeToChannel(client?, channelId?, plan?, announceCfg?, options: Record<string, any> = {}) {
  const chId = String(channelId || "").trim();
  if (!chId || !plan) return false;
  const channel = await getClientChannelCached(client, chId);
  if (!channel?.send) return false;
  const imageUrl = options.includeImage === false ? "" : resolveBasiliskImageUrl();
  const embed = buildBasiliskEmbed(plan, announceCfg || { channelId: chId }, imageUrl);
  const mentionContent = buildBasiliskMentionContent(plan, client);
  await channel.send({
    content: mentionContent || undefined,
    embeds: [embed],
    allowedMentions: buildBasiliskAllowedMentions(plan, client),
  }).catch(() => null);
  return true;
}

async function announcePersistentBasiliskStart(client?, plan?) {
  if (!plan?.announceHouseId) return false;
  const scope = plan.scope || SCOPE_GLOBAL;
  const houseId = plan.announceHouseId;
  const mainId = String(IDs.channels?.chat || "").trim();
  const houseChannelId = resolveHouseChannelId(houseId);
  const houseCfg = buildAnnounceCfgForContext(houseId, true);
  if (scope === SCOPE_HOUSE) {
    if (houseChannelId) {
      await sendBasiliskStrikeToChannel(client, houseChannelId, plan, houseCfg, { includeImage: true });
    }
  } else {
    const mainCfg = buildAnnounceCfgForContext(houseId, false);
    await sendBasiliskStrikeToChannel(client, mainId, plan, mainCfg, { includeImage: true });
  }
  const delayMs = Math.max(0, Math.floor(Number(readBasiliskCfg(client, scope)?.announceDelayMs) || 0));
  if (delayMs > 0) {
    await new Promise((resolve?) => {
      const timer = setTimeout(resolve, delayMs);
      timer.unref?.();
    });
  }
  return true;
}

async function announceBasiliskStrike(client?, cfg?, plan?) {
  if (!plan) return false;
  if (plan.mode === "persistent_players" && plan.shouldAnnounce) {
    return announcePersistentBasiliskStart(client, plan);
  }
  const channelId = resolveBasiliskAnnounceChannelId(cfg);
  if (!channelId) return false;
  await sendBasiliskStrikeToChannel(client, channelId, plan, cfg, { includeImage: true });
  const scope = plan.scope || resolveBasiliskScope(cfg) || SCOPE_GLOBAL;
  const delayMs = Math.max(0, Math.floor(Number(readBasiliskCfg(client, scope)?.announceDelayMs) || 0));
  if (delayMs > 0) {
    await new Promise((resolve?) => {
      const timer = setTimeout(resolve, delayMs);
      timer.unref?.();
    });
  }
  return true;
}

function attachBasiliskToGame(game?, plan?) {
  if (!game || !plan) return;
  game.basilisk = {
    scope: plan.scope || SCOPE_GLOBAL,
    mode: plan.mode,
    blockedHouseIds: Array.isArray(plan.blockedHouseIds) ? plan.blockedHouseIds.slice() : [],
    blockedUserIds: (plan.blockedUserIds || []).slice(),
    struckHouseId: plan.announceHouseId || "",
    announceHouseId: plan.announceHouseId || "",
    announceEndOnFinish: plan.announceEndOnFinish === true,
    endedAnnounceHouseId: String(plan.endedAnnounceHouseId || plan.announceHouseId || "").trim(),
    endedAnnounceScope: plan.endedAnnounceScope || plan.scope || SCOPE_GLOBAL,
  };
}

async function maybeAnnouncePersistentCurseEndAfterMinigame(client?, game?) {
  const basilisk = game?.basilisk;
  if (!basilisk?.announceEndOnFinish) return false;
  if (basilisk._endAnnounced) return false;
  basilisk._endAnnounced = true;
  basilisk.announceEndOnFinish = false;
  const houseId = String(basilisk.endedAnnounceHouseId || basilisk.announceHouseId || "").trim();
  if (!houseId) return false;
  const scope = basilisk.endedAnnounceScope || basilisk.scope || SCOPE_GLOBAL;
  await announcePersistentCurseEnd(client, houseId, scope);
  return true;
}

function isBasiliskBlockActiveForGame(game?) {
      return Boolean(game?.basilisk);
}

async function resolvePhoenixPetOwnerIds(guildId?, userIds?) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
    .map((uid?) => String(uid || "").trim())
    .filter(Boolean))];
  if (!ids.length) return new Set();
  const gid = String(guildId || "").trim();
  if (!gid) return new Set();
  const { normalizeShopInventory } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
  const docs = await ActivityUserProfile.find({ guildId: gid, userId: { $in: ids } })
    .select("userId profile.events.hogwarts.shop")
    .lean()
    .catch(() => []);
  const owners = new Set();
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = String(doc?.userId || "").trim();
    if (!uid) continue;
    const inventory = normalizeShopInventory(doc?.profile?.events?.hogwarts?.shop);
    if (String(inventory?.pet?.id || "") === PHOENIX_PET_ID) owners.add(uid);
  }
  return owners;
}

function buildPhoenixBasiliskCureEmbed(curedUserIds?, cfg?) {
  const mentions = curedUserIds.map((uid?) => `<@${uid}>`).join(" ");
  const inHouseChannel = isHouseChannelMinigameCfg(cfg);
  return new EmbedBuilder()
    .setColor("#e25822")
    .setTitle("🐦‍🔥 Il Pulcino di Fenice interviene")
    .setImage("https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExaGJvNmprMTB1MzY0ajFmdW41cnNnbnZuaTVtcWE5bWtjdjdvYWZudyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/DRMTy97vzZY9W/giphy.gif")
    .setDescription(
      [
        "Una **lacrima di fenice** ti ha curato dal veleno del Basilisco…",
        "",
        inHouseChannel
          ? `${mentions} ${curedUserIds.length === 1 ? "è stato liberato" : "sono stati liberati"} dalla maledizione e può di nuovo giocare ai minigiochi di casata.`
          : `${mentions} ${curedUserIds.length === 1 ? "è stato liberato" : "sono stati liberati"} dalla maledizione e può di nuovo giocare in **#chat**.`,
        "",
        "⏳ Il minigioco sta per iniziare.",
      ].join("\n"),
    );
}

async function announcePhoenixBasiliskCure(client?, cfg?, plan?, curedUserIds?) {
  const ids = (Array.isArray(curedUserIds) ? curedUserIds : [])
    .map((uid?) => String(uid || "").trim())
    .filter(Boolean);
  if (!ids.length) return false;
  const channelId = resolveBasiliskAnnounceChannelId(cfg);
  if (!channelId) return false;
  const channel = await getClientChannelCached(client, channelId);
  if (!channel?.send) return false;
  const embed = buildPhoenixBasiliskCureEmbed(ids, cfg);
  await channel.send({
    content: ids.map((uid?) => `<@${uid}>`).join(" "),
    embeds: [embed],
    allowedMentions: { users: ids },
  }).catch(() => null);
  const scope = plan?.scope || resolveBasiliskScope(cfg) || SCOPE_GLOBAL;
  const delayMs = Math.max(0, Math.floor(Number(readBasiliskCfg(client, scope)?.announceDelayMs) || 0));
  if (delayMs > 0) {
    await new Promise((resolve?) => {
      const timer = setTimeout(resolve, delayMs);
      timer.unref?.();
    });
  }
  return true;
}

async function attemptPhoenixBasiliskCure(client?, cfg?, plan?) {
  if (!plan || plan.mode !== "persistent_players" || plan.shouldAnnounce !== false) {
    return { plan, curedUserIds: [], curseCleared: false };
  }
  const scope = plan.scope || resolveBasiliskScope(cfg) || SCOPE_GLOBAL;
  const houseId = normalizeHouseId(plan.announceHouseId);
  const active = scope === SCOPE_HOUSE
    ? readActivePersistentCurse(client, scope, houseId)
    : readActivePersistentCurse(client, scope);
  if (!active) return { plan, curedUserIds: [], curseCleared: false };

  const guildId = String(cfg?.guildId || IDs.guilds?.main || "").trim();
  const blocked = (active.blockedUserIds || []).map((uid?) => String(uid || "").trim()).filter(Boolean);
  if (!blocked.length) return { plan, curedUserIds: [], curseCleared: false };

  const basiliskCfg = readBasiliskCfg(client, scope);
  const chance = Math.min(100, Math.max(0, Number(basiliskCfg?.phoenixCureChancePercent) || 6));
  const phoenixOwners = await resolvePhoenixPetOwnerIds(guildId, blocked);
  const cured = [];
  for (const uid of blocked) {
    if (!phoenixOwners.has(uid)) continue;
    if (Math.random() * 100 < chance) cured.push(uid);
  }
  if (!cured.length) return { plan, curedUserIds: [], curseCleared: false };

  const curedSet = new Set(cured);
  const newBlocked = blocked.filter((uid?) => !curedSet.has(uid));
  if (scope === SCOPE_HOUSE) {
    const state = getScopeState(client, scope);
    const row = state.persistentCurses?.[houseId];
    if (row) row.blockedUserIds = newBlocked;
  } else {
    const row = getScopeState(client, scope).persistentCurse;
    if (row) row.blockedUserIds = newBlocked;
  }
  if (!newBlocked.length) clearPersistentCurse(client, scope, houseId);
  else schedulePersistBasiliskScopeState(client);

  await announcePhoenixBasiliskCure(client, cfg, plan, cured);

  if (!newBlocked.length) {
    return { plan: null, curedUserIds: cured, curseCleared: true };
  }
  return {
    plan: { ...plan, blockedUserIds: newBlocked },
    curedUserIds: cured,
    curseCleared: false,
  };
}

async function isBasiliskBlockedForUser(client?, guildId?, userId?, game?) {
  const basilisk = game?.basilisk;
  if (!basilisk || !isBasiliskBlockActiveForGame(game)) return false;
  const uid = String(userId || "").trim();
  if (!uid) return false;
      if (basilisk.mode === "whole_house") {
    const blockedHouseIds = Array.isArray(basilisk.blockedHouseIds) && basilisk.blockedHouseIds.length
      ? basilisk.blockedHouseIds
      : [String(basilisk.struckHouseId || basilisk.announceHouseId || "").trim()].filter(Boolean);
    if (!blockedHouseIds.length) return false;
    const { resolveSortedHouseForUser } = require("./galeoniEconomyService") as typeof import("./galeoniEconomyService");
    const userHouse = String(await resolveSortedHouseForUser(guildId, uid, client).catch(() => "") || "").trim().toLowerCase();
    return Boolean(userHouse && blockedHouseIds.includes(userHouse));
  }
  return Array.isArray(basilisk.blockedUserIds) && basilisk.blockedUserIds.includes(uid);
}

async function runMinigameStartWithBasilisk(client?, cfg?, gameType?, startFn?, options: Record<string, any> = {}) {
  await hydrateBasiliskScopeState(client);
  const basiliskEligible = isBasiliskEligibleMinigame(cfg);
  const scope = resolveBasiliskScope(cfg);
  if (scope === SCOPE_HOUSE) {
    const houseId = resolveStrikeHouseIdForMinigame(cfg);
    const durationMs = Math.max(30_000, Math.floor(Number(cfg?.hogwartsHouseChannelMeta?.durationMs) || 60_000));
    const { rollHouseBurrobirraForMinigameStart } = require("../Minigames/hogwartsHouseBurrobirraEffectService") as typeof import("../Minigames/hogwartsHouseBurrobirraEffectService");
    await rollHouseBurrobirraForMinigameStart(client, cfg?.channelId, houseId, durationMs).catch(() => false);
  }
  let plan: any = basiliskEligible ? await planBasiliskStrike(client, cfg, { ...options, gameType }) : null;
  if (plan?.mode === "persistent_players" && plan.shouldAnnounce === false) {
    const cure = await attemptPhoenixBasiliskCure(client, cfg, plan);
    if (cure.curseCleared) plan = null;
    else if (cure.plan) plan = cure.plan;
  }
  if (plan?.skipMinigame) {
    if (plan.shouldAnnounce !== false) await announceBasiliskStrike(client, cfg, plan);
    return { started: false, basiliskSkip: true };
  }
  if (plan && plan.shouldAnnounce !== false) {
    await announceBasiliskStrike(client, cfg, plan);
  }
  const result = await startFn();
  const started = result === true || (result && result.started);
  if (!started) return result;
  if (plan) {
    const channelId = String(cfg?.channelId || "").trim();
    const game = typeof options.getActiveGame === "function" ? options.getActiveGame(channelId) : null;
    const planScope = plan.scope || scope || SCOPE_GLOBAL;
    if (plan.mode === "persistent_players") {
      const curseHouseId = normalizeHouseId(plan.announceHouseId);
      const ended = planScope === SCOPE_HOUSE
        ? consumePersistentCurseRound(client, planScope, curseHouseId)
        : consumePersistentCurseRound(client, planScope);
                  if (ended) {
        plan.announceEndOnFinish = true;
        plan.endedAnnounceHouseId = ended.announceHouseId || plan.announceHouseId;
        plan.endedAnnounceScope = planScope;
      }
      if (game) attachBasiliskToGame(game, plan);
    } else if (game) {
      attachBasiliskToGame(game, plan);
    }
  }
  return result;
}

export = { attachBasiliskToGame, filterUserIdsInGuild, hydrateBasiliskScopeState, isBasiliskBlockedForUser, maybeAnnouncePersistentCurseEndAfterMinigame, planBasiliskStrike, announceBasiliskStrike, runMinigameStartWithBasilisk, resolveHouseChannelId };