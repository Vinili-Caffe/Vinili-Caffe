const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { ensureMongoReady, isMongoReady } = require("../../Utils/Database/mongoConnect");

const SERVER_ECONOMY_PATH = "profile.economy.server";
const SLOTS_GUI_PATH = `${SERVER_ECONOMY_PATH}.slotsGui`;
const SESSION_DB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PERSIST_RETRY = 2;
const LOAD_RETRY = 3;

function normalizeId(value) {
  return String(value || "").trim();
}

function dbExpired(raw) {
  const ms = new Date(raw?.updatedAt || 0).getTime();
  return !Number.isFinite(ms) || Date.now() - ms > SESSION_DB_TTL_MS;
}

async function waitMongoBrief() {
  if (isMongoReady()) return true;
  return ensureMongoReady({ maxWaitMs: 4000 });
}

function compactLastResult(raw) {
  const reels = Array.isArray(raw?.lastReels) ? raw.lastReels.slice(0, 3).map((x) => String(x || "🍒")) : null;
  if (!reels?.length) return null;
  while (reels.length < 3) reels.push("🍒");
  return {
    ok: true,
    win: Boolean(raw.lastWin),
    payout: Math.max(0, Math.floor(Number(raw.lastPayout) || 0)),
    result: {
      reels,
      multiplier: Math.max(0, Math.floor(Number(raw.lastMultiplier) || 0)),
    },
  };
}

function sessionFromDb(raw, guildId, userId) {
  if (!raw || typeof raw !== "object") return null;
  const ownerId = normalizeId(raw.ownerId || userId);
  const messageId = normalizeId(raw.messageId);
  if (!messageId || !ownerId) return null;
  return {
    ownerId,
    guildId: normalizeId(guildId),
    messageId,
    bet: Math.max(1, Math.floor(Number(raw.bet) || 1)),
    bank: Math.max(0, Math.floor(Number(raw.bank) || 0)),
    spins: Math.max(0, Math.floor(Number(raw.spins) || 0)),
    lastResult: compactLastResult(raw),
    panelAnimating: false,
    panelImage: null,
    createdAt: new Date(raw.updatedAt || Date.now()).getTime(),
    updatedAt: new Date(raw.updatedAt || Date.now()).getTime(),
    cashedOut: false,
  };
}

function compactForDb(messageId, session) {
  const last = session?.lastResult;
  const out = {
    messageId: normalizeId(messageId),
    ownerId: normalizeId(session.ownerId),
    bank: Math.max(0, Math.floor(Number(session.bank) || 0)),
    bet: Math.max(1, Math.floor(Number(session.bet) || 1)),
    spins: Math.max(0, Math.floor(Number(session.spins) || 0)),
    updatedAt: new Date(),
  };
  if (last?.result?.reels) {
    out.lastReels = last.result.reels.slice(0, 3);
    out.lastPayout = Math.max(0, Math.floor(Number(last.payout) || 0));
    out.lastWin = Boolean(last.win);
    out.lastMultiplier = Math.max(0, Math.floor(Number(last.result.multiplier) || 0));
  }
  return out;
}

async function readUserSlotsGui(guildId, userId) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  if (!(await waitMongoBrief())) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(SLOTS_GUI_PATH)
    .lean()
    .catch(() => null);
  const raw = doc?.profile?.economy?.server?.slotsGui;
  return raw && typeof raw === "object" ? raw : null;
}

async function persistSlotsGuiSession(messageId, session) {
  const g = normalizeId(session?.guildId);
  const u = normalizeId(session?.ownerId);
  const mid = normalizeId(messageId);
  if (!isValidGuildUserId(g, u) || !mid) return false;
  const bank = Math.max(0, Math.floor(Number(session.bank) || 0));

      if (session?.cashedOut && bank <= 0) {
    await clearSlotsGuiSession(g, u, mid);
    return true;
  }

  if (!(await waitMongoBrief())) {
    global.logger?.warn?.("[SLOTS GUI] persist skipped: mongo not ready");
    return false;
  }

  for (let attempt = 1; attempt <= PERSIST_RETRY; attempt += 1) {
    try {
      await ActivityUserProfile.updateOne(
        { guildId: g, userId: u },
        {
          $setOnInsert: { guildId: g, userId: u },
          $set: {
            [SLOTS_GUI_PATH]: compactForDb(mid, session),
            [`${SERVER_ECONOMY_PATH}.updatedAt`]: new Date(),
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      return true;
    } catch (err) {
      global.logger?.warn?.(`[SLOTS GUI] persist attempt ${attempt}:`, err?.message || err);
      if (attempt < PERSIST_RETRY) await new Promise((r) => setTimeout(r, 120 * attempt));
    }
  }
  return false;
}

async function clearSlotsGuiSession(guildId, userId, messageId) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const mid = normalizeId(messageId);
  if (!isValidGuildUserId(g, u)) return;
  if (!(await waitMongoBrief())) return;
  const filter = { guildId: g, userId: u };
  if (mid) filter[`${SLOTS_GUI_PATH}.messageId`] = mid;
  await ActivityUserProfile.updateOne(filter, {
    $unset: { [SLOTS_GUI_PATH]: "" },
    $set: { [`${SERVER_ECONOMY_PATH}.updatedAt`]: new Date() },
  }).catch(() => null);
}

async function loadSlotsGuiSessionByMessage(guildId, messageId) {
  const g = normalizeId(guildId);
  const mid = normalizeId(messageId);
  if (!mid) return null;
  if (!(await waitMongoBrief())) return null;
  const path = SLOTS_GUI_PATH;
  const filter = { [`${path}.messageId`]: mid };
  if (g) filter.guildId = g;
  const doc = await ActivityUserProfile.findOne(filter)
    .select(`${SLOTS_GUI_PATH} userId guildId`)
    .lean()
    .catch(() => null);
  const raw = doc?.profile?.economy?.server?.slotsGui;
  if (!raw || normalizeId(raw.messageId) !== mid) return null;
  if (dbExpired(raw)) {
    await clearSlotsGuiSession(normalizeId(doc.guildId || g), doc.userId, mid);
    return null;
  }
  return sessionFromDb(raw, normalizeId(doc.guildId || g), doc.userId);
}

async function loadSlotsGuiSessionByOwner(guildId, userId) {
  const raw = await readUserSlotsGui(guildId, userId);
  if (!raw || dbExpired(raw)) {
    if (raw) await clearSlotsGuiSession(guildId, userId, raw.messageId);
    return null;
  }
  return sessionFromDb(raw, guildId, userId);
}

async function takeUserSlotsGuiPending(guildId, userId) {
  const raw = await readUserSlotsGui(guildId, userId);
  if (!raw || dbExpired(raw)) {
    if (raw) await clearSlotsGuiSession(guildId, userId, raw.messageId);
    return null;
  }
  const bank = Math.max(0, Math.floor(Number(raw.bank) || 0));
  if (bank <= 0) return null;
  return { raw, bank, session: sessionFromDb(raw, guildId, userId) };
}

module.exports = {
  SESSION_DB_TTL_MS,
  clearSlotsGuiSession,
  loadSlotsGuiSessionByMessage,
  loadSlotsGuiSessionByOwner,
  persistSlotsGuiSession,
  takeUserSlotsGuiPending,
};
