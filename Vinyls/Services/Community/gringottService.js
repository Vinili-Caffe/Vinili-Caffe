const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const GRINGOTT_PATH = "profile.events.hogwarts.gringott";
const LEDGER_PATH = `${GRINGOTT_PATH}.ledger`;
const REWARD_KEYS_PATH = `${GRINGOTT_PATH}.rewardKeys`;
const MAX_LEDGER_ENTRIES = 100;
const DEFAULT_SORTING_REWARD = 250;

function normalizeId(value) {
  return String(value ?? "").trim();
}

function normalizeAmount(value) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeReason(value, fallback) {
  const s = String(value || "").trim().replace(/\s+/g, " ");
  return (s || fallback || "").slice(0, 160);
}

function normalizeLedgerEntry(entry = {}) {
  return {
    type: String(entry.type || "credit").trim(),
    amount: normalizeAmount(entry.amount),
    balanceAfter: Math.max(0, Math.floor(Number(entry.balanceAfter) || 0)),
    reason: normalizeReason(entry.reason, ""),
    actorId: normalizeId(entry.actorId) || null,
    source: normalizeReason(entry.source, "manual").slice(0, 48),
    rewardKey: normalizeReason(entry.rewardKey, "").slice(0, 120),
    createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(),
  };
}

function resolveGringottState(doc, eventKey = "") {
  const raw = doc?.profile?.events?.hogwarts?.gringott || {};
  const ledger = Array.isArray(raw.ledger) ? raw.ledger : [];
  return {
    eventKey: String(raw.eventKey || eventKey || "").trim(),
    balance: Math.max(0, Math.floor(Number(raw.balance) || 0)),
    earned: Math.max(0, Math.floor(Number(raw.earned) || 0)),
    spent: Math.max(0, Math.floor(Number(raw.spent) || 0)),
    ledger: ledger
      .map((entry) => ({
        type: String(entry?.type || ""),
        amount: Math.max(0, Math.floor(Number(entry?.amount) || 0)),
        balanceAfter: Math.max(0, Math.floor(Number(entry?.balanceAfter) || 0)),
        reason: String(entry?.reason || ""),
        actorId: entry?.actorId ? String(entry.actorId) : null,
        source: String(entry?.source || ""),
        rewardKey: String(entry?.rewardKey || ""),
        createdAt: entry?.createdAt || null,
      }))
      .slice(-MAX_LEDGER_ENTRIES)
      .reverse(),
  };
}

function toPublicGringottPayload(state) {
  const s = state || {};
  const ledger = Array.isArray(s.ledger) ? s.ledger : [];
  return {
    bank: "Gringott",
    currency: "Galeone d'Oro",
    currencyPlural: "Galeoni d'Oro",
    eventKey: String(s.eventKey || "").trim(),
    balance: Math.max(0, Math.floor(Number(s.balance) || 0)),
    earned: Math.max(0, Math.floor(Number(s.earned) || 0)),
    spent: Math.max(0, Math.floor(Number(s.spent) || 0)),
    ledger: ledger.slice(0, 10).map((entry) => ({
      type: entry.type,
      amount: Math.max(0, Math.floor(Number(entry.amount) || 0)),
      balanceAfter: Math.max(0, Math.floor(Number(entry.balanceAfter) || 0)),
      reason: String(entry.reason || ""),
      source: String(entry.source || ""),
      createdAt: entry.createdAt,
    })),
  };
}

function resolveGringottConfig(client) {
  const cfg = resolveHogwartsEventConfig(client);
  return {
    eventKey: cfg.eventKey,
    sortingReward: normalizeAmount(cfg.gringott?.sortingReward) || DEFAULT_SORTING_REWARD,
  };
}

async function getGringottBalance(guildId, userId, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select("profile.events.hogwarts.gringott")
    .lean()
    .catch(() => null);
  return resolveGringottState(doc, eventKey);
}

async function addGaleoni({ guildId, userId, amount, reason, actorId = null, source = "manual", eventKey = "", rewardKey = "" }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const amt = normalizeAmount(amount);
  if (!isValidGuildUserId(g, u) || amt < 1) return { ok: false, code: "bad_input" };

  const before = await getGringottBalance(g, u, eventKey);
  const balanceAfter = (before?.balance || 0) + amt;
  const entry = normalizeLedgerEntry({ type: rewardKey ? "reward" : "credit", amount: amt, balanceAfter, reason, actorId, source, rewardKey });
  const update = {
    $set: { [`${GRINGOTT_PATH}.eventKey`]: normalizeId(eventKey) },
    $inc: {
      [`${GRINGOTT_PATH}.balance`]: amt,
      [`${GRINGOTT_PATH}.earned`]: amt,
    },
    $push: { [LEDGER_PATH]: { $each: [entry], $slice: -MAX_LEDGER_ENTRIES } },
    $setOnInsert: { guildId: g, userId: u },
  };
  if (entry.rewardKey) update.$addToSet = { [REWARD_KEYS_PATH]: entry.rewardKey };

  const query = { guildId: g, userId: u };
  if (entry.rewardKey) query[REWARD_KEYS_PATH] = { $ne: entry.rewardKey };
  const doc = await ActivityUserProfile.findOneAndUpdate(query, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  }).catch((err) => {
    global.logger?.warn?.("[GRINGOTT] addGaleoni failed", {
      guildId: g,
      userId: u,
      rewardKey: entry.rewardKey || null,
      error: err?.message || String(err),
    });
    return null;
  });
  if (!doc) {
    const current = await getGringottBalance(g, u, eventKey);
    return { ok: false, code: entry.rewardKey ? "duplicate_reward" : "save_failed", state: current };
  }
  return { ok: true, before, state: resolveGringottState(doc, eventKey), entry };
}

async function spendGaleoni({ guildId, userId, amount, reason, actorId = null, source = "manual", eventKey = "" }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const amt = normalizeAmount(amount);
  if (!isValidGuildUserId(g, u) || amt < 1) return { ok: false, code: "bad_input" };

  const before = await getGringottBalance(g, u, eventKey);
  if (!before || before.balance < amt) return { ok: false, code: "insufficient_funds", state: before };
  const balanceAfter = Math.max(0, before.balance - amt);
  const entry = normalizeLedgerEntry({ type: "debit", amount: amt, balanceAfter, reason, actorId, source });
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u, [`${GRINGOTT_PATH}.balance`]: { $gte: amt } },
    {
      $set: { [`${GRINGOTT_PATH}.eventKey`]: normalizeId(eventKey) },
      $inc: {
        [`${GRINGOTT_PATH}.balance`]: -amt,
        [`${GRINGOTT_PATH}.spent`]: amt,
      },
      $push: { [LEDGER_PATH]: { $each: [entry], $slice: -MAX_LEDGER_ENTRIES } },
    },
    { new: true },
  ).catch(() => null);
  if (!doc) {
    const current = await getGringottBalance(g, u, eventKey);
    return { ok: false, code: current?.balance >= amt ? "save_failed" : "insufficient_funds", state: current };
  }
  return { ok: true, before, state: resolveGringottState(doc, eventKey), entry };
}

async function awardHogwartsSortingReward(client, guildId, userId, actorId = "site") {
  const cfg = resolveGringottConfig(client);
  const rewardKey = `${cfg.eventKey}:sorting_complete`;
  return addGaleoni({ guildId, userId, amount: cfg.sortingReward, reason: "Smistamento Hogwarts completato", actorId, source: "hogwarts_sorting", eventKey: cfg.eventKey, rewardKey });
}

function formatGaleoni(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${n === 1 ? "Galeone d'Oro" : "Galeoni d'Oro"}`;
}

module.exports = { DEFAULT_SORTING_REWARD, MAX_LEDGER_ENTRIES, addGaleoni, awardHogwartsSortingReward, formatGaleoni, getGringottBalance, resolveGringottConfig, spendGaleoni, toPublicGringottPayload };