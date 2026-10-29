const { normalizeHouseInput } = require("../../Services/Community/hogwartsManualHousePointsService") as typeof import("../../Services/Community/hogwartsManualHousePointsService");
const { resolveHogwartsEventConfig } = require("../Web/hogwartsSortingConfig") as typeof import("../Web/hogwartsSortingConfig");
const { getHouseMeta } = require("../Web/hogwartsSortingBank") as typeof import("../Web/hogwartsSortingBank");

function readPrefectHouseMap(client?) {
  const cfg = resolveHogwartsEventConfig(client);
  const raw = cfg?.punticasaPrefectHouses;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, any> = {};
  for (const [userId, houseRaw] of Object.entries(raw)) {
    const uid = String(userId || "").trim();
    const hid = normalizeHouseInput(houseRaw);
    if (uid && hid) out[uid] = hid;
  }
  return out;
}

function resolvePrefectHouseForUser(userId?, client?) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  return readPrefectHouseMap(client)[uid] || null;
}

function isPrefectScopedUser(userId?, client?) {
  return Boolean(resolvePrefectHouseForUser(userId, client));
}

function isPunticasaAllowedUser(userId?, client?) {
  return isPrefectScopedUser(userId, client);
}

function listPunticasaAllowedUserIds(client?) {
  return Object.keys(readPrefectHouseMap(client));
}

function resolveHouseForUser(userId?, requestedHouseId?, client?) {
  const requested = normalizeHouseInput(requestedHouseId);
  if (requested) return requested;
  return resolvePrefectHouseForUser(userId, client) || null;
}

function canAccessHouse(userId?, houseId?, client?) {
  const hid = normalizeHouseInput(houseId);
  if (!hid) return false;
  if (isPrefectScopedUser(userId, client)) return true;
  const assigned = resolvePrefectHouseForUser(userId, client);
  if (!assigned) return true;
  return hid === assigned;
}

function prefectHouseLabel(houseId?, client?) {
  const hid = normalizeHouseInput(houseId);
  if (!hid) return "";
  const eventCfg = resolveHogwartsEventConfig(client);
  return getHouseMeta(hid, eventCfg?.houses?.[hid]?.crestUrl)?.label || hid;
}

function buildPrefectDeniedMessage(userId?, client?) {
  const assigned = resolvePrefectHouseForUser(userId, client);
  if (!assigned) return "<:vegax:1443934876440068179> Non hai accesso a questa casata.";
  return `<:vegax:1443934876440068179> Puoi gestire solo la casata **${prefectHouseLabel(assigned, client)}**.`;
}

function parseDiscordUserRef(raw?, mentionUser?) {
  const fromMention = mentionUser?.id ? String(mentionUser.id).trim() : "";
  if (/^\d{17,20}$/.test(fromMention)) return fromMention;
  const text = String(raw || "").trim();
  if (!text) return "";
  const tagged = text.match(/<@!?(\d{17,20})>/);
  if (tagged) return tagged[1];
  const id = text.replace(/[<@!>]/g, "").trim();
  return /^\d{17,20}$/.test(id) ? id : "";
}

const EXPEL_ARG_KEYS = new Set(["espelli", "espellere", "rimuovi", "expel"]);

function findExpelArgIndex(args = []) {
  return args.findIndex((arg?) => EXPEL_ARG_KEYS.has(String(arg || "").trim().toLowerCase()));
}

export = {
  resolvePrefectHouseForUser,
  isPrefectScopedUser,
  isPunticasaAllowedUser,
  listPunticasaAllowedUserIds,
  resolveHouseForUser,
  canAccessHouse,
  buildPrefectDeniedMessage,
  parseDiscordUserRef,
  findExpelArgIndex,
  EXPEL_ARG_KEYS,
};