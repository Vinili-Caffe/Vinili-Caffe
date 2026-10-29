const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const GRINGOTT_PATH = "profile.events.hogwarts.gringott";
const HOGWARTS_PATH = "profile.events.hogwarts";
const LEDGER_PATH = `${GRINGOTT_PATH}.ledger`;
const REWARD_KEYS_PATH = `${GRINGOTT_PATH}.rewardKeys`;
const MAX_LEDGER_ENTRIES = 100;
const DEFAULT_SORTING_REWARD = 250;

function normalizeId(value?) {
  return String(value ?? "").trim();
}

function normalizeAmount(value?) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeReason(value?, fallback?) {
  const s = String(value || "").trim().replace(/\s+/g, " ");
  return (s || fallback || "").slice(0, 160);
}

function normalizeLedgerEntry(entry: Record<string, any> = {}) {
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

function readHogwartsEvent(doc?) {
  const hw = doc?.profile?.events?.hogwarts;
  return hw && typeof hw === "object" ? hw : {};
}

function pickGringottRaw(hogwarts?) {
  const hw = hogwarts && typeof hogwarts === "object" ? hogwarts : {};
  const nested = hw.gringott && typeof hw.gringott === "object" ? hw.gringott : {};
  const nestedBalance = Math.max(0, Math.floor(Number(nested.balance) || 0));
  const nestedEarned = Math.max(0, Math.floor(Number(nested.earned) || 0));
  const nestedHasData =
    nestedBalance > 0 ||
    nestedEarned > 0 ||
    (Array.isArray(nested.ledger) && nested.ledger.length > 0) ||
    (Array.isArray(nested.rewardKeys) && nested.rewardKeys.length > 0);
  if (nestedHasData) return nested;
  const flatBalance = Math.max(0, Math.floor(Number(hw.balance) || 0));
  const flatEarned = Math.max(0, Math.floor(Number(hw.earned) || 0));
  const flatHasData =
    flatBalance > 0 ||
    flatEarned > 0 ||
    (Array.isArray(hw.ledger) && hw.ledger.length > 0) ||
    (Array.isArray(hw.rewardKeys) && hw.rewardKeys.length > 0);
  if (!flatHasData) return nested;
  return {
    eventKey: hw.eventKey,
    balance: flatBalance,
    earned: flatEarned || flatBalance,
    spent: Math.max(0, Math.floor(Number(hw.spent) || 0)),
    ledger: Array.isArray(hw.ledger) ? hw.ledger : [],
    rewardKeys: Array.isArray(hw.rewardKeys) ? hw.rewardKeys : [],
  };
}

function resolveGringottState(doc?, eventKey = "") {
  const raw = pickGringottRaw(readHogwartsEvent(doc));
  const ledger = Array.isArray(raw.ledger) ? raw.ledger : [];
  return {
    eventKey: String(raw.eventKey || eventKey || "").trim(),
    balance: Math.max(0, Math.floor(Number(raw.balance) || 0)),
    earned: Math.max(0, Math.floor(Number(raw.earned) || 0)),
    spent: Math.max(0, Math.floor(Number(raw.spent) || 0)),
    ledger: ledger
      .map((entry?) => ({
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

function toPublicGringottPayload(state?) {
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
    ledger: ledger.slice(0, 10).map((entry?) => ({
      type: entry.type,
      amount: Math.max(0, Math.floor(Number(entry.amount) || 0)),
      balanceAfter: Math.max(0, Math.floor(Number(entry.balanceAfter) || 0)),
      reason: String(entry.reason || ""),
      source: String(entry.source || ""),
      createdAt: entry.createdAt,
    })),
  };
}

function resolveGringottConfig(client?) {
  const cfg = resolveHogwartsEventConfig(client);
  return {
    eventKey: cfg.eventKey,
    sortingReward: normalizeAmount(cfg.gringott?.sortingReward) || DEFAULT_SORTING_REWARD,
  };
}

async function ensureGringottCanonicalFromLegacy(guildId?, userId?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return;
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(HOGWARTS_PATH)
    .lean()
    .catch(() => null);
  const hw = readHogwartsEvent(doc);
  const nested = hw.gringott && typeof hw.gringott === "object" ? hw.gringott : {};
  const nestedBalance = Math.max(0, Math.floor(Number(nested.balance) || 0));
  const nestedEarned = Math.max(0, Math.floor(Number(nested.earned) || 0));
  const nestedSpent = Math.max(0, Math.floor(Number(nested.spent) || 0));
  const nestedHasData =
    nestedBalance > 0 ||
    nestedEarned > 0 ||
    nestedSpent > 0 ||
    (Array.isArray(nested.ledger) && nested.ledger.length > 0) ||
    (Array.isArray(nested.rewardKeys) && nested.rewardKeys.length > 0);
      if (nestedHasData) return;
  const flatBalance = Math.max(0, Math.floor(Number(hw.balance) || 0));
  if (flatBalance <= 0) return;
  const $set = {
    [`${GRINGOTT_PATH}.balance`]: flatBalance,
    [`${GRINGOTT_PATH}.earned`]: Math.max(flatBalance, Math.max(0, Math.floor(Number(hw.earned) || 0))),
    [`${GRINGOTT_PATH}.spent`]: Math.max(0, Math.floor(Number(hw.spent) || 0)),
  };
  const eventKey = String(hw.eventKey || nested.eventKey || "").trim();
  if (eventKey) $set[`${GRINGOTT_PATH}.eventKey`] = eventKey;
  if (Array.isArray(hw.ledger) && hw.ledger.length && !Array.isArray(nested.ledger)) {
    $set[`${GRINGOTT_PATH}.ledger`] = hw.ledger;
  }
  if (Array.isArray(hw.rewardKeys) && hw.rewardKeys.length) {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $set, $addToSet: { [REWARD_KEYS_PATH]: { $each: hw.rewardKeys } } },
    ).catch(() => null);
    return;
  }
  await ActivityUserProfile.updateOne({ guildId: g, userId: u }, { $set }).catch(() => null);
}

async function readGringottDoc(guildId?, userId?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  await ensureGringottCanonicalFromLegacy(g, u);
  return ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(HOGWARTS_PATH)
    .lean()
    .catch(() => null);
}

async function repairGringottZeroBalance(guildId?, userId?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return;
  const doc = await readGringottDoc(g, u);
  const nested = readHogwartsEvent(doc).gringott && typeof readHogwartsEvent(doc).gringott === "object"
    ? readHogwartsEvent(doc).gringott
    : {};
  const storedBalance = Math.max(0, Math.floor(Number(nested.balance) || 0));
  if (storedBalance > 0) return;
  const state = resolveGringottState(doc);
  const ledger = Array.isArray(state.ledger) ? state.ledger : [];
  if (!ledger.length) return;
  const sorted = [...ledger].sort((a?, b?) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });
  const lastAfter = Math.max(0, Math.floor(Number(sorted[sorted.length - 1]?.balanceAfter) || 0));
  if (lastAfter < 1) return;
  await ActivityUserProfile.updateOne(
    { guildId: g, userId: u },
    {
      $set: {
        [`${GRINGOTT_PATH}.balance`]: lastAfter,
        [`${GRINGOTT_PATH}.earned`]: Math.max(lastAfter, Math.max(0, Math.floor(Number(state.earned) || 0))),
      },
    },
  ).catch(() => null);
}

async function ensureGringottStoredBalance(guildId?, userId?, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  const doc = await readGringottDoc(g, u);
  const resolved = resolveGringottState(doc, eventKey);
  const nested = readHogwartsEvent(doc).gringott && typeof readHogwartsEvent(doc).gringott === "object"
    ? readHogwartsEvent(doc).gringott
    : {};
  const storedBalance = Math.max(0, Math.floor(Number(nested.balance) || 0));
  const targetBalance = Math.max(0, Math.floor(Number(resolved.balance) || 0));
  if (targetBalance === storedBalance) return resolved;
  await ActivityUserProfile.updateOne(
    { guildId: g, userId: u },
    {
      $set: {
        [`${GRINGOTT_PATH}.balance`]: targetBalance,
        [`${GRINGOTT_PATH}.earned`]: Math.max(targetBalance, Math.max(0, Math.floor(Number(resolved.earned) || 0))),
        [`${GRINGOTT_PATH}.spent`]: Math.max(0, Math.floor(Number(resolved.spent) || 0)),
        [`${GRINGOTT_PATH}.eventKey`]: String(resolved.eventKey || eventKey || nested.eventKey || "").trim(),
      },
    },
  ).catch(() => null);
  return resolved;
}

async function getGringottBalance(guildId?, userId?, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  const doc = await readGringottDoc(g, u);
  return resolveGringottState(doc, eventKey);
}

function isMongoDuplicateKeyError(err?) {
  return err?.code === 11000 || String(err?.message || "").includes("E11000");
}

async function upsertActivityProfile(query?, update?, options: Record<string, any> = {}) {
  try {
    return await ActivityUserProfile.findOneAndUpdate(query, update, options);
  } catch (err) {
    if (!isMongoDuplicateKeyError(err) || !options.upsert) throw err;
    return ActivityUserProfile.findOneAndUpdate(query, update, { ...options, upsert: false });
  }
}

async function hasGringottRewardKey(guildId?, userId?, rewardKey?) {
  const key = String(rewardKey || "").trim();
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!key || !isValidGuildUserId(g, u)) return false;
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(HOGWARTS_PATH)
    .lean()
    .catch(() => null);
  const hw = readHogwartsEvent(doc);
  const keys = [
    ...(Array.isArray(hw.gringott?.rewardKeys) ? hw.gringott.rewardKeys : []),
    ...(Array.isArray(hw.rewardKeys) ? hw.rewardKeys : []),
  ];
  return keys.some((row?) => String(row) === key);
}

async function addGaleoni({ guildId, userId, amount, reason, actorId = null, source = "manual", eventKey = "", rewardKey = "" }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  let creditAmt = normalizeAmount(amount);
  if (!isValidGuildUserId(g, u) || creditAmt < 1) return { ok: false, code: "bad_input" };

  let rewardKeyNorm = String(rewardKey || "").trim();
  if (rewardKeyNorm && (await hasGringottRewardKey(g, u, rewardKeyNorm))) {
    await repairGringottZeroBalance(g, u);
    const current = await getGringottBalance(g, u, eventKey);
    return { ok: false, code: "duplicate_reward", state: current };
  }

  await ensureGringottStoredBalance(g, u, eventKey);
  const before = await getGringottBalance(g, u, eventKey);
  const balanceAfter = (before?.balance || 0) + creditAmt;
  const entry = normalizeLedgerEntry({
    type: rewardKeyNorm ? "reward" : "credit",
    amount: creditAmt,
    balanceAfter,
    reason,
    actorId,
    source,
    rewardKey: rewardKeyNorm,
  });
  const update = {
    $set: { [`${GRINGOTT_PATH}.eventKey`]: normalizeId(eventKey) },
    $inc: {
      [`${GRINGOTT_PATH}.balance`]: creditAmt,
      [`${GRINGOTT_PATH}.earned`]: creditAmt,
    },
    $push: { [LEDGER_PATH]: { $each: [entry], $slice: -MAX_LEDGER_ENTRIES } },
  };
  if (entry.rewardKey) update.$addToSet = { [REWARD_KEYS_PATH]: entry.rewardKey };

  const filter = { guildId: g, userId: u };
  if (entry.rewardKey) filter[REWARD_KEYS_PATH] = { $ne: entry.rewardKey };
  let doc = await ActivityUserProfile.findOneAndUpdate(filter, update, { new: true }).catch((err?) => {
    global.logger?.warn?.("[GRINGOTT] addGaleoni failed", {
      guildId: g,
      userId: u,
      rewardKey: entry.rewardKey || null,
      error: err?.message || String(err),
    });
    return null;
  });
  if (!doc) {
    doc = await ActivityUserProfile.findOneAndUpdate(
      { guildId: g, userId: u },
      { ...update, $setOnInsert: { guildId: g, userId: u } },
      { new: true, upsert: true, setDefaultsOnInsert: false },
    ).catch((err?) => {
      if (isMongoDuplicateKeyError(err) && entry.rewardKey) return null;
      global.logger?.warn?.("[GRINGOTT] addGaleoni upsert failed", {
        guildId: g,
        userId: u,
        rewardKey: entry.rewardKey || null,
        error: err?.message || String(err),
      });
      return null;
    });
  }
  if (!doc && entry.rewardKey) {
    doc = await ActivityUserProfile.findOneAndUpdate(filter, update, { new: true }).catch(() => null);
  }
  if (!doc) {
    const current = await getGringottBalance(g, u, eventKey);
    const duplicate = entry.rewardKey && (await hasGringottRewardKey(g, u, entry.rewardKey));
    return { ok: false, code: duplicate ? "duplicate_reward" : "save_failed", state: current };
  }
  return { ok: true, before, state: resolveGringottState(doc, eventKey), entry };
}

async function spendGaleoni({ guildId, userId, amount, reason, actorId = null, source = "manual", eventKey = "" }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const amt = normalizeAmount(amount);
  if (!isValidGuildUserId(g, u) || amt < 1) return { ok: false, code: "bad_input" };

  const before = await ensureGringottStoredBalance(g, u, eventKey);
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
    await ensureGringottStoredBalance(g, u, eventKey);
    const docRetry = await ActivityUserProfile.findOneAndUpdate(
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
    if (docRetry) {
      return { ok: true, before, state: resolveGringottState(docRetry, eventKey), entry };
    }
    const current = await getGringottBalance(g, u, eventKey);
    return { ok: false, code: current?.balance >= amt ? "save_failed" : "insufficient_funds", state: current };
  }
  return { ok: true, before, state: resolveGringottState(doc, eventKey), entry };
}

async function awardHogwartsSortingReward(client?, guildId?, userId?, actorId = "site") {
  const cfg = resolveGringottConfig(client);
  const rewardKey = `${cfg.eventKey}:sorting_complete`;
  return addGaleoni({
    guildId,
    userId,
    amount: cfg.sortingReward,
    reason: "Smistamento Hogwarts completato",
    actorId,
    source: "hogwarts_sorting",
    eventKey: cfg.eventKey,
    rewardKey,
  });
}

async function ensureHogwartsSortingReward(client?, guildId?, userId?, actorId = "site") {
  const cfg = resolveGringottConfig(client);
  const rewardKey = `${cfg.eventKey}:sorting_complete`;
  await repairGringottZeroBalance(guildId, userId);
  if (await hasGringottRewardKey(guildId, userId, rewardKey)) {
    const state = await getGringottBalance(guildId, userId, cfg.eventKey);
    return { ok: true, code: "duplicate_reward", state };
  }
  return awardHogwartsSortingReward(client, guildId, userId, actorId);
}

function formatGaleoni(amount?) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${n === 1 ? "Galeone d'Oro" : "Galeoni d'Oro"}`;
}

export = {
  DEFAULT_SORTING_REWARD,
  MAX_LEDGER_ENTRIES,
  addGaleoni,
  awardHogwartsSortingReward,
  ensureHogwartsSortingReward,
  ensureGringottStoredBalance,
  formatGaleoni,
  getGringottBalance,
  hasGringottRewardKey,
  resolveGringottConfig,
  spendGaleoni,
  toPublicGringottPayload,
};