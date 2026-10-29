const { randomInt } = require("node:crypto") as typeof import("node:crypto");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const WALLET_PATH = "profile.economy.server";
const VINILI_PATH = `${WALLET_PATH}.vinili`;
const CAFFE_PATH = `${WALLET_PATH}.caffe`;
const REWARD_KEYS_PATH = `${WALLET_PATH}.rewardKeys`;
const MAX_LEDGER_ENTRIES = 100;
const CURRENCY_VINILI = "vinili";
const CURRENCY_CAFFE = "caffe";
const CURRENCY_ALIASES = Object.freeze({
  vinili: CURRENCY_VINILI,
  vinilo: CURRENCY_VINILI,
  vinyl: CURRENCY_VINILI,
  vinyls: CURRENCY_VINILI,
  caffe: CURRENCY_CAFFE,
  caffè: CURRENCY_CAFFE,
  coffee: CURRENCY_CAFFE,
});

function normalizeId(value?) {
  return String(value ?? "").trim();
}

function normalizeAmount(value?) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeCurrency(value?) {
  const key = normalizeId(value).toLowerCase();
  return CURRENCY_ALIASES[key] || "";
}

function normalizeReason(value?, fallback?) {
  const s = String(value || "").trim().replace(/\s+/g, " ");
  return (s || fallback || "").slice(0, 160);
}

function emptyCurrencyState() {
  return { balance: 0, earned: 0, spent: 0, ledger: [] };
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

function readServerWallet(doc?) {
  const wallet = doc?.profile?.economy?.server;
  return wallet && typeof wallet === "object" ? wallet : {};
}

function resolveCurrencyBucket(raw?, fallback = emptyCurrencyState()) {
  const src = raw && typeof raw === "object" ? raw : {};
  const ledger = Array.isArray(src.ledger) ? src.ledger : [];
  return {
    balance: Math.max(0, Math.floor(Number(src.balance) || 0)),
    earned: Math.max(0, Math.floor(Number(src.earned) || 0)),
    spent: Math.max(0, Math.floor(Number(src.spent) || 0)),
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

function resolveServerWalletState(doc?) {
  const raw = readServerWallet(doc);
  return {
    vinili: resolveCurrencyBucket(raw.vinili),
    caffe: resolveCurrencyBucket(raw.caffe),
    updatedAt: raw.updatedAt || null,
  };
}

function currencyPath(currency?) {
  const cur = normalizeCurrency(currency);
  if (cur === CURRENCY_VINILI) return VINILI_PATH;
  if (cur === CURRENCY_CAFFE) return CAFFE_PATH;
  return "";
}

function ledgerPath(currency?) {
  const base = currencyPath(currency);
  return base ? `${base}.ledger` : "";
}

function splitDualReward(totalAmount?, minPct = 30, maxPct = 70) {
  const total = Math.max(1, Math.floor(Number(totalAmount) || 0));
  if (total === 1) return { vinili: 1, caffe: 0, total };
  const lo = Math.max(1, Math.min(99, Math.floor(Number(minPct) || 30)));
  const hi = Math.max(lo, Math.min(99, Math.floor(Number(maxPct) || 70)));
  const viniliPct = randomInt(lo, hi + 1);
  let vinili = Math.floor((total * viniliPct) / 100);
  let caffe = total - vinili;
  if (vinili < 1) {
    vinili = 1;
    caffe = total - 1;
  }
  if (caffe < 1) {
    caffe = 1;
    vinili = total - 1;
  }
  return { vinili, caffe, total };
}

function formatVinili(amount?) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${n === 1 ? "Vinile" : "Vinili"}`;
}

function formatCaffe(amount?) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${n === 1 ? "Caffè" : "Caffè"}`;
}

function formatCurrency(currency?, amount?) {
  return normalizeCurrency(currency) === CURRENCY_CAFFE ? formatCaffe(amount) : formatVinili(amount);
}

function toPublicServerWalletPayload(state?) {
  const s = state || {};
  const vinili = resolveCurrencyBucket(s.vinili);
  const caffe = resolveCurrencyBucket(s.caffe);
  return {
    currencies: ["vinili", "caffe"],
    vinili: {
      label: "Vinili",
      balance: vinili.balance,
      earned: vinili.earned,
      spent: vinili.spent,
      ledger: vinili.ledger.slice(0, 5),
    },
    caffe: {
      label: "Caffè",
      balance: caffe.balance,
      earned: caffe.earned,
      spent: caffe.spent,
      ledger: caffe.ledger.slice(0, 5),
    },
    totalBalance: vinili.balance + caffe.balance,
  };
}

function isMongoDuplicateKeyError(err?) {
  return err?.code === 11000 || String(err?.message || "").includes("E11000");
}

async function readWalletDoc(guildId?, userId?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(WALLET_PATH)
    .lean()
    .catch(() => null);
}

async function hasServerRewardKey(guildId?, userId?, rewardKey?) {
  const key = String(rewardKey || "").trim();
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!key || !isValidGuildUserId(g, u)) return false;
  const doc = await readWalletDoc(g, u);
  const keys = Array.isArray(readServerWallet(doc).rewardKeys) ? readServerWallet(doc).rewardKeys : [];
  return keys.some((row?) => String(row) === key);
}

async function getServerWallet(guildId?, userId?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  const doc = await readWalletDoc(g, u);
  return resolveServerWalletState(doc);
}

async function addCurrency({ guildId, userId, currency, amount, reason, actorId = null, source = "manual", rewardKey = "" }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const cur = normalizeCurrency(currency);
  const creditAmt = normalizeAmount(amount);
  if (!isValidGuildUserId(g, u) || !cur || creditAmt < 1) return { ok: false, code: "bad_input" };

  let rewardKeyNorm = String(rewardKey || "").trim();
  if (rewardKeyNorm && (await hasServerRewardKey(g, u, rewardKeyNorm))) {
    const current = await getServerWallet(g, u);
    return { ok: false, code: "duplicate_reward", state: current };
  }

  const before = await getServerWallet(g, u);
  const bucketBefore = before?.[cur] || emptyCurrencyState();
  const balanceAfter = (bucketBefore.balance || 0) + creditAmt;
  const entry = normalizeLedgerEntry({
    type: rewardKeyNorm ? "reward" : "credit",
    amount: creditAmt,
    balanceAfter,
    reason,
    actorId,
    source,
    rewardKey: rewardKeyNorm,
  });
  const basePath = currencyPath(cur);
  const update = {
    $inc: {
      [`${basePath}.balance`]: creditAmt,
      [`${basePath}.earned`]: creditAmt,
    },
    $push: { [ledgerPath(cur)]: { $each: [entry], $slice: -MAX_LEDGER_ENTRIES } },
    $set: { [`${WALLET_PATH}.updatedAt`]: new Date() },
  };
  if (entry.rewardKey) update.$addToSet = { [REWARD_KEYS_PATH]: entry.rewardKey };

  const filter = { guildId: g, userId: u };
  if (entry.rewardKey) filter[REWARD_KEYS_PATH] = { $ne: entry.rewardKey };
  let doc = await ActivityUserProfile.findOneAndUpdate(filter, update, { new: true }).catch(() => null);
  if (!doc) {
    doc = await ActivityUserProfile.findOneAndUpdate(
      { guildId: g, userId: u },
      { ...update, $setOnInsert: { guildId: g, userId: u } },
      { new: true, upsert: true, setDefaultsOnInsert: false },
    ).catch((err?) => {
      if (isMongoDuplicateKeyError(err) && entry.rewardKey) return null;
      return null;
    });
  }
  if (!doc && entry.rewardKey) {
    doc = await ActivityUserProfile.findOneAndUpdate(filter, update, { new: true }).catch(() => null);
  }
  if (!doc) {
    const current = await getServerWallet(g, u);
    const duplicate = entry.rewardKey && (await hasServerRewardKey(g, u, entry.rewardKey));
    return { ok: false, code: duplicate ? "duplicate_reward" : "save_failed", state: current };
  }
  const state = resolveServerWalletState(doc);
  return { ok: true, currency: cur, before, state, entry, amount: creditAmt };
}

async function spendCurrency({ guildId, userId, currency, amount, reason, actorId = null, source = "manual" }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const cur = normalizeCurrency(currency);
  const amt = normalizeAmount(amount);
  if (!isValidGuildUserId(g, u) || !cur || amt < 1) return { ok: false, code: "bad_input" };

  const before = await getServerWallet(g, u);
  const bucketBefore = before?.[cur] || emptyCurrencyState();
  if (!before || bucketBefore.balance < amt) return { ok: false, code: "insufficient_funds", state: before, currency: cur };
  const balanceAfter = Math.max(0, bucketBefore.balance - amt);
  const entry = normalizeLedgerEntry({ type: "debit", amount: amt, balanceAfter, reason, actorId, source });
  const basePath = currencyPath(cur);
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u, [`${basePath}.balance`]: { $gte: amt } },
    {
      $inc: {
        [`${basePath}.balance`]: -amt,
        [`${basePath}.spent`]: amt,
      },
      $push: { [ledgerPath(cur)]: { $each: [entry], $slice: -MAX_LEDGER_ENTRIES } },
      $set: { [`${WALLET_PATH}.updatedAt`]: new Date() },
    },
    { new: true },
  ).catch(() => null);
  if (!doc) {
    const current = await getServerWallet(g, u);
    const balanceNow = current?.[cur]?.balance || 0;
    return { ok: false, code: balanceNow >= amt ? "save_failed" : "insufficient_funds", state: current, currency: cur };
  }
  return { ok: true, currency: cur, before, state: resolveServerWalletState(doc), entry, amount: amt };
}

async function addDualReward({ guildId, userId, totalAmount, reason, actorId = null, source = "manual", rewardKey = "", splitMinPct = 30, splitMaxPct = 70 }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const split = splitDualReward(totalAmount, splitMinPct, splitMaxPct);
  if (!isValidGuildUserId(g, u) || split.total < 1) return { ok: false, code: "bad_input" };

  const rewardKeyNorm = String(rewardKey || "").trim();
  if (rewardKeyNorm && (await hasServerRewardKey(g, u, rewardKeyNorm))) {
    const current = await getServerWallet(g, u);
    return { ok: false, code: "duplicate_reward", state: current, split };
  }

  const before = await getServerWallet(g, u);
  const viniliBefore = before?.vinili || emptyCurrencyState();
  const caffeBefore = before?.caffe || emptyCurrencyState();
  const viniliAfter = viniliBefore.balance + split.vinili;
  const caffeAfter = caffeBefore.balance + split.caffe;
  const now = new Date();
  const entries = [];
  const update = {
    $set: { [`${WALLET_PATH}.updatedAt`]: now },
    $inc: {},
    $push: {},
  };
  if (split.vinili > 0) {
    const entry = normalizeLedgerEntry({
      type: rewardKeyNorm ? "reward" : "credit",
      amount: split.vinili,
      balanceAfter: viniliAfter,
      reason,
      actorId,
      source,
      rewardKey: rewardKeyNorm,
    });
    update.$inc[`${VINILI_PATH}.balance`] = split.vinili;
    update.$inc[`${VINILI_PATH}.earned`] = split.vinili;
    update.$push[`${VINILI_PATH}.ledger`] = { $each: [entry], $slice: -MAX_LEDGER_ENTRIES };
    entries.push({ currency: CURRENCY_VINILI, entry });
  }
  if (split.caffe > 0) {
    const entry = normalizeLedgerEntry({
      type: rewardKeyNorm ? "reward" : "credit",
      amount: split.caffe,
      balanceAfter: caffeAfter,
      reason,
      actorId,
      source,
      rewardKey: rewardKeyNorm,
    });
    update.$inc[`${CAFFE_PATH}.balance`] = split.caffe;
    update.$inc[`${CAFFE_PATH}.earned`] = split.caffe;
    update.$push[`${CAFFE_PATH}.ledger`] = { $each: [entry], $slice: -MAX_LEDGER_ENTRIES };
    entries.push({ currency: CURRENCY_CAFFE, entry });
  }
  if (rewardKeyNorm) update.$addToSet = { [REWARD_KEYS_PATH]: rewardKeyNorm };

  const filter = { guildId: g, userId: u };
  if (rewardKeyNorm) filter[REWARD_KEYS_PATH] = { $ne: rewardKeyNorm };
  let doc = await ActivityUserProfile.findOneAndUpdate(filter, update, { new: true }).catch(() => null);
  if (!doc) {
    doc = await ActivityUserProfile.findOneAndUpdate(
      { guildId: g, userId: u },
      { ...update, $setOnInsert: { guildId: g, userId: u } },
      { new: true, upsert: true, setDefaultsOnInsert: false },
    ).catch(() => null);
  }
  if (!doc && rewardKeyNorm) {
    doc = await ActivityUserProfile.findOneAndUpdate(filter, update, { new: true }).catch(() => null);
  }
  if (!doc) {
    const current = await getServerWallet(g, u);
    const duplicate = rewardKeyNorm && (await hasServerRewardKey(g, u, rewardKeyNorm));
    return { ok: false, code: duplicate ? "duplicate_reward" : "save_failed", state: current, split };
  }
  return { ok: true, before, state: resolveServerWalletState(doc), split, entries };
}

export = {
  CURRENCY_CAFFE,
  CURRENCY_VINILI,
  MAX_LEDGER_ENTRIES,
  addCurrency,
  addDualReward,
  formatCaffe,
  formatCurrency,
  formatVinili,
  getServerWallet,
  normalizeCurrency,
  splitDualReward,
  spendCurrency,
  toPublicServerWalletPayload,
};