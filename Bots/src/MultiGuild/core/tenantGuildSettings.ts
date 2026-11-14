const { getBotState, setBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");
const { isMongoReady } = require("../../shared/db/mongoConnect") as typeof import("../../shared/db/mongoConnect");
const { isViniliProtectedGuild, normalizeGuildId } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildTenantSettings.v1";
const DEFAULT_PREFIX = "+";
const PREFIX_MAX_LEN = 5;
/* perfP1: TTL più alto — meno refresh DB sul path messaggi tenant */
const SETTINGS_CACHE_TTL_MS = Math.max(
  4_000,
  Math.min(120_000, Number(process.env.VC_TENANT_SETTINGS_CACHE_TTL_MS || 30_000) || 30_000),
);

let settingsCache = Object.freeze({});
let settingsCacheAt = 0;
let settingsCacheRefreshPromise = null;

function normalizeChannelId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeRoleId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function normalizePrefix(value?) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, prefix: null };
  if (raw.length > PREFIX_MAX_LEN || /\s/.test(raw)) {
    return { ok: false, reason: "invalid_prefix" };
  }
  return { ok: true, prefix: raw };
}

function normalizeBoardsMode(value?) {
  return String(value || "").trim().toLowerCase() === "split" ? "split" : "shared";
}

function readBoardsBlob(row?) {
  if (!row || typeof row !== "object") return {};
  const b = row.b ?? row.boards;
  return b && typeof b === "object" && !Array.isArray(b) ? b : {};
}

function boardsEnabledFromBlob(b?) {
  /* Default OFF: sui tenant la Bacheca si attiva solo dalla dashboard. */
  if (!b || typeof b !== "object") return false;
  if (b.e === false || b.enabled === false) return false;
  if (b.e === true || b.enabled === true) return true;
  /* Legacy: col vecchio default-on bastava impostare un canale senza salvare `e`. */
  const shared = normalizeChannelId(b.s ?? b.sharedChannelId);
  const quote = normalizeChannelId(b.q ?? b.quoteChannelId);
  const repost = normalizeChannelId(b.r ?? b.repostChannelId);
  const clip = normalizeChannelId(b.cl ?? b.clipChannelId);
  const skull = normalizeChannelId(b.sk ?? b.skullChannelId);
  return Boolean(shared || quote || repost || clip || skull);
}

const BOARD_FEATURE_KINDS = Object.freeze(["quote", "repost", "clip", "skull"]);
const BOARD_FEATURE_COMMANDS = Object.freeze({
  quote: Object.freeze(["quote", "myquote"]),
  repost: Object.freeze(["repost", "myrepost"]),
  clip: Object.freeze(["clip", "myclip"]),
  skull: Object.freeze([]),
});

function normalizeBoardFeatureKind(kind?) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "skullboard") return "skull";
  return BOARD_FEATURE_KINDS.includes(k) ? k : null;
}

function defaultBoardFeatures() {
  return { quote: true, repost: true, clip: true, skull: true };
}

function readClipTranscriptionFromBlob(b?) {
  if (!b || typeof b !== "object") return true;
  const raw = b.ct ?? b.clipTranscription;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  return true;
}

function readBoardFeaturesFromBlob(b?) {
  const out = defaultBoardFeatures();
  if (!b || typeof b !== "object") return out;
  const applyFlag = (key?, raw?) => {
    if (raw === false || raw === 0 || raw === "0" || raw === "false") out[key] = false;
    else if (raw === true || raw === 1 || raw === "1" || raw === "true") out[key] = true;
  };
  const nested = b.f && typeof b.f === "object" && !Array.isArray(b.f) ? b.f : null;
  if (nested) {
    applyFlag("quote", nested.q ?? nested.quote);
    applyFlag("repost", nested.r ?? nested.repost);
    applyFlag("clip", nested.c ?? nested.clip);
    applyFlag("skull", nested.k ?? nested.skull ?? nested.skullboard);
  }
  applyFlag("quote", b.fq);
  applyFlag("repost", b.fr);
  applyFlag("clip", b.fc);
  applyFlag("skull", b.fk);
  const long = b.features && typeof b.features === "object" && !Array.isArray(b.features) ? b.features : null;
  if (long) {
    applyFlag("quote", long.quote);
    applyFlag("repost", long.repost);
    applyFlag("clip", long.clip);
    applyFlag("skull", long.skull ?? long.skullboard);
  }
  return out;
}

function encodeBoardFeaturesCompact(features?) {
  const src = features && typeof features === "object" ? features : defaultBoardFeatures();
  const f: Record<string, any> = {};
  if (src.quote === false) f.q = 0;
  if (src.repost === false) f.r = 0;
  if (src.clip === false) f.c = 0;
  if (src.skull === false) f.k = 0;
  return Object.keys(f).length ? f : null;
}

function normalizeBoardFeaturesPatch(raw?) {
  if (raw == null) return { skip: true };
  if (typeof raw !== "object" || Array.isArray(raw)) return { invalid: true };
  const out: Record<string, any> = {};
  let touched = false;
  for (const kind of BOARD_FEATURE_KINDS) {
    if (!Object.prototype.hasOwnProperty.call(raw, kind)) continue;
    out[kind] = raw[kind] !== false;
    touched = true;
  }
  if (!touched) return { skip: true };
  return { features: out };
}

function freeTierQuoteStyle() {
  try {
    const { defaultQuoteStyle } = require("../../Vinili/Community/utils/Quote/quoteStyle") as typeof import("../../Vinili/Community/utils/Quote/quoteStyle");
        return { ...defaultQuoteStyle(), avatarMode: "static" };
  } catch {
    return {
      bg: "black",
      bgColor: null,
      font: "sans",
      bold: true,
      flip: false,
      orientation: "horizontal",
      avatarMode: "static",
      footer: "discord.gg/viniliecaffe",
    };
  }
}

function guildAllowsCustomQuoteStyleSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return false;
  if (isViniliProtectedGuild(gid)) return true;
  try {
    const { isViniliFullFeatureGuild } = require("./guildFeatureScope") as typeof import("./guildFeatureScope");
    if (isViniliFullFeatureGuild(gid)) return true;
  } catch {
      }
  try {
    const { isTenantPremiumActiveSync } = require("./tenantPremium") as typeof import("./tenantPremium");
    return isTenantPremiumActiveSync(gid) === true;
  } catch {
    return false;
  }
}

function readQuoteStyleFromBoardsBlob(b?, guildId = null) {
  try {
    const { decodeQuoteStyleCompact, defaultQuoteStyle } = require("../../Vinili/Community/utils/Quote/quoteStyle") as typeof import("../../Vinili/Community/utils/Quote/quoteStyle");
    if (guildId && !guildAllowsCustomQuoteStyleSync(guildId)) {
      return freeTierQuoteStyle();
    }
    const raw = b?.qs ?? b?.quoteStyle;
    if (!raw || typeof raw !== "object") return defaultQuoteStyle();
    return decodeQuoteStyleCompact(raw);
  } catch {
    return freeTierQuoteStyle();
  }
}

function rowToBoards(row?, guildId = null) {
  const b = readBoardsBlob(row);
  const legacyQuotes = normalizeChannelId(row?.q ?? row?.quotes ?? row?.cm?.quotes);
  const shared =
    normalizeChannelId(b.s ?? b.sharedChannelId) ||
    legacyQuotes ||
    null;
  const quote = normalizeChannelId(b.q ?? b.quoteChannelId) || shared;
  const repost = normalizeChannelId(b.rp ?? b.repostChannelId) || shared;
  const clip = normalizeChannelId(b.cl ?? b.clipChannelId) || shared;
  const skull = normalizeChannelId(b.sk ?? b.skullChannelId) || shared;
  return {
    enabled: boardsEnabledFromBlob(b),
    mode: normalizeBoardsMode(b.m ?? b.mode),
    sharedChannelId: shared,
    quoteChannelId: quote,
    repostChannelId: repost,
    clipChannelId: clip,
    skullChannelId: skull,
    clipTranscription: readClipTranscriptionFromBlob(b),
    features: readBoardFeaturesFromBlob(b),
    quoteStyle: readQuoteStyleFromBoardsBlob(b, guildId),
    presentation: (() => {
      try {
        const { readBoardsPresentationFromBlob } = require("../../Vinili/Community/utils/boardsPresentation") as typeof import("../../Vinili/Community/utils/boardsPresentation");
        return readBoardsPresentationFromBlob(b);
      } catch {
        return null;
      }
    })(),
  };
}

function applyProtectedBoardsCatalogOverlay(guildId?, boards?) {
  const gid = normalizeGuildId(guildId);
  if (!gid || !isViniliProtectedGuild(gid)) return boards;
  /* bachecaSite1: solo il server principale resta col catalogo (funzioni attive), ma senza canale:
     i suoi contenuti vanno sulla Bacheca del sito. Gli altri server protetti usano i canali che impostano. */
  let mainId = "";
  try {
    const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    mainId = String(IDs?.guilds?.main || "").trim();
  } catch {
    mainId = "";
  }
  if (!mainId || gid !== mainId) return boards;
  /* Main: contenuti sul sito, niente canali. Default ON (e:false spegne esplicitamente).
     Senza questa regola boardsEnabledFromBlob resta false (nessun canale) e la dashboard
     mostra Quote/Repost/Clip spente anche col modulo acceso. */
  const blob = readBoardsBlob(settingsCache[gid]);
  const explicitOff = blob.e === false || blob.enabled === false;
  return {
    ...boards,
    enabled: !explicitOff,
    mode: "shared",
    sharedChannelId: null,
    quoteChannelId: null,
    repostChannelId: null,
    clipChannelId: null,
    skullChannelId: null,
    features: boards?.features && typeof boards.features === "object"
      ? { ...defaultBoardFeatures(), ...boards.features }
      : defaultBoardFeatures(),
    presentation: boards?.presentation || emptyBoardsPresentation(),
  };
}

function rowToChannelMap(row?, guildId = null) {
  if (!row || typeof row !== "object") {
    if (!guildId) return {};
  }
  const out: Record<string, any> = {};
  const boards = guildId
    ? getTenantBoardsSync(guildId)
    : rowToBoards(row);
  const quotes =
    boards.enabled !== true
      ? null
      : boards.mode === "split"
        ? boards.quoteChannelId || boards.sharedChannelId
        : boards.sharedChannelId || boards.quoteChannelId;
  const modLogs = normalizeChannelId(row?.ml ?? row?.modLogs ?? row?.cm?.modLogs);
  const roulette = normalizeChannelId(row?.r ?? row?.roulette ?? row?.cm?.roulette);
  if (quotes) out.quotes = quotes;
  if (modLogs) out.modLogs = modLogs;
  if (roulette) out.roulette = roulette;
  return out;
}

function readRowPrefix(row?) {
  if (!row || typeof row !== "object") return null;
  const p = row.p ?? row.prefix;
  if (typeof p !== "string") return null;
  const parsed = normalizePrefix(p);
  return parsed.ok && parsed.prefix ? parsed.prefix : null;
}

async function loadSettingsMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function refreshTenantGuildSettingsCache() {
  if (!isMongoReady()) return settingsCache;
  settingsCache = Object.freeze(await loadSettingsMap());
  settingsCacheAt = Date.now();
  return settingsCache;
}

function isTenantGuildSettingsCacheFresh() {
  return settingsCacheAt > 0 && Date.now() - settingsCacheAt < SETTINGS_CACHE_TTL_MS;
}

async function ensureTenantGuildSettingsCacheFresh(opts: Record<string, any> = {}) {
  const force = opts.force === true;
  if (!force && isTenantGuildSettingsCacheFresh()) return settingsCache;
  if (settingsCacheRefreshPromise) return settingsCacheRefreshPromise;
  settingsCacheRefreshPromise = refreshTenantGuildSettingsCache()
    .catch(() => settingsCache)
    .finally(() => {
      settingsCacheRefreshPromise = null;
    });
  return settingsCacheRefreshPromise;
}

function getTenantChannelMapSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return {};
  return rowToChannelMap(settingsCache[gid], gid);
}

function emptyBoardsPresentation() {
  try {
    const { defaultBoardsPresentation } = require("../../Vinili/Community/utils/boardsPresentation") as typeof import("../../Vinili/Community/utils/boardsPresentation");
    return defaultBoardsPresentation();
  } catch {
    return { quote: {}, repost: {}, clip: {}, skull: {} };
  }
}

function getTenantBoardsSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) {
    return {
      enabled: false,
      mode: "shared",
      sharedChannelId: null,
      quoteChannelId: null,
      repostChannelId: null,
      clipChannelId: null,
      skullChannelId: null,
      clipTranscription: true,
      features: defaultBoardFeatures(),
      quoteStyle: freeTierQuoteStyle(),
      presentation: emptyBoardsPresentation(),
    };
  }
  const boards = applyProtectedBoardsCatalogOverlay(gid, rowToBoards(settingsCache[gid], gid));
  if (!boards?.presentation) boards.presentation = emptyBoardsPresentation();
  return boards;
}

function isTenantClipTranscriptionEnabledSync(guildId?) {
  const boards = getTenantBoardsSync(guildId);
  return boards?.clipTranscription !== false;
}

function isTenantBoardFeatureEnabledSync(guildId?, kind?) {
  const feature = normalizeBoardFeatureKind(kind);
  if (!feature) return false;
  const gid = normalizeGuildId(guildId);
  if (!gid) return false;
  const boards = getTenantBoardsSync(gid);
  if (boards.enabled !== true) return false;
  return boards.features?.[feature] !== false;
}

function resolveTenantBoardChannelIdSync(guildId?, kind = "quote") {
  const boards = getTenantBoardsSync(guildId);
  if (boards.enabled !== true) return null;
  const k = normalizeBoardFeatureKind(kind) || "quote";
  if (!isTenantBoardFeatureEnabledSync(guildId, k)) return null;
  if (boards.mode === "split") {
    if (k === "repost") return boards.repostChannelId || boards.sharedChannelId || null;
    if (k === "clip") return boards.clipChannelId || boards.sharedChannelId || null;
    if (k === "skull") return boards.skullChannelId || boards.sharedChannelId || null;
    return boards.quoteChannelId || boards.sharedChannelId || null;
  }
  return boards.sharedChannelId || boards.quoteChannelId || null;
}

async function syncBoardFeatureCommandAcls(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return { ok: true, skipped: true };
  let emptyAcl;
  let cloneCommandAcl;
  let isAclEmpty;
  try {
    ({ emptyAcl, cloneCommandAcl, isAclEmpty } = require("./tenantCommandAcl"));
  } catch {
    return { ok: false, reason: "persist_failed" };
  }
  const map = getTenantCommandAclMapSync(gid) || {};
  const patch: Record<string, any> = {};
  for (const feature of BOARD_FEATURE_KINDS) {
    const on = isTenantBoardFeatureEnabledSync(gid, feature);
    const names = BOARD_FEATURE_COMMANDS[feature] || [];
    for (const name of names) {
      const prev = map[name] ? cloneCommandAcl(map[name]) : emptyAcl();
      if (!on) {
        if (prev.enabled !== false) patch[name] = { ...prev, enabled: false };
        continue;
      }
      if (prev.enabled === false) {
        const next = { ...prev, enabled: true };
        patch[name] = isAclEmpty(next) ? null : next;
      }
    }
  }
  if (!Object.keys(patch).length) return { ok: true, patched: false };
  return patchTenantCommandAclMap(gid, patch);
}

function getTenantPrefixSync(guildId?, fallback = DEFAULT_PREFIX) {
  const gid = normalizeGuildId(guildId);
  const fb = String(fallback || DEFAULT_PREFIX) || DEFAULT_PREFIX;
  if (!gid) return fb;
  return readRowPrefix(settingsCache[gid]) || fb;
}

function resolveCommandPrefixForGuild(guildId?, clientOrFallback?) {
  const fallback =
    typeof clientOrFallback === "string"
      ? clientOrFallback
      : String(clientOrFallback?.config?.prefix || DEFAULT_PREFIX) || DEFAULT_PREFIX;
  const gid = normalizeGuildId(guildId);
  if (!gid) return fallback;
  try {
    const { isViniliFullFeatureGuild } = require("./guildFeatureScope") as typeof import("./guildFeatureScope");
    if (isViniliFullFeatureGuild(gid)) return fallback;
  } catch (_) {}
  return getTenantPrefixSync(gid, fallback);
}

async function resolveCommandPrefixForGuildFresh(guildId?, clientOrFallback?) {
  await ensureTenantGuildSettingsCacheFresh().catch(() => null);
  return resolveCommandPrefixForGuild(guildId, clientOrFallback);
}

function rewriteDefaultCommandPrefix(text?, guildPrefix?) {
  const p = String(guildPrefix || DEFAULT_PREFIX);
  const raw = String(text ?? "");
  if (!raw || p === DEFAULT_PREFIX) return raw;
  return raw.replace(/`\+/g, "`" + p).replace(/(^|[\s(])\+/g, `$1${p}`);
}

function normalizeRoleIdList(value?) {
  if (Array.isArray(value)) {
    const out = [];
    const seen = new Set();
    for (const raw of value) {
      const id = normalizeRoleId(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }
  const single = normalizeRoleId(value);
  return single ? [single] : [];
}

/** Stessi snowflake dei ruoli: lista utenti Discord ammessi alla dashboard. */
function normalizeUserIdList(value?) {
  return normalizeRoleIdList(value);
}

function getTenantDashboardRoleIdsSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return [];
  const row = settingsCache[gid];
  if (!row || typeof row !== "object") return [];
  return normalizeRoleIdList(row.dr ?? row.dashboardRoleIds ?? row.dashboardRoleId);
}

/** true dopo il primo salvataggio dei ruoli dashboard (prima la dashboard propone i ruoli Amministratore) */
function getTenantDashboardRolesConfiguredSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  const row = gid ? settingsCache[gid] : null;
  if (!row || typeof row !== "object") return false;
  /* solo i salvataggi fatti con la scelta dei ruoli Amministratore: le liste salvate prima
     vengono ancora proposte insieme ai ruoli Amministratore */
  return row.drc === 1;
}

function getTenantDashboardUserIdsSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return [];
  const row = settingsCache[gid];
  if (!row || typeof row !== "object") return [];
  return normalizeUserIdList(row.du ?? row.dashboardUserIds ?? row.dashboardUserId);
}

function getTenantUpdatesChannelIdSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return null;
  const row = settingsCache[gid];
  if (!row || typeof row !== "object") return null;
  return normalizeChannelId(row.uc ?? row.updatesChannelId);
}

function listTenantUpdatesTargetsSync() {
  const out = [];
  for (const [gid, row] of Object.entries(settingsCache || {})) {
    if (!row || typeof row !== "object") continue;
    const channelId = normalizeChannelId(row.uc ?? row.updatesChannelId);
    if (!channelId) continue;
    out.push({
      guildId: String(gid),
      channelId,
      webhookId: normalizeChannelId(row.uw ?? row.updatesWebhookId),
    });
  }
  return out;
}

async function persistGuildRow(guildId?, mutator?, opts: Record<string, any> = {}) {
  const gid = normalizeGuildId(guildId);
  const allowProtected = opts?.allowProtected === true;
  if (!gid || (isViniliProtectedGuild(gid) && !allowProtected)) {
    return { ok: false, reason: "protected_guild" };
  }
  if (!isMongoReady()) {
    return { ok: false, reason: "mongo_not_ready" };
  }
  const map = await loadSettingsMap();
  const prev = map[gid] && typeof map[gid] === "object" ? { ...map[gid] } : {};
  const next = mutator({ ...prev });
  if (!next || typeof next !== "object" || !Object.keys(next).length) {
    delete map[gid];
  } else {
    map[gid] = next;
  }
  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshTenantGuildSettingsCache();
  return { ok: true, row: getTenantSettingsSnapshotSync(gid) };
}

function getTenantCommandAclMapSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return {};
  const row = settingsCache[gid];
  if (!row || typeof row !== "object") return {};
  try {
    const { decodeCommandsMap } = require("./tenantCommandAcl") as typeof import("./tenantCommandAcl");
    return decodeCommandsMap(row.cmd ?? row.commands);
  } catch (_) {
    return {};
  }
}

/* lingua del server (codice a 2 lettere) e fuso orario IANA; null = automatico/predefinito */
function normalizeServerLanguage(value?) {
  const v = String(value ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(v) ? v : null;
}

function normalizeServerTimezone(value?) {
  const v = String(value ?? "").trim().slice(0, 64);
  if (!v) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

function getTenantLanguageSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  const row = gid ? settingsCache[gid] : null;
  return row && typeof row === "object" ? normalizeServerLanguage(row.lng) : null;
}

const DEFAULT_SERVER_TIMEZONE = "Europe/Rome";
function getTenantTimezoneSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  const row = gid ? settingsCache[gid] : null;
  return (row && typeof row === "object" ? normalizeServerTimezone(row.tz) : null) || DEFAULT_SERVER_TIMEZONE;
}

async function setTenantLocaleSettings(guildId?, patch: { language?: unknown; timezone?: unknown } = {}) {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  let language: string | null | undefined;
  let timezone: string | null | undefined;
  if (has("language")) {
    const raw = String(patch.language ?? "").trim();
    language = raw && raw !== "auto" ? normalizeServerLanguage(raw) : null;
    if (raw && raw !== "auto" && !language) return { ok: false, reason: "invalid_language" };
  }
  if (has("timezone")) {
    const raw = String(patch.timezone ?? "").trim();
    timezone = raw ? normalizeServerTimezone(raw) : null;
    if (raw && !timezone) return { ok: false, reason: "invalid_timezone" };
  }
  const result = await persistGuildRow(
    guildId,
    (row?) => {
      if (language !== undefined) {
        if (language) row.lng = language;
        else delete row.lng;
      }
      if (timezone !== undefined) {
        if (timezone && timezone !== DEFAULT_SERVER_TIMEZONE) row.tz = timezone;
        else delete row.tz;
      }
      return row;
    },
    { allowProtected: true },
  );
  if (!result.ok) return result;
  return { ok: true };
}

function getTenantSettingsSnapshotSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) {
    return {
      prefix: DEFAULT_PREFIX,
      dashboardRoleId: null,
      dashboardRoleIds: [],
      dashboardUserIds: [],
      updatesChannelId: null,
      language: null,
      timezone: DEFAULT_SERVER_TIMEZONE,
      commands: {},
      boards: getTenantBoardsSync(null),
    };
  }
  const dashboardRoleIds = getTenantDashboardRoleIdsSync(gid);
  const dashboardUserIds = getTenantDashboardUserIdsSync(gid);
  return {
    prefix: getTenantPrefixSync(gid, DEFAULT_PREFIX),
    dashboardRoleId: dashboardRoleIds[0] || null,
    dashboardRoleIds,
    dashboardUserIds,
    dashboardRolesConfigured: getTenantDashboardRolesConfiguredSync(gid),
    updatesChannelId: getTenantUpdatesChannelIdSync(gid),
    language: getTenantLanguageSync(gid),
    timezone: getTenantTimezoneSync(gid),
    commands: getTenantCommandAclMapSync(gid),
    boards: getTenantBoardsSync(gid),
  };
}

async function patchTenantCommandAclMap(guildId?, patch?) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, reason: "invalid_commands" };
  }
  let encodeCommandAclEntry;
  let normalizeCommandAclKey;
  try {
    ({ encodeCommandAclEntry, normalizeCommandAclKey } = require("./tenantCommandAcl"));
  } catch (_) {
    return { ok: false, reason: "persist_failed" };
  }

  const result = await persistGuildRow(
    guildId,
    (row?) => {
      const prevRaw = row.cmd && typeof row.cmd === "object" && !Array.isArray(row.cmd) ? { ...row.cmd } : {};
      for (const [key, value] of Object.entries(patch)) {
        const name = normalizeCommandAclKey(key);
        if (!name) continue;
        if (value == null || value === false) {
          delete prevRaw[name];
          continue;
        }
        const encoded = encodeCommandAclEntry(value);
        if (!encoded) delete prevRaw[name];
        else prevRaw[name] = encoded;
      }
      if (Object.keys(prevRaw).length) row.cmd = prevRaw;
      else {
        delete row.cmd;
        delete row.commands;
      }
      return row;
    },
    { allowProtected: true },
  );
  if (!result.ok) return result;
  return { ok: true, commands: getTenantCommandAclMapSync(guildId) };
}

function applyClipTranscriptionToBoardsBlob(prevB?, enabled?) {
  delete prevB.clipTranscription;
  if (enabled === false) prevB.ct = 0;
  else delete prevB.ct;
}

async function setTenantBoards(guildId?, patch?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) {
    return { ok: false, reason: "protected_guild" };
  }
  const protectedGuild = isViniliProtectedGuild(gid);
  if (!isMongoReady()) {
    return { ok: false, reason: "mongo_not_ready" };
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, reason: "invalid_boards" };
  }

    if (protectedGuild) {
    const hasQuoteStyle = Object.prototype.hasOwnProperty.call(patch, "quoteStyle");
    const hasFeatures = Object.prototype.hasOwnProperty.call(patch, "features");
    const hasEnabled = Object.prototype.hasOwnProperty.call(patch, "enabled");
    const hasClipTranscription = Object.prototype.hasOwnProperty.call(patch, "clipTranscription");
    const hasPresentation = Object.prototype.hasOwnProperty.call(patch, "presentation");
    if (!hasQuoteStyle && !hasFeatures && !hasEnabled && !hasClipTranscription && !hasPresentation) {
      return { ok: false, reason: "protected_guild" };
    }
    let quoteStyleEncoded = null;
    if (hasQuoteStyle) {
      try {
        const { encodeQuoteStyleCompact, normalizeQuoteStyle } = require("../../Vinili/Community/utils/Quote/quoteStyle") as typeof import("../../Vinili/Community/utils/Quote/quoteStyle");
        quoteStyleEncoded = encodeQuoteStyleCompact(normalizeQuoteStyle(patch.quoteStyle));
      } catch {
        return { ok: false, reason: "invalid_boards" };
      }
    }
    let presentationEncoded = null;
    if (hasPresentation) {
      try {
        const { encodeBoardsPresentationCompact, normalizeBoardsPresentation } = require("../../Vinili/Community/utils/boardsPresentation") as typeof import("../../Vinili/Community/utils/boardsPresentation");
        presentationEncoded = encodeBoardsPresentationCompact(normalizeBoardsPresentation(patch.presentation));
      } catch {
        return { ok: false, reason: "invalid_boards" };
      }
    }
    const featuresParsed = hasFeatures ? normalizeBoardFeaturesPatch(patch.features) : { skip: true };
    if (featuresParsed.invalid) {
      return { ok: false, reason: "invalid_boards" };
    }
    const featuresPatch = featuresParsed.skip ? null : featuresParsed.features;
    const enabledNext = hasEnabled ? patch.enabled !== false : null;
    const clipTranscriptionNext = hasClipTranscription ? patch.clipTranscription !== false : null;
    const result = await persistGuildRow(
      gid,
      (row?) => {
        const prevB = { ...readBoardsBlob(row) };
        if (hasEnabled) {
          if (enabledNext === false) prevB.e = false;
          else prevB.e = true;
          delete prevB.enabled;
        }
        if (featuresPatch) {
          const merged = {
            ...readBoardFeaturesFromBlob(prevB),
            ...featuresPatch,
          };
          const encoded = encodeBoardFeaturesCompact(merged);
          delete prevB.features;
          delete prevB.fq;
          delete prevB.fr;
          delete prevB.fc;
          delete prevB.fk;
          if (encoded) prevB.f = encoded;
          else delete prevB.f;
        }
        if (hasClipTranscription) {
          applyClipTranscriptionToBoardsBlob(prevB, clipTranscriptionNext);
        }
        if (hasQuoteStyle) {
          delete prevB.quoteStyle;
          if (quoteStyleEncoded && Object.keys(quoteStyleEncoded).length) prevB.qs = quoteStyleEncoded;
          else delete prevB.qs;
        }
        if (hasPresentation) {
          delete prevB.presentation;
          if (presentationEncoded) prevB.pr = presentationEncoded;
          else delete prevB.pr;
        }
        row.b = prevB;
        delete row.boards;
        return row;
      },
      { allowProtected: true },
    );
    if (!result.ok) return result;
    if (hasEnabled || featuresPatch) {
      await syncBoardFeatureCommandAcls(gid).catch(() => null);
    }
    return { ok: true, boards: getTenantBoardsSync(gid) };
  }

  const parseOptionalChannel = (value?, present?) => {
    if (!present) return { skip: true };
    if (value === null || value === undefined || value === "" || value === "off" || value === "null") {
      return { clear: true, id: null };
    }
    const id = normalizeChannelId(value);
    if (!id) return { invalid: true };
    return { id };
  };

  const enabledPresent = Object.prototype.hasOwnProperty.call(patch, "enabled");
  const enabledNext = enabledPresent ? patch.enabled !== false : null;
  const modePresent = Object.prototype.hasOwnProperty.call(patch, "mode");
  const mode = modePresent ? normalizeBoardsMode(patch.mode) : null;
  const featuresPresent = Object.prototype.hasOwnProperty.call(patch, "features");
  const featuresParsed = featuresPresent ? normalizeBoardFeaturesPatch(patch.features) : { skip: true };
  if (featuresParsed.invalid) {
    return { ok: false, reason: "invalid_boards" };
  }
  const featuresPatch = featuresParsed.skip ? null : featuresParsed.features;
  const clipTranscriptionPresent = Object.prototype.hasOwnProperty.call(patch, "clipTranscription");
  const clipTranscriptionNext = clipTranscriptionPresent ? patch.clipTranscription !== false : null;
  const quoteStylePresent = Object.prototype.hasOwnProperty.call(patch, "quoteStyle");
  let quoteStyleEncoded = null;
  if (quoteStylePresent) {
    try {
      const { encodeQuoteStyleCompact, normalizeQuoteStyle } = require("../../Vinili/Community/utils/Quote/quoteStyle") as typeof import("../../Vinili/Community/utils/Quote/quoteStyle");
      quoteStyleEncoded = encodeQuoteStyleCompact(normalizeQuoteStyle(patch.quoteStyle));
    } catch {
      return { ok: false, reason: "invalid_boards" };
    }
  }
  const presentationPresent = Object.prototype.hasOwnProperty.call(patch, "presentation");
  let presentationEncoded = null;
  if (presentationPresent) {
    try {
      const { encodeBoardsPresentationCompact, normalizeBoardsPresentation } = require("../../Vinili/Community/utils/boardsPresentation") as typeof import("../../Vinili/Community/utils/boardsPresentation");
      presentationEncoded = encodeBoardsPresentationCompact(normalizeBoardsPresentation(patch.presentation));
    } catch {
      return { ok: false, reason: "invalid_boards" };
    }
  }
  const sharedP = parseOptionalChannel(
    patch.sharedChannelId,
    Object.prototype.hasOwnProperty.call(patch, "sharedChannelId"),
  );
  const quoteP = parseOptionalChannel(
    patch.quoteChannelId,
    Object.prototype.hasOwnProperty.call(patch, "quoteChannelId"),
  );
  const repostP = parseOptionalChannel(
    patch.repostChannelId,
    Object.prototype.hasOwnProperty.call(patch, "repostChannelId"),
  );
  const clipP = parseOptionalChannel(
    patch.clipChannelId,
    Object.prototype.hasOwnProperty.call(patch, "clipChannelId"),
  );
  const skullP = parseOptionalChannel(
    patch.skullChannelId,
    Object.prototype.hasOwnProperty.call(patch, "skullChannelId"),
  );
  if (sharedP.invalid || quoteP.invalid || repostP.invalid || clipP.invalid || skullP.invalid) {
    return { ok: false, reason: "invalid_channel" };
  }

  const result = await persistGuildRow(gid, (row?) => {
    const prevB = { ...readBoardsBlob(row) };
    if (enabledPresent) {
      if (enabledNext === false) prevB.e = false;
      else prevB.e = true;
      delete prevB.enabled;
    }
    if (modePresent) prevB.m = mode;
    if (featuresPatch) {
      const merged = {
        ...readBoardFeaturesFromBlob(prevB),
        ...featuresPatch,
      };
      const encoded = encodeBoardFeaturesCompact(merged);
      delete prevB.features;
      delete prevB.fq;
      delete prevB.fr;
      delete prevB.fc;
      delete prevB.fk;
      if (encoded) prevB.f = encoded;
      else delete prevB.f;
    }
    if (clipTranscriptionPresent) {
      applyClipTranscriptionToBoardsBlob(prevB, clipTranscriptionNext);
    }
    if (quoteStylePresent) {
      delete prevB.quoteStyle;
      if (quoteStyleEncoded && Object.keys(quoteStyleEncoded).length) prevB.qs = quoteStyleEncoded;
      else delete prevB.qs;
    }
    if (presentationPresent) {
      delete prevB.presentation;
      if (presentationEncoded) prevB.pr = presentationEncoded;
      else delete prevB.pr;
    }
    if (!sharedP.skip) {
      if (sharedP.clear || !sharedP.id) {
        delete prevB.s;
        delete prevB.sharedChannelId;
      } else {
        prevB.s = sharedP.id;
        delete prevB.sharedChannelId;
      }
    }
    if (!quoteP.skip) {
      if (quoteP.clear || !quoteP.id) {
        delete prevB.q;
        delete prevB.quoteChannelId;
      } else {
        prevB.q = quoteP.id;
        delete prevB.quoteChannelId;
      }
    }
    if (!repostP.skip) {
      if (repostP.clear || !repostP.id) {
        delete prevB.rp;
        delete prevB.repostChannelId;
      } else {
        prevB.rp = repostP.id;
        delete prevB.repostChannelId;
      }
    }
    if (!clipP.skip) {
      if (clipP.clear || !clipP.id) {
        delete prevB.cl;
        delete prevB.clipChannelId;
      } else {
        prevB.cl = clipP.id;
        delete prevB.clipChannelId;
      }
    }
    if (!skullP.skip) {
      if (skullP.clear || !skullP.id) {
        delete prevB.sk;
        delete prevB.skullChannelId;
      } else {
        prevB.sk = skullP.id;
        delete prevB.skullChannelId;
      }
    }
    delete prevB.mode;
    row.b = prevB;
    delete row.boards;

    const nextBoards = rowToBoards(row, gid);
    const legacyQuotes =
      nextBoards.mode === "split"
        ? nextBoards.quoteChannelId || nextBoards.sharedChannelId
        : nextBoards.sharedChannelId || nextBoards.quoteChannelId;
    if (legacyQuotes) row.q = legacyQuotes;
    else {
      delete row.q;
      delete row.quotes;
    }
    return row;
  });
  if (!result.ok) return result;
  if (enabledPresent || featuresPatch) {
    await syncBoardFeatureCommandAcls(gid).catch(() => null);
  }
  return { ok: true, boards: getTenantBoardsSync(gid) };
}

async function setTenantPrefix(guildId?, prefix?) {
  const parsed = normalizePrefix(prefix);
  if (!parsed.ok) return { ok: false, reason: parsed.reason || "invalid_prefix" };
  const result = await persistGuildRow(guildId, (row?) => {
    if (!parsed.prefix || parsed.prefix === DEFAULT_PREFIX) {
      delete row.p;
      delete row.prefix;
    } else {
      row.p = parsed.prefix;
      delete row.prefix;
    }
    return row;
  });
  if (!result.ok) return result;
  return { ok: true, prefix: getTenantPrefixSync(guildId, DEFAULT_PREFIX) };
}

async function setTenantModLogsChannel(guildId?, channelId?) {
  // allowProtected: la dashboard deve poter settare/leggere il canale anche sul main Vinili.
  if (channelId != null && String(channelId).trim() !== "") {
    const id = normalizeChannelId(channelId);
    if (!id) return { ok: false, reason: "invalid_channel" };
    const result = await persistGuildRow(
      guildId,
      (row?) => {
        row.ml = id;
        delete row.modLogs;
        if (row.cm && typeof row.cm === "object") {
          delete row.cm.modLogs;
          if (!Object.keys(row.cm).length) delete row.cm;
        }
        return row;
      },
      { allowProtected: true },
    );
    if (!result.ok) return result;
    return { ok: true, modLogsChannelId: id };
  }
  const result = await persistGuildRow(
    guildId,
    (row?) => {
      delete row.ml;
      delete row.modLogs;
      if (row.cm && typeof row.cm === "object") {
        delete row.cm.modLogs;
        if (!Object.keys(row.cm).length) delete row.cm;
      }
      return row;
    },
    { allowProtected: true },
  );
  if (!result.ok) return result;
  return { ok: true, modLogsChannelId: null };
}

async function setTenantDashboardRoles(guildId?, roleIds?) {
  const ids = normalizeRoleIdList(roleIds);
    const result = await persistGuildRow(
    guildId,
    (row?) => {
      delete row.dashboardRoleId;
      delete row.dashboardRoleIds;
      if (ids.length) row.dr = ids;
      else delete row.dr;
      row.drc = 1;
      return row;
    },
    { allowProtected: true },
  );
  if (!result.ok) return result;
  return { ok: true, dashboardRoleIds: ids, dashboardRoleId: ids[0] || null };
}

async function setTenantDashboardUsers(guildId?, userIds?) {
  const ids = normalizeUserIdList(userIds);
  const result = await persistGuildRow(
    guildId,
    (row?) => {
      delete row.dashboardUserId;
      delete row.dashboardUserIds;
      if (ids.length) row.du = ids;
      else delete row.du;
      return row;
    },
    { allowProtected: true },
  );
  if (!result.ok) return result;
  return { ok: true, dashboardUserIds: ids };
}

async function setTenantUpdatesChannel(guildId?, channelId?) {
  if (channelId != null && String(channelId).trim() !== "") {
    const id = normalizeChannelId(channelId);
    if (!id) return { ok: false, reason: "invalid_channel" };
    const result = await persistGuildRow(guildId, (row?) => {
      const prev = normalizeChannelId(row.uc ?? row.updatesChannelId);
      row.uc = id;
      delete row.updatesChannelId;
      if (prev && prev !== id) {
        delete row.uw;
        delete row.updatesWebhookId;
      }
      return row;
    });
    if (!result.ok) return result;
    return { ok: true, updatesChannelId: id };
  }
  const result = await persistGuildRow(guildId, (row?) => {
    delete row.uc;
    delete row.updatesChannelId;
    delete row.uw;
    delete row.updatesWebhookId;
    return row;
  });
  if (!result.ok) return result;
  return { ok: true, updatesChannelId: null };
}

async function setTenantUpdatesWebhook(guildId?, webhookId?) {
  if (webhookId != null && String(webhookId).trim() !== "") {
    const id = normalizeChannelId(webhookId);
    if (!id) return { ok: false, reason: "invalid_webhook" };
    const result = await persistGuildRow(guildId, (row?) => {
      row.uw = id;
      delete row.updatesWebhookId;
      return row;
    });
    if (!result.ok) return result;
    return { ok: true, updatesWebhookId: id };
  }
  const result = await persistGuildRow(guildId, (row?) => {
    delete row.uw;
    delete row.updatesWebhookId;
    return row;
  });
  if (!result.ok) return result;
  return { ok: true, updatesWebhookId: null };
}

export = {
  getTenantLanguageSync,
  getTenantTimezoneSync,
  setTenantLocaleSettings,
  DEFAULT_SERVER_TIMEZONE,
  BOT_STATE_KEY,
  DEFAULT_PREFIX,
  PREFIX_MAX_LEN,
  getTenantChannelMapSync,
  getTenantBoardsSync,
  isTenantBoardFeatureEnabledSync,
  isTenantClipTranscriptionEnabledSync,
  resolveTenantBoardChannelIdSync,
  BOARD_FEATURE_COMMANDS,
  getTenantPrefixSync,
  resolveCommandPrefixForGuild,
  resolveCommandPrefixForGuildFresh,
  rewriteDefaultCommandPrefix,
  getTenantDashboardRoleIdsSync,
  getTenantDashboardUserIdsSync,
  normalizeRoleIdList,
  normalizeUserIdList,
  listTenantUpdatesTargetsSync,
  getTenantSettingsSnapshotSync,
  getTenantCommandAclMapSync,
  patchTenantCommandAclMap,
  refreshTenantGuildSettingsCache,
  isTenantGuildSettingsCacheFresh,
  ensureTenantGuildSettingsCacheFresh,
  setTenantBoards,
  setTenantPrefix,
  setTenantDashboardRoles,
  setTenantDashboardUsers,
  setTenantModLogsChannel,
  setTenantUpdatesChannel,
  setTenantUpdatesWebhook,
  normalizePrefix,
  normalizeRoleId,
  normalizeChannelId,
  normalizeBoardsMode,
};
