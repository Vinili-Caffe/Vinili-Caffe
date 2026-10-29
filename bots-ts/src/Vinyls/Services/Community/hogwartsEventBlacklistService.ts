const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");

const BOT_STATE_KEY = "hogwartsEventBlacklist.v1";
const CACHE_TTL_MS = 15_000;

let cache = { at: 0, data: null };

function normalizeSnowflake(id?) {
  const s = String(id || "").trim();
  if (!/^\d{16,22}$/.test(s)) return null;
  return s;
}

function emptyStore() {
  return { users: {} };
}

function normalizeStore(raw?) {
  const base = emptyStore();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const users = raw.users && typeof raw.users === "object" && !Array.isArray(raw.users) ? raw.users : {};
  for (const [id, row] of Object.entries(users)) {
    const uid = normalizeSnowflake(id);
    if (!uid) continue;
    base.users[uid] = {
      addedBy: String(row?.addedBy || "").trim(),
      note: String(row?.note || "").slice(0, 500),
      addedAt: row?.addedAt ? new Date(row.addedAt).toISOString() : new Date().toISOString(),
    };
  }
  return base;
}

async function loadStore({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_TTL_MS) return cache.data;
  if (!isMongoReady()) {
    cache = { at: now, data: emptyStore() };
    return cache.data;
  }
  const raw = await getBotState(BOT_STATE_KEY, null);
  const data = normalizeStore(raw);
  cache = { at: now, data };
  return data;
}

async function saveStore(store?) {
  if (!isMongoReady()) return false;
  const ok = await setBotState(BOT_STATE_KEY, normalizeStore(store));
  if (ok) cache = { at: Date.now(), data: normalizeStore(store) };
  return ok;
}

function invalidateHogwartsEventBlacklistCache() {
  cache = { at: 0, data: null };
}

async function isUserHogwartsEventBlacklisted(userId?) {
  const uid = normalizeSnowflake(userId);
  if (!uid) return false;
  const store = await loadStore();
  return Boolean(store.users[uid]);
}

async function listHogwartsEventBlacklist() {
  const store = await loadStore();
  return Object.entries(store.users)
    .map(([id, row]) => ({ id, ...row }))
    .sort((a?, b?) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

async function addUserHogwartsEventBlacklist(userId?, addedBy?, note = "") {
  const uid = normalizeSnowflake(userId);
  if (!uid) return { ok: false, reason: "invalid_id" };
  const store = await loadStore({ force: true });
  store.users[uid] = {
    addedBy: String(addedBy || "").trim(),
    note: String(note || "").slice(0, 500),
    addedAt: store.users[uid]?.addedAt || new Date().toISOString(),
  };
  const saved = await saveStore(store);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, id: uid };
}

async function removeUserHogwartsEventBlacklist(userId?) {
  const uid = normalizeSnowflake(userId);
  if (!uid) return { ok: false, reason: "invalid_id" };
  const store = await loadStore({ force: true });
  const existed = Boolean(store.users[uid]);
  delete store.users[uid];
  const saved = await saveStore(store);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, deleted: existed, id: uid };
}

export = {
  BOT_STATE_KEY,
  isUserHogwartsEventBlacklisted,
  listHogwartsEventBlacklist,
  addUserHogwartsEventBlacklist,
  removeUserHogwartsEventBlacklist,
  invalidateHogwartsEventBlacklistCache,
};
