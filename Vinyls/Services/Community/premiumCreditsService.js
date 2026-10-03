const { getBotState } = require("../../Utils/BotState/botStateStore");
const BotState = require("../../Schemas/BotState/botStateSchema");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { grantTenantPremium, getTenantPremium } = require("../../MultiGuild/core/tenantPremium");

const BOT_STATE_KEY = "premiumCredits.v1";
const MAX_OPS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const PREMIUM_CREDIT_PLANS = Object.freeze({
  1: Object.freeze({ months: 1, days: 30, credits: 15 }),
  3: Object.freeze({ months: 3, days: 90, credits: 35 }),
  6: Object.freeze({ months: 6, days: 180, credits: 65 }),
  12: Object.freeze({ months: 12, days: 365, credits: 115 }),
});

function normalizeUserId(userId) {
  const id = String(userId || "").trim();
  return /^\d{16,20}$/.test(id) ? id : "";
}

function normalizeCredits(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 1_000_000_000);
}

function normalizeRow(row) {
  if (row == null) return { c: 0, ops: [] };
  if (typeof row === "number") return { c: normalizeCredits(row), ops: [] };
  if (typeof row === "object") {
    return {
      c: normalizeCredits(row.c ?? row.credits),
      ops: Array.isArray(row.ops) ? row.ops : [],
    };
  }
  return { c: 0, ops: [] };
}

function buildOpEntry(type, delta, meta = {}) {
  return {
    type,
    delta,
    at: Date.now(),
    by: meta.by != null ? String(meta.by) : null,
    reason: meta.reason || null,
    note: meta.note || null,
    guildId: meta.guildId != null ? String(meta.guildId) : null,
  };
}

function appendOp(ops, op) {
  const next = Array.isArray(ops) ? ops.slice() : [];
  next.push(op);
  if (next.length > MAX_OPS) next.splice(0, next.length - MAX_OPS);
  return next;
}

async function loadCreditsMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** Ensure legacy bare-number rows become {c,ops} before atomic $inc. */
async function ensureCreditsRowShape(uid) {
  const path = `value.${uid}`;
  await BotState.updateOne(
    { key: BOT_STATE_KEY, [path]: { $type: "number" } },
    [
      {
        $set: {
          [path]: {
            c: { $ifNull: [`$${path}`, 0] },
            ops: [],
            at: Date.now(),
          },
        },
      },
    ],
  ).catch(() => null);
  await BotState.updateOne(
    {
      key: BOT_STATE_KEY,
      $or: [{ [path]: { $exists: false } }, { [path]: null }],
    },
    { $set: { [path]: { c: 0, ops: [], at: Date.now() } } },
    { upsert: true },
  ).catch(() => null);
}

async function getPremiumCredits(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return 0;
  const map = await loadCreditsMap();
  return normalizeRow(map[uid]).c;
}

async function listPremiumCreditHolders(opts = {}) {
  const map = await loadCreditsMap();
  const q = String(opts.q || "").trim().toLowerCase();
  const limit = Math.min(Math.max(1, Math.floor(Number(opts.limit) || 15)), 100);
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));

  const rows = [];
  for (const [userId, raw] of Object.entries(map)) {
    const uid = normalizeUserId(userId);
    if (!uid) continue;
    const row = normalizeRow(raw);
    if (row.c <= 0) continue;
    if (q && !uid.includes(q) && !String(userId).toLowerCase().includes(q)) continue;
    const updatedAt =
      raw && typeof raw === "object" && Number.isFinite(Number(raw.at)) ? Number(raw.at) : null;
    rows.push({ userId: uid, credits: row.c, updatedAt });
  }

  rows.sort((a, b) => {
    if (b.credits !== a.credits) return b.credits - a.credits;
    const atA = Number(a.updatedAt) || 0;
    const atB = Number(b.updatedAt) || 0;
    if (atB !== atA) return atB - atA;
    return String(a.userId).localeCompare(String(b.userId));
  });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;
  return {
    ok: true,
    users: rows.slice(start, start + limit),
    total,
    page: safePage,
    pages,
    limit,
    from: total ? start + 1 : 0,
    to: Math.min(start + limit, total),
  };
}

async function setPremiumCredits(userId, credits) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: "bad_user" };
  if (!isMongoReady()) return { ok: false, error: "mongo_unavailable" };
  const next = normalizeCredits(credits);
  await ensureCreditsRowShape(uid);
  const map = await loadCreditsMap();
  const row = normalizeRow(map[uid]);
  const updated = await BotState.findOneAndUpdate(
    { key: BOT_STATE_KEY },
    {
      $set: {
        [`value.${uid}`]: { c: next, at: Date.now(), ops: row.ops },
      },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  if (!updated) return { ok: false, error: "persist_failed" };
  return { ok: true, credits: next };
}

async function addPremiumCredits(userId, delta) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: "bad_user" };
  const amount = Math.floor(Number(delta));
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: "bad_delta" };
  return adjustPremiumCredits(uid, amount, { reason: "add" });
}

function getPremiumCreditPlan(months) {
  const key = Number(months);
  if (!Number.isFinite(key)) return null;
  return PREMIUM_CREDIT_PLANS[key] || null;
}

async function spendPremiumCredits(userId, credits, meta = {}) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: "bad_user" };
  const amount = Math.floor(Number(credits));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "bad_amount" };
  if (!isMongoReady()) return { ok: false, error: "mongo_unavailable" };

  await ensureCreditsRowShape(uid);
  const op = buildOpEntry("spend", -amount, meta);
  // premiumCreditsAtomic1: $inc solo se saldo >= amount (no lost update cross-user)
  const updated = await BotState.findOneAndUpdate(
    {
      key: BOT_STATE_KEY,
      [`value.${uid}.c`]: { $gte: amount },
    },
    {
      $inc: { [`value.${uid}.c`]: -amount },
      $set: { [`value.${uid}.at`]: Date.now() },
      $push: {
        [`value.${uid}.ops`]: { $each: [op], $slice: -MAX_OPS },
      },
    },
    { new: true },
  ).catch(() => null);

  if (!updated) {
    const current = await getPremiumCredits(uid);
    if (current < amount) return { ok: false, error: "insufficient", credits: current };
    return { ok: false, error: "persist_failed", credits: current };
  }
  const next = normalizeRow(updated.value?.[uid]).c;
  return { ok: true, credits: next };
}

async function adjustPremiumCredits(userId, delta, meta = {}) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, error: "bad_user" };
  const amount = Math.floor(Number(delta));
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: "bad_delta" };
  if (!isMongoReady()) return { ok: false, error: "mongo_unavailable" };

  await ensureCreditsRowShape(uid);
  if (amount < 0) {
    return spendPremiumCredits(uid, -amount, { ...meta, reason: meta.reason || "adjust" });
  }
  const op = buildOpEntry("adjust", amount, meta);
  const updated = await BotState.findOneAndUpdate(
    { key: BOT_STATE_KEY },
    {
      $inc: { [`value.${uid}.c`]: amount },
      $set: { [`value.${uid}.at`]: Date.now() },
      $push: {
        [`value.${uid}.ops`]: { $each: [op], $slice: -MAX_OPS },
      },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  if (!updated) return { ok: false, error: "persist_failed" };
  const next = normalizeCredits(normalizeRow(updated.value?.[uid]).c);
  if (next !== normalizeRow(updated.value?.[uid]).c) {
    await BotState.updateOne(
      { key: BOT_STATE_KEY },
      { $set: { [`value.${uid}.c`]: next } },
    ).catch(() => null);
  }
  return { ok: true, credits: next };
}

async function spendCreditsForTenantPremium(userId, guildId, months, opts = {}) {
  const plan = getPremiumCreditPlan(months);
  if (!plan) return { ok: false, error: "invalid_plan" };
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid)) return { ok: false, error: "bad_guild" };

  const spend = await spendPremiumCredits(userId, plan.credits, {
    by: userId,
    reason: "tenant_premium",
    note: opts.note || `Premium ${plan.months}m for guild ${gid}`,
    guildId: gid,
  });
  if (!spend.ok) return { ok: false, error: spend.error, credits: spend.credits, plan };

  const current = await getTenantPremium(gid);
  const now = Date.now();
  let baseUntil = now;
  if (current.active) {
    if (current.until == null) baseUntil = null;
    else if (Number(current.until) > now) baseUntil = Number(current.until);
  }
  const until = baseUntil == null ? null : baseUntil + plan.days * DAY_MS;

  const grantOpts = {
    source: "credits",
    updatedBy: String(userId),
    note: opts.note || `Credits redeem: ${plan.months} month(s)`,
  };
  if (until == null) grantOpts.lifetime = true;
  else grantOpts.until = until;

  const grant = await grantTenantPremium(gid, grantOpts);
  if (!grant.ok) {
    await adjustPremiumCredits(userId, plan.credits, {
      by: "system",
      reason: "refund_failed_grant",
      note: "Auto refund: premium grant failed",
    }).catch(() => null);
    return { ok: false, error: grant.reason || "grant_failed", credits: spend.credits, plan };
  }

  const notifyClient =
    opts.client || global.botClient || global.__vinylsDiscordClient || null;
  if (notifyClient) {
    try {
      const { sendPremiumActivatedDm } = require("../../MultiGuild/services/guildPremiumActivatedDmService");
      void sendPremiumActivatedDm(notifyClient, {
        userId,
        guildId: gid,
        plan,
        premium: grant.premium,
        creditsLeft: spend.credits,
      }).catch((err) => {
        global.logger?.warn?.(
          "[premiumCredits] activated DM failed:",
          gid,
          userId,
          err?.message || err,
        );
      });
    } catch (err) {
      global.logger?.warn?.("[premiumCredits] activated DM hook:", err?.message || err);
    }
  }

  return { ok: true, credits: spend.credits, premium: grant.premium, plan };
}

async function findLastPremiumSpendForGuild(guildId, preferredUserId = null) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid)) return null;
  const map = await loadCreditsMap();
  const prefer = normalizeUserId(preferredUserId);
  const candidates = [];

  const scanUser = (uid, raw) => {
    const row = normalizeRow(raw);
    for (let i = row.ops.length - 1; i >= 0; i -= 1) {
      const op = row.ops[i];
      if (!op || typeof op !== "object") continue;
      const delta = Math.floor(Number(op.delta));
      if (!(delta < 0)) continue;
      const reason = String(op.reason || "");
      const note = String(op.note || "");
      const opGuild = String(op.guildId || "").trim();
      const matchesGuild =
        opGuild === gid ||
        note.includes(gid) ||
        (reason === "tenant_premium" && note.includes(gid));
      if (!matchesGuild && !(reason === "tenant_premium" && opGuild === gid)) continue;
      if (!matchesGuild) continue;
      candidates.push({
        userId: uid,
        credits: Math.abs(delta),
        at: Number(op.at) || 0,
        note: note || null,
      });
      break;
    }
  };

  if (prefer && map[prefer]) scanUser(prefer, map[prefer]);
  if (!candidates.length) {
    for (const [userId, raw] of Object.entries(map)) {
      const uid = normalizeUserId(userId);
      if (!uid || uid === prefer) continue;
      scanUser(uid, raw);
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  return candidates[0];
}

module.exports = {
  BOT_STATE_KEY,
  PREMIUM_CREDIT_PLANS,
  getPremiumCredits,
  listPremiumCreditHolders,
  setPremiumCredits,
  addPremiumCredits,
  getPremiumCreditPlan,
  spendPremiumCredits,
  adjustPremiumCredits,
  spendCreditsForTenantPremium,
  findLastPremiumSpendForGuild,
};
