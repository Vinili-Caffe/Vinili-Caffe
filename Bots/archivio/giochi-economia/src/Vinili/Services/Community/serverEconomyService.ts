const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { randomInt } = require("node:crypto") as typeof import("node:crypto");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");

/** Il membro nel server principale (i ruoli dell'economia valgono lì), anche se il comando arriva da un altro server. */
async function resolveMainGuildMember(client?, userId?, member = null) {
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  const uid = String(userId || "").trim();
  if (!uid) return null;
  if (String(member?.guild?.id || "") === mainGuildId && member?.roles?.cache) return member;
  if (!mainGuildId || !client?.guilds) return member || null;
  const guild = client.guilds.cache.get(mainGuildId) || (await client.guilds.fetch(mainGuildId).catch(() => null));
  if (!guild) return null;
  return getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
}
const { formatEconomyAmount } = require("../../Utils/Economy/economyDisplayHelpers") as typeof import("../../Utils/Economy/economyDisplayHelpers");
const {
  CURRENCY_CAFFE,
  CURRENCY_VINILI,
  addDualReward,
  formatCaffe,
  formatCurrency,
  formatVinili,
  normalizeCurrency,
  splitDualReward,
} = require("./serverWalletService") as typeof import("./serverWalletService");

const SERVER_ECONOMY_PATH = "profile.economy.server";

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  earnSplitMinPct: 30,
  earnSplitMaxPct: 70,
  minBet: 2,
  maxBet: 50,
  dailyBetCap: 200,
  work: { cooldownMs: 60 * 60 * 1000, minReward: 3, maxReward: 8, streakStepPct: 1, streakMaxBonusPct: 8, streakGraceMs: 3 * 60 * 60 * 1000 },
  daily: { cooldownMs: 24 * 60 * 60 * 1000, reward: 15, streakStepPct: 2, streakMaxBonusPct: 20, streakGraceMs: 48 * 60 * 60 * 1000 },
  weekly: { cooldownMs: 7 * 24 * 60 * 60 * 1000, reward: 70, streakStepPct: 4, streakMaxBonusPct: 40, streakGraceMs: 14 * 24 * 60 * 60 * 1000 },
  monthly: { cooldownMs: 30 * 24 * 60 * 60 * 1000, reward: 200, streakStepPct: 8, streakMaxBonusPct: 80, streakGraceMs: 62 * 24 * 60 * 60 * 1000 },
  rob: { cooldownMs: 3 * 60 * 60 * 1000, successChance: 25, minTargetBalance: 25, minSteal: 5, maxSteal: 30, failPenalty: 15, targetProtectionMs: 12 * 60 * 60 * 1000 },
  roulette: { cooldownMs: 5 * 1000, numberPayout: 36, simplePayout: 2 },
  rps: { cooldownMs: 5 * 1000, winPayout: 2 },
  slots: { cooldownMs: 5 * 1000, pairPayout: 3, triplePayout: 12, jackpotPayout: 55 },
  blackjack: { cooldownMs: 20 * 1000, winPayout: 2, blackjackPayout: 2.2 },
  coinflip: { cooldownMs: 5 * 1000, winPayout: 2 },
  tris: { enabled: true, cooldownMs: 5 * 1000, winPayout: 2, botRandomPct: 35 },
  scratch: { cooldownMs: 5 * 1000, pairPayout: 0, triplePayout: 2, quadPayout: 3.5, fivePayout: 7, jackpotPayout: 15 },
});

const GAMBLING_ACTIONS = new Set(["roulette", "rps", "slots", "blackjack", "coinflip", "tris", "scratch"]);

function normalizeId(value?) {
  return String(value || "").trim();
}

function int(value?, fallback?, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function mergeConfig(raw: Record<string, any> = {}) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    work: { ...DEFAULT_CONFIG.work, ...(cfg.work || {}) },
    daily: { ...DEFAULT_CONFIG.daily, ...(cfg.daily || {}) },
    weekly: { ...DEFAULT_CONFIG.weekly, ...(cfg.weekly || {}) },
    monthly: { ...DEFAULT_CONFIG.monthly, ...(cfg.monthly || {}) },
    rob: { ...DEFAULT_CONFIG.rob, ...(cfg.rob || {}) },
    roulette: { ...DEFAULT_CONFIG.roulette, ...(cfg.roulette || {}) },
    rps: { ...DEFAULT_CONFIG.rps, ...(cfg.rps || {}) },
    slots: { ...DEFAULT_CONFIG.slots, ...(cfg.slots || {}) },
    blackjack: { ...DEFAULT_CONFIG.blackjack, ...(cfg.blackjack || {}) },
    coinflip: { ...DEFAULT_CONFIG.coinflip, ...(cfg.coinflip || {}) },
    tris: { ...DEFAULT_CONFIG.tris, ...(cfg.tris || {}) },
    scratch: { ...DEFAULT_CONFIG.scratch, ...(cfg.scratch || {}) },
  };
}

function economyConfig(client?) {
  const raw: any = mergeConfig(client?.config?.serverEconomy);
  raw.enabled = (raw as any).enabled !== false;
  raw.earnSplitMinPct = int(raw.earnSplitMinPct, DEFAULT_CONFIG.earnSplitMinPct, 1, 99);
  raw.earnSplitMaxPct = int(raw.earnSplitMaxPct, DEFAULT_CONFIG.earnSplitMaxPct, raw.earnSplitMinPct, 99);
  raw.minBet = int(raw.minBet, DEFAULT_CONFIG.minBet, 1, 100000);
  raw.maxBet = int(raw.maxBet, DEFAULT_CONFIG.maxBet, raw.minBet, 100000);
  raw.dailyBetCap = int(raw.dailyBetCap, DEFAULT_CONFIG.dailyBetCap, raw.maxBet, 1000000);
  for (const action of ["work", "daily", "weekly", "monthly", "rob", "roulette", "rps", "slots", "blackjack", "coinflip", "tris", "scratch"]) {
    raw[action].cooldownMs = int(raw[action].cooldownMs, DEFAULT_CONFIG[action].cooldownMs, 0, 365 * 24 * 60 * 60 * 1000);
  }
  {
    const bj = raw.blackjack || (raw.blackjack = {});
    const cd = Number(bj.cooldownMs);
    if (!Number.isFinite(cd) || cd <= 5_000) bj.cooldownMs = DEFAULT_CONFIG.blackjack.cooldownMs;
    const win = Number(bj.winPayout);
    bj.winPayout = Number.isFinite(win) && win >= 1 ? win : DEFAULT_CONFIG.blackjack.winPayout;
    const bjPay = Number(bj.blackjackPayout);
    if (!Number.isFinite(bjPay) || bjPay >= 2.5) bj.blackjackPayout = DEFAULT_CONFIG.blackjack.blackjackPayout;
    else bj.blackjackPayout = Math.max(bj.winPayout, bjPay);
  }
  for (const action of GAMBLING_ACTIONS) {
    raw[action].enabled = raw[action].enabled !== false;
  }
  raw.work.minReward = int(raw.work.minReward, DEFAULT_CONFIG.work.minReward, 1, 100000);
  raw.work.maxReward = int(raw.work.maxReward, DEFAULT_CONFIG.work.maxReward, raw.work.minReward, 100000);
  raw.daily.reward = int(raw.daily.reward, DEFAULT_CONFIG.daily.reward, 1, 100000);
  raw.weekly.reward = int(raw.weekly.reward, DEFAULT_CONFIG.weekly.reward, 1, 100000);
  raw.monthly.reward = int(raw.monthly.reward, DEFAULT_CONFIG.monthly.reward, 1, 100000);
  for (const action of ["work", "daily", "weekly", "monthly"]) {
    raw[action].streakStepPct = int(raw[action].streakStepPct, DEFAULT_CONFIG[action].streakStepPct, 0, 1000);
    raw[action].streakMaxBonusPct = int(raw[action].streakMaxBonusPct, DEFAULT_CONFIG[action].streakMaxBonusPct, 0, 1000);
    raw[action].streakGraceMs = int(raw[action].streakGraceMs, DEFAULT_CONFIG[action].streakGraceMs, raw[action].cooldownMs, 365 * 24 * 60 * 60 * 1000);
  }
  raw.rob.successChance = int(raw.rob.successChance, DEFAULT_CONFIG.rob.successChance, 1, 95);
  raw.rob.minTargetBalance = int(raw.rob.minTargetBalance, DEFAULT_CONFIG.rob.minTargetBalance, 1, 100000);
  raw.rob.minSteal = int(raw.rob.minSteal, DEFAULT_CONFIG.rob.minSteal, 1, 100000);
  raw.rob.maxSteal = int(raw.rob.maxSteal, DEFAULT_CONFIG.rob.maxSteal, raw.rob.minSteal, 100000);
  raw.rob.failPenalty = int(raw.rob.failPenalty, DEFAULT_CONFIG.rob.failPenalty, 0, 100000);
  raw.rob.targetProtectionMs = int(raw.rob.targetProtectionMs, DEFAULT_CONFIG.rob.targetProtectionMs, 0, 30 * 24 * 60 * 60 * 1000);
  return raw;
}

function isServerEconomyEnabled(client?) {
  return economyConfig(client).enabled;
}

function hasRole(member?, roleId?) {
  const id = normalizeId(roleId);
  return Boolean(id && member?.roles?.cache?.has(id));
}

function hasAnyRole(member?, roleIds = []) {
  return roleIds.some((roleId?) => hasRole(member, roleId));
}

const SERVER_BAL_STAFF_ROLE_IDS = [
  IDs.roles?.HighStaff,
  IDs.roles?.Founder,
  IDs.roles?.Admin,
  IDs.roles?.Director,
]
  .map((id?) => normalizeId(id))
  .filter(Boolean);

async function isHighStaff(member?, client?, userId?) {
  if (hasAnyRole(member, SERVER_BAL_STAFF_ROLE_IDS)) return true;
  const mainMember = await resolveMainGuildMember(client, userId, member);
  return hasAnyRole(mainMember, SERVER_BAL_STAFF_ROLE_IDS);
}

async function isMember(member?) {
  return hasRole(member, IDs.roles?.Member);
}

async function assertServerEconomyAccess(message?, client?) {
  const cfg = economyConfig(client);
  if (!cfg.enabled) return { ok: false, message: "L'economia Vinili & Caffè è disattivata." };
  if (!message?.guild || !message?.member || message.author?.bot) return { ok: false, message: "Comando disponibile solo nel server." };
  if (!await isMember(message.member)) {
    return { ok: false, message: "Devi essere Member per usare l'economia del server." };
  }
  return { ok: true, cfg };
}

function defaultBetCurrency() {
  return CURRENCY_CAFFE;
}

function parseCurrencyArg(raw?, fallback = defaultBetCurrency()) {
  const cur = normalizeCurrency(raw);
  if (cur) return { ok: true, currency: cur };
  if (!raw) return { ok: true, currency: fallback };
  return { ok: false, message: "Valuta non valida: usa `vinili` o `caffe`." };
}

async function getEconomyState(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({ guildId: normalizeId(guildId), userId: normalizeId(userId) })
    .select(SERVER_ECONOMY_PATH)
    .lean()
    .catch(() => null);
  const root = doc?.profile?.economy?.server;
  return root && typeof root === "object" ? root : {};
}

function remainingMs(dateValue?) {
  const until = new Date(dateValue || 0).getTime();
  return Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0;
}

function formatDuration(ms?) {
  const total = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

async function reserveCooldown(guildId?, userId?, action?, cooldownMs?) {
  const path = `${SERVER_ECONOMY_PATH}.cooldowns.${action}`;
  const now = new Date();
  const until = new Date(now.getTime() + Math.max(0, Number(cooldownMs) || 0));
  const doc = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: normalizeId(guildId),
      userId: normalizeId(userId),
      $or: [{ [path]: { $exists: false } }, { [path]: { $lte: now } }, { [path]: null }],
    },
    {
      $setOnInsert: { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      $set: { [path]: until, [`${SERVER_ECONOMY_PATH}.updatedAt`]: now },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (doc) return { ok: true, until };
  const state = await getEconomyState(guildId, userId);
  return { ok: false, remainingMs: remainingMs(state?.cooldowns?.[action]) };
}

async function releaseCooldown(guildId?, userId?, action?) {
  const path = `${SERVER_ECONOMY_PATH}.cooldowns.${action}`;
  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    { $unset: { [path]: "" }, $set: { [`${SERVER_ECONOMY_PATH}.updatedAt`]: new Date() } },
  ).catch(() => null);
}

function incomeCreditErrorMessage(action?, out?) {
  const code = String(out?.code || "").trim();
  if (code === "duplicate_reward") {
    return "Questa ricompensa risulta già accreditata. Chiudi il pannello e controlla il saldo con `+bal`.";
  }
  if (code === "bad_input") {
    return "Sessione non valida. Usa di nuovo il comando nel server.";
  }
  if (code === "save_failed") {
    return "Errore temporaneo sul salvataggio. Riprova tra qualche secondo.";
  }
  return "Non sono riuscito ad accreditare la ricompensa. Riprova più tardi.";
}

function randomBetween(min?, max?) {
  const a = Math.floor(Number(min) || 0);
  const b = Math.floor(Number(max) || a);
  return randomInt(Math.min(a, b), Math.max(a, b) + 1);
}

function resolveIncomeStreak(state?, action?, cfg?, baseAmount?) {
  const raw = state?.streaks?.[action] && typeof state.streaks[action] === "object" ? state.streaks[action] : {};
  const nowMs = Date.now();
  const lastMs = raw.lastClaimAt ? new Date(raw.lastClaimAt).getTime() : 0;
  const consecutive = Number.isFinite(lastMs) && lastMs > 0 && nowMs - lastMs <= cfg.streakGraceMs;
  const count = consecutive ? int(raw.count, 0, 0, 100000) + 1 : 1;
  const best = Math.max(count, int(raw.best, 0, 0, 100000));
  const bonusPct = Math.min(cfg.streakMaxBonusPct, Math.max(0, (count - 1) * cfg.streakStepPct));
  const bonusAmount = Math.max(0, Math.floor(Math.max(0, Math.floor(Number(baseAmount) || 0)) * bonusPct / 100));
  return { count, best, bonusPct, bonusAmount };
}

async function saveIncomeStreak(guildId?, userId?, action?, streak?) {
  const now = new Date();
  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    {
      $setOnInsert: { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      $set: {
        [`${SERVER_ECONOMY_PATH}.streaks.${action}.count`]: streak.count,
        [`${SERVER_ECONOMY_PATH}.streaks.${action}.best`]: streak.best,
        [`${SERVER_ECONOMY_PATH}.streaks.${action}.bonusPct`]: streak.bonusPct,
        [`${SERVER_ECONOMY_PATH}.streaks.${action}.lastClaimAt`]: now,
        [`${SERVER_ECONOMY_PATH}.updatedAt`]: now,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function creditIncome(client?, message?, action?, amount?, reason?) {
  const access = await assertServerEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  const stateBefore = await getEconomyState(message.guild.id, message.author.id);
  const reserve = await reserveCooldown(message.guild.id, message.author.id, action, access.cfg[action].cooldownMs);
  if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi riusare questo comando tra ${formatDuration(reserve.remainingMs)}.` };
  let baseAmount = Math.max(1, Math.floor(Number(amount) || 0));
  if (action === "work") {
    const shopBonusPct = await require("./serverShopService").takeWorkRewardBonusPct(message.guild.id, message.author.id);
    if (shopBonusPct > 0) baseAmount += Math.max(0, Math.floor((baseAmount * shopBonusPct) / 100));
  }
  const streak = resolveIncomeStreak(stateBefore, action, access.cfg[action], baseAmount);
  if (FIXED_INCOME_ACTIONS.has(action)) {
    const shopStreakBonusPct = await require("./serverShopService").takeFixedIncomeStreakBonusPct(message.guild.id, message.author.id);
    if (shopStreakBonusPct > 0) {
      streak.bonusAmount += Math.max(0, Math.floor((baseAmount * shopStreakBonusPct) / 100));
    }
  }
  const totalAmount = baseAmount + streak.bonusAmount;
  const untilMs = reserve.until instanceof Date ? reserve.until.getTime() : new Date(reserve.until || 0).getTime();
  const key = `server:economy:${action}:${message.author.id}:${untilMs}`;
  const out = await addDualReward({
    guildId: message.guild.id,
    userId: message.author.id,
    totalAmount,
    reason,
    actorId: message.author.id,
    source: `economy_${action}`,
    rewardKey: key,
    splitMinPct: access.cfg.earnSplitMinPct,
    splitMaxPct: access.cfg.earnSplitMaxPct,
  });
  if (!out?.ok) {
    await releaseCooldown(message.guild.id, message.author.id, action);
    global.logger?.warn?.(`[SERVER ECONOMY] creditIncome ${action} failed`, {
      code: out?.code || "unknown",
      userId: message.author.id,
      guildId: message.guild.id,
      rewardKey: key,
    });
    return { ok: false, code: out?.code, message: incomeCreditErrorMessage(action, out) };
  }
  await saveIncomeStreak(message.guild.id, message.author.id, action, streak);
  return {
    ok: true,
    amount: totalAmount,
    baseAmount,
    bonusAmount: streak.bonusAmount,
    split: out.split,
    streak,
    state: out.state,
  };
}

async function claimWork(client?, message?) {
  const cfg = economyConfig(client);
  return creditIncome(client, message, "work", randomBetween(cfg.work.minReward, cfg.work.maxReward), "Turno di lavoro completato");
}

async function peekWorkClaim(client?, message?) {
  const access = await assertServerEconomyAccess(message, client);
  if (!access.ok) return access;
  const state = await getEconomyState(message.guild.id, message.author.id);
  const left = remainingMs(state?.cooldowns?.work);
  const cfgAction = access.cfg.work;
  const minReward = Math.max(1, Math.floor(Number(cfgAction.minReward) || 1));
  const maxReward = Math.max(minReward, Math.floor(Number(cfgAction.maxReward) || minReward));
  const previewBase = Math.floor((minReward + maxReward) / 2);
  const streakRaw = state?.streaks?.work && typeof state.streaks.work === "object" ? state.streaks.work : {};
  const projected = resolveIncomeStreak(state, "work", cfgAction, previewBase);
  const bonusMin = Math.max(0, Math.floor(minReward * projected.bonusPct / 100));
  const bonusMax = Math.max(0, Math.floor(maxReward * projected.bonusPct / 100));
  const currentCount = int(streakRaw.count, 0, 0, 100000);
  return {
    ok: true,
    action: "work",
    canClaim: left <= 0,
    remainingMs: left,
    minReward,
    maxReward,
    baseReward: previewBase,
    bonusAmount: projected.bonusAmount,
    totalPreview: previewBase + projected.bonusAmount,
    totalPreviewMin: minReward + bonusMin,
    totalPreviewMax: maxReward + bonusMax,
    streak: {
      count: left <= 0 ? projected.count : currentCount,
      nextCount: projected.count,
      best: Math.max(int(streakRaw.best, 0, 0, 100000), projected.best),
      bonusPct: projected.bonusPct,
    },
    cfg: access.cfg,
  };
}

async function claimFixed(client?, message?, action?) {
  const cfg = economyConfig(client);
  return creditIncome(client, message, action, cfg[action].reward, `Ricompensa ${action}`);
}

const FIXED_INCOME_ACTIONS = new Set(["daily", "weekly", "monthly"]);

async function peekFixedClaim(client?, message?, action?) {
  const key = String(action || "").trim().toLowerCase();
  if (!FIXED_INCOME_ACTIONS.has(key)) return { ok: false, message: "Ricompensa non valida." };
  const access = await assertServerEconomyAccess(message, client);
  if (!access.ok) return access;
  const state = await getEconomyState(message.guild.id, message.author.id);
  const left = remainingMs(state?.cooldowns?.[key]);
  const cfgAction = access.cfg[key];
  const baseReward = Math.max(1, Math.floor(Number(cfgAction.reward) || 0));
  const streakRaw = state?.streaks?.[key] && typeof state.streaks[key] === "object" ? state.streaks[key] : {};
  const projected = resolveIncomeStreak(state, key, cfgAction, baseReward);
  const currentCount = int(streakRaw.count, 0, 0, 100000);
  return {
    ok: true,
    action: key,
    canClaim: left <= 0,
    remainingMs: left,
    baseReward,
    bonusAmount: projected.bonusAmount,
    totalPreview: baseReward + projected.bonusAmount,
    streak: {
      count: left <= 0 ? projected.count : currentCount,
      nextCount: projected.count,
      best: Math.max(int(streakRaw.best, 0, 0, 100000), projected.best),
      bonusPct: projected.bonusPct,
    },
    cfg: access.cfg,
  };
}

module.exports = {
  CURRENCY_CAFFE,
  CURRENCY_VINILI,
  DEFAULT_CONFIG,
  assertServerEconomyAccess,
  claimFixed,
  claimWork,
  defaultBetCurrency,
  economyConfig,
  formatCaffe,
  formatCurrency,
  formatDuration,
  formatEconomyAmount,
  formatVinili,
  isHighStaff,
  isMember,
  isServerEconomyEnabled,
  normalizeCurrency,
  parseCurrencyArg,
  peekFixedClaim,
  peekWorkClaim,
  splitDualReward,
};

/* azzardo e furti (rob, slots, roulette…) erano qui: sono in Bots/archivio/giochi-economia */