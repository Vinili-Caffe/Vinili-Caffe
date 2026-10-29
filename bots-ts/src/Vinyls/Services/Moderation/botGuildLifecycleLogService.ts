const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");

const BOT_STATE_KEY = "botGuildLifecycle.v1";
const MAX_EVENTS = 250;

function emptyStore() {
  return { events: [] };
}

function normalizeEvent(raw?) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "").trim().toLowerCase();
  if (!["join", "leave", "kick", "botban_leave", "reset", "manual_leave"].includes(type)) return null;
  const guildId = String(raw.guildId || "").trim();
  if (!/^\d{16,22}$/.test(guildId)) return null;
  return {
    id: String(raw.id || `${Date.now()}_${guildId}_${type}`).slice(0, 80),
    type,
    guildId,
    guildName: String(raw.guildName || "").trim().slice(0, 120) || null,
    ownerId: /^\d{16,22}$/.test(String(raw.ownerId || "").trim())
      ? String(raw.ownerId).trim()
      : null,
    memberCount: Math.max(0, Math.floor(Number(raw.memberCount) || 0)) || null,
    actorId: /^\d{16,22}$/.test(String(raw.actorId || "").trim())
      ? String(raw.actorId).trim()
      : null,
    note: String(raw.note || "").trim().slice(0, 300) || null,
    at: raw.at ? new Date(raw.at).toISOString() : new Date().toISOString(),
  };
}

function normalizeStore(raw?) {
  const base = emptyStore();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const list = Array.isArray(raw.events) ? raw.events : [];
  for (const row of list) {
    const event = normalizeEvent(row);
    if (event) base.events.push(event);
  }
  base.events.sort((a?, b?) => Date.parse(b.at) - Date.parse(a.at));
  base.events = base.events.slice(0, MAX_EVENTS);
  return base;
}

async function loadStore() {
  if (!isMongoReady()) return emptyStore();
  const raw = await getBotState(BOT_STATE_KEY, null).catch(() => null);
  return normalizeStore(raw);
}

async function saveStore(store?) {
  if (!isMongoReady()) return false;
  return setBotState(BOT_STATE_KEY, normalizeStore(store));
}

async function appendBotGuildLifecycleEvent(input?) {
  const event = normalizeEvent({
    ...input,
    id: `${Date.now()}_${String(input?.guildId || "").trim()}_${String(input?.type || "").trim()}`,
    at: new Date().toISOString(),
  });
  if (!event) return { ok: false, reason: "invalid_event" };
  const store = await loadStore();
  store.events.unshift(event);
  store.events = store.events.slice(0, MAX_EVENTS);
  const saved = await saveStore(store);
  return saved ? { ok: true, event } : { ok: false, reason: "persist_failed" };
}

async function listBotGuildLifecycleEvents({ limit = 50, type = null } = {}) {
  const store = await loadStore();
  const max = Math.min(MAX_EVENTS, Math.max(1, Math.floor(Number(limit) || 50)));
  const typeFilter = String(type || "").trim().toLowerCase();
  let rows = store.events;
  if (typeFilter && typeFilter !== "all") {
    rows = rows.filter((row?) => row.type === typeFilter);
  }
  return rows.slice(0, max);
}

function snapshotGuildMeta(guild?) {
  if (!guild) return {};
  return {
    guildName: String(guild.name || "").trim() || null,
    ownerId: String(guild.ownerId || "").trim() || null,
    memberCount: Math.max(0, Math.floor(Number(guild.memberCount) || 0)) || null,
  };
}

export = {
  BOT_STATE_KEY,
  MAX_EVENTS,
  appendBotGuildLifecycleEvent,
  listBotGuildLifecycleEvents,
  snapshotGuildMeta,
};
