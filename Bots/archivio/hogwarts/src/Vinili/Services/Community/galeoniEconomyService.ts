const { randomInt } = require("node:crypto") as typeof import("node:crypto");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { parseDateStartMs, resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const {
  resolveMainGuildMember,
  hasHogwartsSortingPreviewAccess,
  isStaffBypassUserId,
  isUserHighStaffExcludedFromHogwartsEvent,
  HOGWARTS_BLACKLISTED_MESSAGE,
} = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
const { addGaleoni, formatGaleoni, getGringottBalance, spendGaleoni } = require("./gringottService") as typeof import("./gringottService");
const ECONOMY_PATH = "profile.events.hogwarts.economy";
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  previewMode: false,
  startDate: "2026-08-10T14:00:00",
  minBet: 5,
    maxBet: 0,
  dailyBetCap: 0,
  work: { cooldownMs: 60 * 60 * 1000, minReward: 8, maxReward: 24, streakStepPct: 1, streakMaxBonusPct: 10, streakGraceMs: 3 * 60 * 60 * 1000 },
  daily: { cooldownMs: 24 * 60 * 60 * 1000, reward: 50, streakStepPct: 3, streakMaxBonusPct: 30, streakGraceMs: 48 * 60 * 60 * 1000 },
  weekly: { cooldownMs: 7 * 24 * 60 * 60 * 1000, reward: 250, streakStepPct: 5, streakMaxBonusPct: 50, streakGraceMs: 14 * 24 * 60 * 60 * 1000 },
  monthly: { cooldownMs: 30 * 24 * 60 * 60 * 1000, reward: 500, streakStepPct: 10, streakMaxBonusPct: 100, streakGraceMs: 62 * 24 * 60 * 60 * 1000 },
  rob: { cooldownMs: 3 * 60 * 60 * 1000, successChance: 35, minTargetBalance: 80, minSteal: 15, maxSteal: 90, failPenalty: 35, targetProtectionMs: 12 * 60 * 60 * 1000 },
  roulette: { cooldownMs: 5 * 1000, numberPayout: 36, simplePayout: 2 },
  rps: { cooldownMs: 5 * 1000, winPayout: 2 },
  slots: { cooldownMs: 5 * 1000, pairPayout: 3, triplePayout: 12, jackpotPayout: 55 },
  blackjack: { cooldownMs: 20 * 1000, winPayout: 2, blackjackPayout: 2.2 },
  coinflip: { cooldownMs: 5 * 1000, winPayout: 2 },
  tris: { enabled: true, cooldownMs: 5 * 1000, winPayout: 2, botRandomPct: 35 },
  scratch: { cooldownMs: 5 * 1000, pairPayout: 0, triplePayout: 2, quadPayout: 3.5, fivePayout: 7, jackpotPayout: 15 },
});
const GAMBLING_ACTIONS = new Set(["roulette", "rps", "slots", "blackjack", "coinflip", "tris", "scratch"]);
const SORTED_HOUSE_IDS = ["gryffindor", "hufflepuff", "ravenclaw", "slytherin"];
const SORTED_HOUSE_LABELS = Object.freeze({
  gryffindor: "Grifondoro",
  hufflepuff: "Tassorosso",
  ravenclaw: "Corvonero",
  slytherin: "Serpeverde",
});
const ROB_BANK_TARGET_ID = "gringott";

function isRobBankTarget(targetId?) {
  const id = normalizeId(targetId).toLowerCase();
  return id === ROB_BANK_TARGET_ID || id === "gringott" || id === "banca";
}

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

function isEconomyLive(cfg?, nowMs = Date.now()) {
  return !Number.isFinite(cfg?.startMs) || Number(nowMs) >= cfg.startMs;
}

function hasGaleoniEconomyPreviewAccess(client?, member?, userId?, cfg?) {
  if (!cfg?.previewMode) return false;
  if (isStaffBypassUserId(cfg, userId)) return true;
  const hogCfg = resolveHogwartsEventConfig(client);
  if (isStaffBypassUserId(hogCfg, userId)) return true;
  if (hogCfg?.previewMode) return hasHogwartsSortingPreviewAccess(hogCfg, member, userId);
  return true;
}

function isGaleoniEconomyUnlocked(client?, nowMs = Date.now()) {
  const cfg = economyConfig(client);
  if (!cfg.enabled) return false;
  if (cfg.previewMode) return true;
  if (!isEconomyLive(cfg, nowMs)) return false;
    try {
    const hogCfg = resolveHogwartsEventConfig(client);
    const endMs = Number(hogCfg?.endMs || 0);
    if (Number.isFinite(endMs) && Number(nowMs) > endMs) return false;
  } catch (_) {}
  return true;
}

function economyConfig(client?) {
  const raw: any = mergeConfig(client?.config?.galeoniEconomy);
  raw.enabled = raw.enabled !== false;
  raw.previewMode = raw.previewMode === true;
  raw.startDate = normalizeId(raw.startDate) || DEFAULT_CONFIG.startDate;
    const parsedStartMs = parseDateStartMs(raw.startDate, "Europe/Rome");
  raw.startMs = Number.isFinite(parsedStartMs) ? parsedStartMs : new Date(raw.startDate).getTime();
  raw.minBet = int(raw.minBet, DEFAULT_CONFIG.minBet, 1, 100000);
    raw.maxBet = int(raw.maxBet, DEFAULT_CONFIG.maxBet, 0, 1000000);
  raw.dailyBetCap = int(raw.dailyBetCap, DEFAULT_CONFIG.dailyBetCap, 0, 1000000);
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
  raw.staffBypassUserIds = Array.isArray(raw.staffBypassUserIds)
    ? raw.staffBypassUserIds.map((v?) => normalizeId(v)).filter(Boolean)
    : [];
  return raw;
}

function eventKey(client?) {
  return normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
}

function hasRole(member?, roleId?) {
  const id = normalizeId(roleId);
  return Boolean(id && member?.roles?.cache?.has(id));
}

function hasAnyRole(member?, roleIds = []) {
  return roleIds.some((roleId?) => hasRole(member, roleId));
}

const GALEONI_BAL_STAFF_ROLE_IDS = [
  IDs.roles?.HighStaff,
  IDs.roles?.Founder,
  IDs.roles?.Admin,
  IDs.roles?.Director,
]
  .map((id?) => normalizeId(id))
  .filter(Boolean);

async function isHighStaff(member?, client?, userId?) {
  if (hasAnyRole(member, GALEONI_BAL_STAFF_ROLE_IDS)) return true;
  const mainMember = await resolveMainGuildMember(client, userId, member);
  return hasAnyRole(mainMember, GALEONI_BAL_STAFF_ROLE_IDS);
}

async function isMember(member?, client?, userId?) {
  return hasRole(member, IDs.roles?.Member);
}

async function assertEconomyAccess(message?, client?) {
  const cfg = economyConfig(client);
  if (!cfg.enabled) return { ok: false, message: "L'economia Galeoni è disattivata." };
  const author = message?.author || message?.user || null;
  if (!message?.guild || !message?.member || author?.bot) {
    return { ok: false, message: "Comando disponibile solo nel server." };
  }
  const userId = normalizeId(author?.id);
  if (!userId) return { ok: false, message: "Comando disponibile solo nel server." };
  if (await isUserHighStaffExcludedFromHogwartsEvent(client, userId, message.member)) {
    return { ok: false, message: HOGWARTS_BLACKLISTED_MESSAGE || "Sei escluso dall'evento Hogwarts." };
  }
  const previewAccess = hasGaleoniEconomyPreviewAccess(client, message.member, userId, cfg);
  const live = isEconomyLive(cfg);
  if (!live && !previewAccess) {
    return { ok: false, message: "L'economia Galeoni si sblocca lunedì 10 agosto." };
  }
  if (!previewAccess && !await isMember(message.member, client, userId)) {
    return { ok: false, message: "Devi essere Member per usare l'economia Galeoni." };
  }
  const preview = Boolean(cfg.previewMode && previewAccess);
  return { ok: true, preview, cfg };
}

async function assertSortedEconomyAccess(message?, client?) {
  const access = await assertEconomyAccess(message, client);
  if (!access.ok) return access;
  if (access.preview) {
    return { ok: true, preview: true, cfg: access.cfg, houseId: "" };
  }
  const house = await resolveSortedHouseForUser(message.guild.id, message.author.id, client);
  if (!house) {
    return { ok: false, message: "Completa prima lo smistamento Hogwarts per usare questo comando." };
  }
  return { ok: true, preview: access.preview, cfg: access.cfg, houseId: house };
}

function normalizeSortedHouseId(value?) {
  const house = normalizeId(value).toLowerCase();
  return SORTED_HOUSE_IDS.includes(house) ? house : "";
}

function sortedHouseLabel(houseId?) {
  const id = normalizeSortedHouseId(houseId);
  return SORTED_HOUSE_LABELS[id] || "la stessa casata";
}

async function assertDifferentHouses(client?, guildId?, actorId?, targetId?, opts: Record<string, any> = {}) {
  if (opts.preview) return { ok: true, skipped: true };
  const gid = normalizeId(guildId);
  const actor = normalizeId(actorId);
  const target = normalizeId(targetId);
  if (!gid || !actor || !target || actor === target) return { ok: true };
  const [actorHouse, targetHouse] = await Promise.all([
    resolveSortedHouseForUser(gid, actor, client),
    resolveSortedHouseForUser(gid, target, client),
  ]);
  if (!actorHouse || !targetHouse || actorHouse !== targetHouse) {
    return { ok: true, actorHouse, targetHouse };
  }
  const action = String(opts.actionLabel || "azioni economy").trim() || "azioni economy";
  return {
    ok: false,
    code: "same_house",
    houseId: actorHouse,
    message: `Non puoi usare ${action} contro qualcuno della tua stessa casata (**${sortedHouseLabel(actorHouse)}**).`,
  };
}

async function resolveSortedHouseForUser(guildId?, userId?, client?) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  if (!isValidGuildUserId(gid, uid)) return "";
  const evt = eventKey(client);
  const doc = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
    guildId: gid,
    userId: uid,
    dedupeKey: evt,
  })
    .select("status planKey")
    .lean()
    .catch(() => null);
  return normalizeSortedHouseId(doc?.status || doc?.planKey);
}

async function canBypassGamblingSortedGate(member?, client?, userId?, preview?) {
  if (preview) return true;
  return false;
}

async function checkGamblingUserEligibility(message?, client?, betRaw?, accessBase = null) {
  const access = accessBase?.ok != null ? accessBase : await assertEconomyAccess(message, client);
  if (!access.ok) return access;
  const cfg = access.cfg;
  const userId = normalizeId(message?.author?.id);
  const guildId = normalizeId(message?.guild?.id);
  if (!await canBypassGamblingSortedGate(message?.member, client, userId, access.preview)) {
    const house = await resolveSortedHouseForUser(guildId, userId, client);
    if (!house) {
      return { ok: false, message: "Completa prima lo smistamento Hogwarts per usare i giochi d'azzardo dell'evento." };
    }
  }
  const parsed = parseBet(betRaw == null ? cfg.minBet : betRaw, cfg);
  if (!parsed.ok) return parsed;
  const balance = await getGringottBalance(guildId, userId, eventKey(client));
  if (!balance || balance.balance <= 0) {
    return { ok: false, message: "Non hai Galeoni disponibili: ottieni monete dall'evento prima di giocare." };
  }
  if (balance.balance < parsed.amount) {
    return {
      ok: false,
      message: `Non hai abbastanza Galeoni.`,
    };
  }
  return { ok: true, preview: access.preview, cfg, betAmount: parsed.amount };
}

async function assertEconomyGamblingAccess(message?, client?, betRaw?) {
  return checkGamblingUserEligibility(message, client, betRaw);
}

function dayKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

async function getEconomyState(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({ guildId: normalizeId(guildId), userId: normalizeId(userId) })
    .select(ECONOMY_PATH)
    .lean()
    .catch(() => null);
  return doc?.profile?.events?.hogwarts?.economy && typeof doc.profile.events.hogwarts.economy === "object" ? doc.profile.events.hogwarts.economy : {};
}

async function getGamblingSpendableBalance(client?, guildId?, userId?) {
  const state = await getGringottBalance(guildId, userId, eventKey(client));
  return Math.max(0, Math.floor(Number(state?.balance) || 0));
}

function remainingMs(dateValue?) {
  const until = new Date(dateValue || 0).getTime();
  return Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0;
}

async function resolveActiveRobProtection(guildId?, userId?, cfg?, untilRaw?) {
  const left = remainingMs(untilRaw);
  if (left <= 0) {
    if (untilRaw) {
      await ActivityUserProfile.updateOne(
        { guildId: normalizeId(guildId), userId: normalizeId(userId) },
        { $unset: { [`${ECONOMY_PATH}.robProtectionUntil`]: "" }, $set: { [`${ECONOMY_PATH}.updatedAt`]: new Date() } },
      ).catch(() => null);
    }
    return { blocked: false, remainingMs: 0 };
  }
  const cap = Math.max(0, Number(cfg?.rob?.targetProtectionMs) || DEFAULT_CONFIG.rob.targetProtectionMs) + 60 * 60 * 1000;
  if (left > cap) {
    await ActivityUserProfile.updateOne(
      { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      { $unset: { [`${ECONOMY_PATH}.robProtectionUntil`]: "" }, $set: { [`${ECONOMY_PATH}.updatedAt`]: new Date() } },
    ).catch(() => null);
    return { blocked: false, remainingMs: 0 };
  }
  return {
    blocked: true,
    remainingMs: left,
    message: `Questo utente è protetto da un furto recente (ancora ${formatDuration(left)}).`,
  };
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
  const path = `${ECONOMY_PATH}.cooldowns.${action}`;
  const now = new Date();
  const until = new Date(now.getTime() + Math.max(0, Number(cooldownMs) || 0));
  const doc = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: normalizeId(guildId),
      userId: normalizeId(userId),
      $or: [
        { [path]: { $exists: false } },
        { [path]: { $lte: now } },
        { [path]: null },
      ],
    },
    {
      $setOnInsert: { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      $set: { [path]: until, [`${ECONOMY_PATH}.updatedAt`]: now },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (doc) return { ok: true, until };
  const state = await getEconomyState(guildId, userId);
  return { ok: false, remainingMs: remainingMs(state?.cooldowns?.[action]) };
}

async function releaseCooldown(guildId?, userId?, action?) {
  const path = `${ECONOMY_PATH}.cooldowns.${action}`;
  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    { $unset: { [path]: "" }, $set: { [`${ECONOMY_PATH}.updatedAt`]: new Date() } },
  ).catch(() => null);
}

async function peekRobCooldown(guildId?, userId?) {
  const state = await getEconomyState(guildId, userId);
  const left = remainingMs(state?.cooldowns?.rob);
  if (left > 0) {
    return {
      ok: false,
      code: "cooldown",
      remainingMs: left,
      message: `Puoi riprovare un furto tra ${formatDuration(left)}.`,
    };
  }
  return { ok: true, remainingMs: 0 };
}

async function clearRobCooldown(guildId?, userId?) {
  await releaseCooldown(guildId, userId, "rob");
  return { ok: true };
}

function isSoftRobTargetFail(result?) {
  const code = String(result?.code || "").trim();
  if (code === "protected" || code === "same_house") return true;
  const msg = String(result?.message || result?.error || "").toLowerCase();
  return msg.includes("protetto da un furto") || msg.includes("stessa casata");
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
    return "Errore temporaneo sul salvataggio Galeoni. Riprova tra qualche secondo.";
  }
  return "Non sono riuscito ad accreditare i Galeoni. Riprova più tardi.";
}

function randomBetween(min?, max?) {
  const a = Math.floor(Number(min) || 0);
  const b = Math.floor(Number(max) || a);
  return randomInt(Math.min(a, b), Math.max(a, b) + 1);
}

function resolveIncomeStreak(state?, action?, cfg?, baseAmount?) {
  const raw = state?.streaks?.[action] && typeof state.streaks[action] === "object" ? state.streaks[action] : {};
  const now = Date.now();
  const lastMs = raw.lastClaimAt ? new Date(raw.lastClaimAt).getTime() : 0;
  const consecutive = Number.isFinite(lastMs) && lastMs > 0 && now - lastMs <= cfg.streakGraceMs;
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
        [`${ECONOMY_PATH}.streaks.${action}.count`]: streak.count,
        [`${ECONOMY_PATH}.streaks.${action}.best`]: streak.best,
        [`${ECONOMY_PATH}.streaks.${action}.bonusPct`]: streak.bonusPct,
        [`${ECONOMY_PATH}.streaks.${action}.lastClaimAt`]: now,
        [`${ECONOMY_PATH}.updatedAt`]: now,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function creditIncome(client?, message?, action?, amount?, reason?) {
  const access = await assertEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  const stateBefore = await getEconomyState(message.guild.id, message.author.id);
  const reserve = await reserveCooldown(message.guild.id, message.author.id, action, access.cfg[action].cooldownMs);
  if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi riusare questo comando tra ${formatDuration(reserve.remainingMs)}.` };
  const baseAmount = Math.max(1, Math.floor(Number(amount) || 0));
  const streak = resolveIncomeStreak(stateBefore, action, access.cfg[action], baseAmount);
  const totalAmount = baseAmount + streak.bonusAmount;
  const untilMs = reserve.until instanceof Date ? reserve.until.getTime() : new Date(reserve.until || 0).getTime();
  const key = `${eventKey(client)}:economy:${action}:${message.author.id}:${untilMs}`;
  const out = await addGaleoni({ guildId: message.guild.id, userId: message.author.id, amount: totalAmount, reason, actorId: message.author.id, source: `economy_${action}`, eventKey: eventKey(client), rewardKey: key });
  if (!out?.ok) {
    await releaseCooldown(message.guild.id, message.author.id, action);
    global.logger?.warn?.(`[ECONOMY] creditIncome ${action} failed`, {
      code: out?.code || "unknown",
      userId: message.author.id,
      guildId: message.guild.id,
      rewardKey: key,
    });
    return { ok: false, code: out?.code, message: incomeCreditErrorMessage(action, out) };
  }
  await saveIncomeStreak(message.guild.id, message.author.id, action, streak);
  return { ok: true, amount: totalAmount, baseAmount, bonusAmount: streak.bonusAmount, streak, state: out.state, preview: access.preview };
}

async function claimWork(client?, message?) {
  const cfg = economyConfig(client);
  return creditIncome(client, message, "work", randomBetween(cfg.work.minReward, cfg.work.maxReward), "Lavoro magico completato");
}

async function peekWorkClaim(client?, message?) {
  const access = await assertEconomyAccess(message, client);
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
    preview: access.preview,
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
  const access = await assertEconomyAccess(message, client);
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
    preview: access.preview,
    cfg: access.cfg,
  };
}

function parseBet(raw?, cfg?) {
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 1));
  const configuredMax = Math.max(0, Math.floor(Number(cfg?.maxBet) || 0));
  const hardCeiling = configuredMax > 0 ? configuredMax : Number.MAX_SAFE_INTEGER;
  const amount = int(raw, 0, 0, hardCeiling);
  if (!amount) {
    const maxLabel = configuredMax > 0 ? formatGaleoni(configuredMax) : "il tuo saldo";
    return { ok: false, message: `Inserisci una puntata valida tra ${formatGaleoni(min)} e ${maxLabel}.` };
  }
  if (amount < min) return { ok: false, message: `La puntata minima è ${formatGaleoni(min)}.` };
  if (configuredMax > 0 && amount > configuredMax) {
    return { ok: false, message: `La puntata massima è ${formatGaleoni(configuredMax)}.` };
  }
  return { ok: true, amount };
}

async function checkBetCap(guildId?, userId?, amount?, cfg?) {
  const key = dayKey();
  const state = await getEconomyState(guildId, userId);
  const sameDay = state?.gambling?.dayKey === key;
  const current = sameDay ? int(state?.gambling?.wageredToday, 0) : 0;
  const cap = Math.max(0, Math.floor(Number(cfg?.dailyBetCap) || 0));
    if (cap > 0 && current + amount > cap) {
    return { ok: false, message: `Hai raggiunto il limite giornaliero di puntate (${formatGaleoni(cap)}).` };
  }
  return { ok: true, key, sameDay };
}

async function recordBet(guildId?, userId?, amount?, capState?) {
  const key = capState?.key || dayKey();
  const sameDay = capState?.sameDay === true;
  if (!sameDay) {
    await ActivityUserProfile.updateOne(
      { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      {
        $setOnInsert: { guildId: normalizeId(guildId), userId: normalizeId(userId) },
        $set: { [`${ECONOMY_PATH}.gambling.dayKey`]: key, [`${ECONOMY_PATH}.gambling.wageredToday`]: 0 },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    {
      $setOnInsert: { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      $set: { [`${ECONOMY_PATH}.gambling.dayKey`]: key },
      $inc: { [`${ECONOMY_PATH}.gambling.wageredToday`]: amount },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function spendBet(client?, message?, action?, bet?, options: Record<string, any> = {}) {
  const access = await assertEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  if (GAMBLING_ACTIONS.has(action) && access.cfg?.[action]?.enabled === false) {
    return { ok: false, code: "game_disabled", message: "Questo gioco è temporaneamente disattivato." };
  }
  let parsed;
  if (GAMBLING_ACTIONS.has(action)) {
    const gamb = await checkGamblingUserEligibility(message, client, bet, access);
    if (!gamb.ok) return gamb;
    parsed = { ok: true, amount: gamb.betAmount };
  } else {
    parsed = parseBet(bet, access.cfg);
    if (!parsed.ok) return parsed;
    const balance = await getGringottBalance(message.guild.id, message.author.id, eventKey(client));
    if (!balance || balance.balance < parsed.amount) return { ok: false, message: "Non hai abbastanza Galeoni per questa puntata.", state: balance };
  }
  const cap = await checkBetCap(message.guild.id, message.author.id, parsed.amount, access.cfg);
  if (!cap.ok) return cap;
  if (!options?.skipCooldown) {
    const reserve = await reserveCooldown(message.guild.id, message.author.id, action, access.cfg[action].cooldownMs);
    if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi rigiocare tra ${formatDuration(reserve.remainingMs)}.` };
  }
  const spent = await spendGaleoni({ guildId: message.guild.id, userId: message.author.id, amount: parsed.amount, reason: `${action}: puntata`, actorId: message.author.id, source: `economy_${action}`, eventKey: eventKey(client) });
  if (!spent?.ok) return { ok: false, message: "Non hai abbastanza Galeoni per questa puntata.", state: spent?.state };
  await recordBet(message.guild.id, message.author.id, parsed.amount, cap);
  return { ok: true, amount: parsed.amount, cfg: access.cfg, spent, preview: access.preview };
}

async function payout(client?, message?, action?, amount?, reason?) {
  if (amount <= 0) return null;
  return addGaleoni({ guildId: message.guild.id, userId: message.author.id, amount, reason, actorId: message.author.id, source: `economy_${action}`, eventKey: eventKey(client) });
}

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function normalizeRouletteChoice(choiceRaw?) {
  const choice = normalizeId(choiceRaw).toLowerCase();
  const normalizedChoice = choice === "red" ? "rosso" : choice === "black" ? "nero" : choice;
  const validSimple = ["rosso", "nero", "pari", "dispari"].includes(normalizedChoice);
  const isNumber = /^\d{1,2}$/.test(choice) && Number(choice) >= 0 && Number(choice) <= 36;
  if (!validSimple && !isNumber) {
    return { ok: false, message: "Scegli `rosso`, `nero`, `pari`, `dispari` oppure un numero da `0` a `36`." };
  }
  return { ok: true, choice: isNumber ? String(Number(choice)) : normalizedChoice, isNumber };
}

function spinRouletteResult() {
  const number = randomInt(0, 37);
  const color = number === 0 ? "verde" : RED_NUMBERS.has(number) ? "rosso" : "nero";
  const evenOdd = number === 0 ? "zero" : number % 2 === 0 ? "pari" : "dispari";
  return { number, color, evenOdd };
}

function evaluateRouletteWin(parsedChoice?, spin?) {
  const win = parsedChoice.isNumber
    ? Number(parsedChoice.choice) === spin.number
    : [spin.color, spin.evenOdd].includes(parsedChoice.choice);
  return win;
}

async function playRouletteBanked(client?, message?, betRaw?, choiceRaw?, options: Record<string, any> = {}) {
  const parsed = normalizeRouletteChoice(choiceRaw);
  if (!parsed.ok) return parsed;
  const bet = await spendBet(client, message, "roulette", betRaw, options);
  if (!bet.ok) return bet;
  const spin = spinRouletteResult();
  const win = evaluateRouletteWin(parsed, spin);
  const multiplier = parsed.isNumber ? bet.cfg.roulette.numberPayout : bet.cfg.roulette.simplePayout;
  const payoutAmount = win ? bet.amount * multiplier : 0;
  return {
    ok: true,
    game: "roulette",
    bet: bet.amount,
    win,
    payout: payoutAmount,
    choice: parsed.choice,
    isNumber: parsed.isNumber,
    result: { ...spin, choice: parsed.choice, isNumber: parsed.isNumber },
  };
}

async function playRoulette(client?, message?, betRaw?, choiceRaw?, options: Record<string, any> = {}) {
  const result = await playRouletteBanked(client, message, betRaw, choiceRaw, options);
  if (!result.ok) return result;
  const paid = await payout(client, message, "roulette", result.payout, "roulette: vincita");
  return { ...result, paid };
}

function normalizeRps(value?) {
  const v = normalizeId(value).toLowerCase();
  if (["rock", "sasso"].includes(v)) return "sasso";
  if (["paper", "carta"].includes(v)) return "carta";
  if (["scissors", "forbici", "forbice"].includes(v)) return "forbici";
  return "";
}

function evaluateRpsOutcome(choiceA?, choiceB?) {
  const a = normalizeRps(choiceA);
  const b = normalizeRps(choiceB);
  if (!a || !b) return { ok: false, draw: false, winnerSide: null };
  if (a === b) return { ok: true, draw: true, winnerSide: null };
  const aWins = (a === "sasso" && b === "forbici") || (a === "carta" && b === "sasso") || (a === "forbici" && b === "carta");
  return { ok: true, draw: false, winnerSide: aWins ? "a" : "b" };
}

async function assertEconomyAccessForUser(client?, guild?, member?, userId?) {
  return assertEconomyAccess({ guild, member, author: { id: normalizeId(userId), bot: false } }, client);
}

async function assertEconomyGamblingAccessForUser(client?, guild?, member?, userId?, betRaw?) {
  return assertEconomyGamblingAccess({ guild, member, author: { id: normalizeId(userId), bot: false } }, client, betRaw);
}

async function lockRpsPvpStakes(client?, guild?, challengerId?, opponentId?, betAmount?, actorId?) {
  const cfg = economyConfig(client);
  const parsed = parseBet(String(betAmount), cfg);
  if (!parsed.ok) return parsed;
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const houseGate = await assertDifferentHouses(client, guildId, challenger, opponent, {
    actionLabel: "le sfide PvP",
  });
  if (!houseGate.ok) return houseGate;
  const evt = eventKey(client);
  const stakes = [];
  for (const uid of [challenger, opponent]) {
    const member = await getGuildMemberCached(guild, uid, { preferFresh: false }).catch(() => null);
    const gamb = await assertEconomyGamblingAccessForUser(client, guild, member, uid, parsed.amount);
    if (!gamb.ok) {
      return { ok: false, message: uid === challenger ? gamb.message : `L'avversario: ${gamb.message}` };
    }
    const cap = await checkBetCap(guildId, uid, parsed.amount, cfg);
    if (!cap.ok) {
      return { ok: false, message: uid === challenger ? cap.message : "L'avversario ha raggiunto il limite giornaliero di puntate." };
    }
  }
  for (const uid of [challenger, opponent]) {
    const cap = await checkBetCap(guildId, uid, parsed.amount, cfg);
    const spent = await spendGaleoni({
      guildId,
      userId: uid,
      amount: parsed.amount,
      reason: "rps: puntata pvp",
      actorId: normalizeId(actorId) || uid,
      source: "economy_rps_pvp",
      eventKey: evt,
    });
    if (!spent?.ok) {
      for (const ref of stakes) {
        await addGaleoni({
          guildId,
          userId: ref.userId,
          amount: ref.amount,
          reason: "rps: rimborso pvp",
          actorId: normalizeId(actorId) || ref.userId,
          source: "economy_rps_pvp",
          eventKey: evt,
        }).catch(() => null);
      }
      return { ok: false, message: "Non sono riuscito a bloccare le puntate. Riprova." };
    }
    await recordBet(guildId, uid, parsed.amount, cap);
    stakes.push({ userId: uid, amount: parsed.amount });
  }
  return { ok: true, amount: parsed.amount, cfg, stakes };
}

async function refundRpsPvpStake(client?, guildId?, userId?, amount?, actorId?, reason = "rps: rimborso pvp") {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: true, amount: 0 };
  const paid = await addGaleoni({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
    amount: value,
    reason,
    actorId: normalizeId(actorId) || normalizeId(userId),
    source: "economy_rps_pvp",
    eventKey: eventKey(client),
  });
  return paid?.ok ? { ok: true, amount: value } : { ok: false, message: "Rimborso non riuscito." };
}

async function applyRpsCooldown(client?, guildId?, userId?, cfg?) {
  await reserveCooldown(normalizeId(guildId), normalizeId(userId), "rps", cfg?.rps?.cooldownMs ?? DEFAULT_CONFIG.rps.cooldownMs);
}

async function settleRpsPvp(client?, guild?, challengerId?, opponentId?, challengerChoice?, opponentChoice?, betAmount?, actorId?) {
  const cfg = economyConfig(client);
  const bet = Math.max(0, Math.floor(Number(betAmount) || 0));
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const outcome = evaluateRpsOutcome(challengerChoice, opponentChoice);
  if (!outcome.ok) return { ok: false, message: "Mosse non valide." };
  const evt = eventKey(client);
  const actor = normalizeId(actorId) || challenger;
  if (outcome.draw) {
    await refundRpsPvpStake(client, guildId, challenger, bet, actor, "rps: pareggio pvp");
    await refundRpsPvpStake(client, guildId, opponent, bet, actor, "rps: pareggio pvp");
    await applyRpsCooldown(client, guildId, challenger, cfg);
    await applyRpsCooldown(client, guildId, opponent, cfg);
    return {
      ok: true,
      game: "rps_pvp",
      draw: true,
      win: false,
      payout: bet,
      winnerId: null,
      loserId: null,
      result: { player: normalizeRps(challengerChoice), bot: normalizeRps(opponentChoice) },
    };
  }
  const winnerId = outcome.winnerSide === "a" ? challenger : opponent;
  const loserId = outcome.winnerSide === "a" ? opponent : challenger;
  const pot = bet * 2;
  const paid = await addGaleoni({
    guildId,
    userId: winnerId,
    amount: pot,
    reason: "rps: vincita pvp",
    actorId: actor,
    source: "economy_rps_pvp",
    eventKey: evt,
  });
  if (!paid?.ok) {
    await refundRpsPvpStake(client, guildId, challenger, bet, actor, "rps: errore vincita pvp");
    await refundRpsPvpStake(client, guildId, opponent, bet, actor, "rps: errore vincita pvp");
    return { ok: false, message: "Non sono riuscito a pagare la vincita. Le puntate sono state rimborsate." };
  }
  await applyRpsCooldown(client, guildId, challenger, cfg);
  await applyRpsCooldown(client, guildId, opponent, cfg);
  return {
    ok: true,
    game: "rps_pvp",
    draw: false,
    win: winnerId === challenger,
    payout: pot,
    winnerId,
    loserId,
    result: { player: normalizeRps(challengerChoice), bot: normalizeRps(opponentChoice) },
  };
}

async function playBlackjackBet(client?, message?, betRaw?, options: Record<string, any> = {}) {
  return spendBet(client, message, "blackjack", betRaw, options);
}

async function payBlackjackWin(client?, message?, amount?, reason = "blackjack: vincita") {
  return payout(client, message, "blackjack", amount, reason);
}

async function playTrisBet(client?, message?, betRaw?, options: Record<string, any> = {}) {
  return spendBet(client, message, "tris", betRaw, options);
}

async function payTrisWin(client?, message?, amount?, reason = "tris: vincita") {
  return payout(client, message, "tris", amount, reason);
}

async function lockTrisPvpStakes(client?, guild?, challengerId?, opponentId?, betAmount?, actorId?) {
  const cfg = economyConfig(client);
  if (cfg?.tris?.enabled === false) {
    return { ok: false, code: "game_disabled", message: "Il tris è temporaneamente disattivato." };
  }
  const parsed = parseBet(String(betAmount), cfg);
  if (!parsed.ok) return parsed;
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const houseGate = await assertDifferentHouses(client, guildId, challenger, opponent, {
    actionLabel: "le sfide PvP",
  });
  if (!houseGate.ok) return houseGate;
  const evt = eventKey(client);
  const stakes = [];
  for (const uid of [challenger, opponent]) {
    const member = await getGuildMemberCached(guild, uid, { preferFresh: false }).catch(() => null);
    const gamb = await assertEconomyGamblingAccessForUser(client, guild, member, uid, parsed.amount);
    if (!gamb.ok) {
      return { ok: false, message: uid === challenger ? gamb.message : `L'avversario: ${gamb.message}` };
    }
    const cap = await checkBetCap(guildId, uid, parsed.amount, cfg);
    if (!cap.ok) {
      return { ok: false, message: uid === challenger ? cap.message : "L'avversario ha raggiunto il limite giornaliero di puntate." };
    }
  }
  for (const uid of [challenger, opponent]) {
    const cap = await checkBetCap(guildId, uid, parsed.amount, cfg);
    const spent = await spendGaleoni({
      guildId,
      userId: uid,
      amount: parsed.amount,
      reason: "tris: puntata pvp",
      actorId: normalizeId(actorId) || uid,
      source: "economy_tris_pvp",
      eventKey: evt,
    });
    if (!spent?.ok) {
      for (const ref of stakes) {
        await addGaleoni({
          guildId,
          userId: ref.userId,
          amount: ref.amount,
          reason: "tris: rimborso pvp",
          actorId: normalizeId(actorId) || ref.userId,
          source: "economy_tris_pvp",
          eventKey: evt,
        }).catch(() => null);
      }
      return { ok: false, message: "Non sono riuscito a bloccare le puntate. Riprova." };
    }
    await recordBet(guildId, uid, parsed.amount, cap);
    stakes.push({ userId: uid, amount: parsed.amount });
  }
  return { ok: true, amount: parsed.amount, cfg, stakes };
}

async function refundTrisPvpStake(client?, guildId?, userId?, amount?, actorId?, reason = "tris: rimborso pvp") {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: true, amount: 0 };
  const paid = await addGaleoni({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
    amount: value,
    reason,
    actorId: normalizeId(actorId) || normalizeId(userId),
    source: "economy_tris_pvp",
    eventKey: eventKey(client),
  });
  return paid?.ok ? { ok: true, amount: value } : { ok: false, message: "Rimborso non riuscito." };
}

async function refundEconomyStake(client?, guildId?, userId?, amount?, actorId?, reason = "economy: rimborso chiusura", source = "economy_refund") {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: true, amount: 0 };
  const paid = await addGaleoni({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
    amount: value,
    reason,
    actorId: normalizeId(actorId) || normalizeId(userId),
    source: String(source || "economy_refund").slice(0, 48),
    eventKey: eventKey(client),
  });
  return paid?.ok ? { ok: true, amount: value } : { ok: false, message: "Rimborso non riuscito." };
}

async function applyTrisCooldown(client?, guildId?, userId?, cfg?) {
  await reserveCooldown(normalizeId(guildId), normalizeId(userId), "tris", cfg?.tris?.cooldownMs ?? DEFAULT_CONFIG.tris.cooldownMs);
}

async function settleTrisPvp(client?, guild?, challengerId?, opponentId?, winnerId?, draw?, betAmount?, actorId?) {
  const cfg = economyConfig(client);
  const bet = Math.max(0, Math.floor(Number(betAmount) || 0));
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const evt = eventKey(client);
  const actor = normalizeId(actorId) || challenger;
  const winId = normalizeId(winnerId);
  if (draw) {
    await refundTrisPvpStake(client, guildId, challenger, bet, actor, "tris: pareggio pvp");
    await refundTrisPvpStake(client, guildId, opponent, bet, actor, "tris: pareggio pvp");
    await applyTrisCooldown(client, guildId, challenger, cfg);
    await applyTrisCooldown(client, guildId, opponent, cfg);
    return { ok: true, game: "tris_pvp", draw: true, win: false, payout: bet, winnerId: null, loserId: null };
  }
  const loserId = winId === challenger ? opponent : challenger;
  const pot = bet * 2;
  const paid = await addGaleoni({
    guildId,
    userId: winId,
    amount: pot,
    reason: "tris: vincita pvp",
    actorId: actor,
    source: "economy_tris_pvp",
    eventKey: evt,
  });
  if (!paid?.ok) {
    await refundTrisPvpStake(client, guildId, challenger, bet, actor, "tris: errore vincita pvp");
    await refundTrisPvpStake(client, guildId, opponent, bet, actor, "tris: errore vincita pvp");
    return { ok: false, message: "Non sono riuscito a pagare la vincita. Le puntate sono state rimborsate." };
  }
  await applyTrisCooldown(client, guildId, challenger, cfg);
  await applyTrisCooldown(client, guildId, opponent, cfg);
  return {
    ok: true,
    game: "tris_pvp",
    draw: false,
    win: winId === challenger,
    payout: pot,
    winnerId: winId,
    loserId,
  };
}

async function playScratchBet(client?, message?, betRaw?, options: Record<string, any> = {}) {
  return spendBet(client, message, "scratch", betRaw, options);
}

async function payScratchWin(client?, message?, amount?, reason = "scratch: vincita") {
  return payout(client, message, "scratch", amount, reason);
}

function normalizeCoinChoice(value?) {
  const v = String(value || "").trim().toLowerCase();
  if (["heads", "head", "testa", "t", "h"].includes(v)) return "testa";
  if (["tails", "tail", "croce", "c", "cross"].includes(v)) return "croce";
  return ["testa", "croce"].includes(v) ? v : "";
}

async function playCoinflip(client?, message?, betRaw?, choiceRaw?, options: Record<string, any> = {}) {
  const player = normalizeCoinChoice(choiceRaw);
  if (!player) return { ok: false, message: "Scegli `testa` o `croce`." };
  const bet = await spendBet(client, message, "coinflip", betRaw, options);
  if (!bet.ok) return bet;
  const flip = ["testa", "croce"][randomInt(0, 2)];
  const win = player === flip;
  const payoutAmount = win ? bet.amount * bet.cfg.coinflip.winPayout : 0;
  const paid = await payout(client, message, "coinflip", payoutAmount, "coinflip: vincita");
  return { ok: true, game: "coinflip", bet: bet.amount, win, payout: payoutAmount, paid, result: { player, flip } };
}

async function playRps(client?, message?, betRaw?, choiceRaw?, options: Record<string, any> = {}) {
  const player = normalizeRps(choiceRaw);
  if (!player) return { ok: false, message: "Scegli `sasso`, `carta` o `forbici`." };
  const bet = await spendBet(client, message, "rps", betRaw, options);
  if (!bet.ok) return bet;
    const counter = { sasso: "carta", carta: "forbici", forbici: "sasso" };
  const bot = randomInt(1, 101) <= 4 ? counter[player] : ["sasso", "carta", "forbici"][randomInt(0, 3)];
  const draw = player === bot;
  const win = !draw && ((player === "sasso" && bot === "forbici") || (player === "carta" && bot === "sasso") || (player === "forbici" && bot === "carta"));
  const payoutAmount = draw ? bet.amount : win ? bet.amount * bet.cfg.rps.winPayout : 0;
  const paid = await payout(client, message, "rps", payoutAmount, draw ? "rps: pareggio" : "rps: vincita");
  return { ok: true, game: "rps", bet: bet.amount, win, draw, payout: payoutAmount, paid, result: { player, bot } };
}

async function playSlots(client?, message?, betRaw?, options: Record<string, any> = {}) {
  const result = await playSlotsBanked(client, message, betRaw, options);
  if (!result.ok) return result;
  const paid = await payout(client, message, "slots", result.payout, "slots: vincita");
  return { ...result, paid };
}

async function playSlotsBanked(client?, message?, betRaw?, options: Record<string, any> = {}) {
  const bet = await spendBet(client, message, "slots", betRaw, options);
  if (!bet.ok) return bet;
  const symbols = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
  const reels = [symbols[randomInt(0, symbols.length)], symbols[randomInt(0, symbols.length)], symbols[randomInt(0, symbols.length)]];
    const triple = reels[0] === reels[1] && reels[1] === reels[2];
  const adjacentPair = !triple && reels[0] === reels[1];
  const jackpot = triple && reels[0] === "7️⃣";
  const multiplier = jackpot
    ? bet.cfg.slots.jackpotPayout
    : triple
      ? bet.cfg.slots.triplePayout
      : adjacentPair
        ? bet.cfg.slots.pairPayout
        : 0;
  const payoutAmount = bet.amount * multiplier;
  return { ok: true, game: "slots", bet: bet.amount, win: payoutAmount > 0, payout: payoutAmount, result: { reels, multiplier } };
}

async function cashoutSlotsBank(client?, message?, amount?) {
  const access = await assertEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: false, message: "<a:VC_Cross:1482532424570376253> Non hai vincite da riscuotere in questa sessione." };
  const paid = await payout(client, message, "slots", value, "slots: riscossione sessione");
  if (!paid?.ok) return { ok: false, message: "<a:VC_Cross:1482532424570376253> Non sono riuscito ad accreditare la vincita. Riprova." };
  return { ok: true, paid, amount: value };
}

async function flushSlotsGuiPendingBank(client?, message?) {
  const access = await assertEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  const { takeUserSlotsGuiPending, clearSlotsGuiSession } = require("./slotsGuiSessionStore") as typeof import("./slotsGuiSessionStore");
  const pending = await takeUserSlotsGuiPending(message.guild.id, message.author.id);
  if (!pending?.bank) return { ok: true, amount: 0 };
  const out = await cashoutSlotsBank(client, message, pending.bank);
  if (!out.ok) return out;
  await clearSlotsGuiSession(message.guild.id, message.author.id, pending.raw.messageId);
  return { ok: true, amount: out.amount, auto: true };
}

async function listRobCandidateUserIds(client?, guildId?, robberId?, cfg?) {
  const gid = normalizeId(guildId);
  const robber = normalizeId(robberId);
  const minBal = Math.max(1, Math.floor(Number(cfg?.rob?.minTargetBalance) || DEFAULT_CONFIG.rob.minTargetBalance));
  if (!gid || !robber) return [];
  const robberHouse = await resolveSortedHouseForUser(gid, robber, client);
  const now = new Date();
  const rich = await ActivityUserProfile.find({
    guildId: gid,
    userId: { $ne: robber },
    $or: [
      { "profile.events.hogwarts.gringott.balance": { $gte: minBal } },
      { "profile.events.hogwarts.balance": { $gte: minBal } },
    ],
  })
    .select({ userId: 1, [`${ECONOMY_PATH}.robProtectionUntil`]: 1 })
    .lean()
    .catch(() => []);
  if (!Array.isArray(rich) || !rich.length) return [];
  const uids = rich.map((row?) => normalizeId(row?.userId)).filter(Boolean);
  const sortings = await SiteDocument.find({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
    guildId: gid,
    userId: { $in: uids },
    dedupeKey: eventKey(client),
  })
    .select({ userId: 1, status: 1, planKey: 1 })
    .lean()
    .catch(() => []);
  const houseByUser = new Map();
  for (const doc of Array.isArray(sortings) ? sortings : []) {
    const house = normalizeSortedHouseId(doc?.status || doc?.planKey);
    if (house) houseByUser.set(normalizeId(doc.userId), house);
  }
  const out = [];
  for (const row of rich) {
    const uid = normalizeId(row?.userId);
    if (!uid) continue;
    const house = houseByUser.get(uid) || "";
    if (!house) continue;
    if (robberHouse && house === robberHouse) continue;
    const prot = row?.profile?.events?.hogwarts?.economy?.robProtectionUntil;
    if (prot && remainingMs(prot) > 0) continue;
    out.push(uid);
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function evaluateRobTarget(client?, guild?, targetUserId?, cfg?, robberId?) {
  const guildId = normalizeId(guild?.id);
  const uid = normalizeId(targetUserId);
  const robber = normalizeId(robberId);
  const minBal = Math.max(1, Math.floor(Number(cfg?.rob?.minTargetBalance) || DEFAULT_CONFIG.rob.minTargetBalance));
  if (!isValidGuildUserId(guildId, uid)) return { ok: false, message: "Bersaglio non valido." };
  if (uid === robber) return { ok: false, message: "Non puoi derubare te stesso." };
  let member = guild?.members?.cache?.get(uid) || null;
  if (!member?.user && guild) {
    member = await getGuildMemberCached(guild, uid, { preferFresh: false }).catch(() => null);
  }
  if (!member?.user || member.user.bot) return { ok: false, message: "Scegli un utente valido da derubare." };
  if (!await isMember(member, client, uid)) return { ok: false, message: "Puoi derubare solo membri con economia Galeoni attiva." };
  const house = await resolveSortedHouseForUser(guildId, uid, client);
  if (!house) return { ok: false, message: "Questo utente non ha completato lo smistamento Hogwarts." };
  const robberHouse = await resolveSortedHouseForUser(guildId, robber, client);
  if (robberHouse && robberHouse === house) {
    return {
      ok: false,
      code: "same_house",
      message: `Non puoi derubare qualcuno della tua stessa casata (**${sortedHouseLabel(house)}**).`,
    };
  }
  const targetState = await getEconomyState(guildId, uid);
  const prot = await resolveActiveRobProtection(guildId, uid, cfg, targetState?.robProtectionUntil);
  if (prot.blocked) {
    return { ok: false, code: "protected", message: prot.message };
  }
  const targetBalance = await getGringottBalance(guildId, uid, eventKey(client));
  const balance = Math.max(0, Math.floor(Number(targetBalance?.balance) || 0));
  if (balance < minBal) {
    return { ok: false, code: "low_balance", message: `Il bersaglio deve avere almeno ${formatGaleoni(minBal)} (saldo ${formatGaleoni(balance)}).` };
  }
  return { ok: true, balance, house };
}

async function assertRobberCanSteal(client?, message?) {
  const access = await assertEconomyAccess(message, client);
  if (!access.ok) return access;
  if (!await canBypassGamblingSortedGate(message.member, client, message.author.id, access.preview)) {
    const robberHouse = await resolveSortedHouseForUser(message.guild.id, message.author.id, client);
    if (!robberHouse) return { ok: false, message: "Completa prima lo smistamento Hogwarts per tentare un furto." };
  }
  const { assertRobberHasBroom } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
  const broom = await assertRobberHasBroom(client, message.guild?.id, message.author?.id);
  if (!broom.ok) return broom;
  return access;
}

async function robBank(client?, message?) {
  const access: any = await assertRobberCanSteal(client, message);
  if (!access.ok) return { ok: false, message: access.message };
  const reserve = await reserveCooldown(message.guild.id, message.author.id, "rob", access.cfg.rob.cooldownMs);
  if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi riprovare un furto tra ${formatDuration(reserve.remainingMs)}.` };
  const { resolveRobSuccessChance, scaleRobFailPenalty } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
  const robChance = await resolveRobSuccessChance(client, message.guild.id, message.author.id, access.cfg.rob.successChance);
  const success = randomInt(1, 101) <= robChance.chance;
  if (!success) {
    const scaled = scaleRobFailPenalty(access.cfg.rob.failPenalty, robChance.chance);
    const penalty = Math.min(scaled, (await getGringottBalance(message.guild.id, message.author.id, eventKey(client)))?.balance || 0);
    if (penalty > 0) {
      await spendGaleoni({ guildId: message.guild.id, userId: message.author.id, amount: penalty, reason: "rob: multa fallimento cassaforte", actorId: message.author.id, source: "economy_rob", eventKey: eventKey(client) });
    }
    return { ok: true, game: "rob", success: false, penalty, bank: true };
  }
  const steal = randomBetween(access.cfg.rob.minSteal, access.cfg.rob.maxSteal);
  const gained = await addGaleoni({ guildId: message.guild.id, userId: message.author.id, amount: steal, reason: "Furto cassaforte Gringott", actorId: message.author.id, source: "economy_rob", eventKey: eventKey(client) });
  if (!gained?.ok) return { ok: false, message: "Non sono riuscito ad accreditare il bottino. Riprova più tardi." };
  return { ok: true, game: "rob", success: true, amount: steal, gained, bank: true };
}

async function rob(client?, message?, targetUser?) {
  const access: any = await assertRobberCanSteal(client, message);
  if (!access.ok) return { ok: false, message: access.message };
  if (!targetUser || targetUser.bot) return { ok: false, message: "Scegli un utente valido da derubare." };
  const targetCheck = await evaluateRobTarget(client, message.guild, targetUser.id, access.cfg, message.author.id);
  if (!targetCheck.ok) {
    if (isSoftRobTargetFail(targetCheck)) {
      await releaseCooldown(message.guild.id, message.author.id, "rob");
    }
    return { ok: false, code: targetCheck.code || "target_blocked", message: targetCheck.message };
  }
  const reserve = await reserveCooldown(message.guild.id, message.author.id, "rob", access.cfg.rob.cooldownMs);
  if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi riprovare un furto tra ${formatDuration(reserve.remainingMs)}.` };
    const liveCheck = await evaluateRobTarget(client, message.guild, targetUser.id, access.cfg, message.author.id);
  if (!liveCheck.ok) {
    await releaseCooldown(message.guild.id, message.author.id, "rob");
    return { ok: false, code: liveCheck.code || "target_blocked", message: liveCheck.message };
  }
  const targetBalance = { balance: liveCheck.balance };
  const { resolveRobSuccessChance, scaleRobFailPenalty } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
  const robChance = await resolveRobSuccessChance(client, message.guild.id, message.author.id, access.cfg.rob.successChance);
  const success = randomInt(1, 101) <= robChance.chance;
  if (!success) {
    const scaled = scaleRobFailPenalty(access.cfg.rob.failPenalty, robChance.chance);
    const penalty = Math.min(scaled, (await getGringottBalance(message.guild.id, message.author.id, eventKey(client)))?.balance || 0);
    if (penalty > 0) {
      await spendGaleoni({ guildId: message.guild.id, userId: message.author.id, amount: penalty, reason: "rob: multa fallimento", actorId: message.author.id, source: "economy_rob", eventKey: eventKey(client) });
    }
    return { ok: true, game: "rob", success: false, penalty, bank: false };
  }
  const steal = Math.min(randomBetween(access.cfg.rob.minSteal, access.cfg.rob.maxSteal), targetBalance.balance);
  const taken = await spendGaleoni({ guildId: message.guild.id, userId: targetUser.id, amount: steal, reason: `Furto subito da ${message.author.id}`, actorId: message.author.id, source: "economy_rob", eventKey: eventKey(client) });
  if (!taken?.ok) {
    await releaseCooldown(message.guild.id, message.author.id, "rob");
    return { ok: false, message: "Il furto è fallito: saldo bersaglio non disponibile." };
  }
  const gained = await addGaleoni({ guildId: message.guild.id, userId: message.author.id, amount: steal, reason: `Furto riuscito su ${targetUser.id}`, actorId: message.author.id, source: "economy_rob", eventKey: eventKey(client) });
  await ActivityUserProfile.updateOne(
    { guildId: message.guild.id, userId: targetUser.id },
    { $set: { [`${ECONOMY_PATH}.robProtectionUntil`]: new Date(Date.now() + access.cfg.rob.targetProtectionMs) } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return { ok: true, game: "rob", success: true, amount: steal, gained, bank: false };
}

function parsePayAmount(raw?) {
    const amount = int(raw, 0, 1);
  if (!amount) return { ok: false, message: "Inserisci un importo valido (minimo 1 Galeone)." };
  return { ok: true, amount };
}

async function transferGaleoni(client?, message?, targetUser?, amountRaw?) {
  const access = await assertSortedEconomyAccess(message, client);
  if (!access.ok) return access;
  if (!targetUser || targetUser.bot) return { ok: false, message: "Scegli un utente valido a cui inviare Galeoni." };
  if (String(targetUser.id) === String(message.author.id)) return { ok: false, message: "Non puoi inviare Galeoni a te stesso." };
  const parsed = parsePayAmount(amountRaw);
  if (!parsed.ok) return parsed;
  const guildId = normalizeId(message.guild.id);
  const senderId = normalizeId(message.author.id);
  const targetId = normalizeId(targetUser.id);
  const evt = eventKey(client);
  const senderBalance = await getGringottBalance(guildId, senderId, evt);
  if (!senderBalance || senderBalance.balance < parsed.amount) {
    return { ok: false, message: "Non hai abbastanza Galeoni per questo pagamento." };
  }
  const spent = await spendGaleoni({
    guildId,
    userId: senderId,
    amount: parsed.amount,
    reason: `Pagamento a ${targetUser.username || targetId}`,
    actorId: targetId,
    source: "economy_pay",
    eventKey: evt,
  });
  if (!spent?.ok) return { ok: false, message: "Non ho potuto prelevare i Galeoni dal tuo conto. Riprova." };
  const credited = await addGaleoni({
    guildId,
    userId: targetId,
    amount: parsed.amount,
    reason: `Pagamento da ${message.author.username || senderId}`,
    actorId: senderId,
    source: "economy_pay",
    eventKey: evt,
  });
  if (!credited?.ok) {
    await addGaleoni({
      guildId,
      userId: senderId,
      amount: parsed.amount,
      reason: "Rimborso pagamento fallito",
      actorId: senderId,
      source: "economy_pay_refund",
      eventKey: evt,
    }).catch(() => null);
    return { ok: false, message: "Non sono riuscito a completare il pagamento. I Galeoni ti sono stati restituiti." };
  }
  return {
    ok: true,
    amount: parsed.amount,
    senderState: spent.state,
    recipientState: credited.state,
    targetUser,
  };
}

export = { ROB_BANK_TARGET_ID, assertDifferentHouses, assertEconomyAccess, assertEconomyAccessForUser, assertEconomyGamblingAccess, assertEconomyGamblingAccessForUser, assertSortedEconomyAccess, applyRpsCooldown, applyTrisCooldown, cashoutSlotsBank, claimFixed, claimWork, clearRobCooldown, economyConfig, evaluateRobTarget, evaluateRouletteWin, evaluateRpsOutcome, eventKey, flushSlotsGuiPendingBank, formatDuration, getGamblingSpendableBalance, isGaleoniEconomyUnlocked, isHighStaff, isRobBankTarget, isSoftRobTargetFail, listRobCandidateUserIds, lockRpsPvpStakes, lockTrisPvpStakes, normalizeCoinChoice, normalizeRouletteChoice, normalizeRps, parsePayAmount, payBlackjackWin, payScratchWin, payTrisWin, payout, peekFixedClaim, peekRobCooldown, peekWorkClaim, playBlackjackBet, playCoinflip, playRoulette, playRouletteBanked, playRps, playScratchBet, playSlots, playSlotsBanked, playTrisBet, refundEconomyStake, refundRpsPvpStake, refundTrisPvpStake, rob, robBank, RED_NUMBERS, resolveSortedHouseForUser, settleRpsPvp, settleTrisPvp, spendBet, spinRouletteResult, sortedHouseLabel, transferGaleoni };