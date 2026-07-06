const serverSvc = () => require("./serverEconomyService");
const galeoniSvc = () => require("./galeoniEconomyService");

function resolveEconomyMode(client, nowMs = Date.now()) {
  if (serverSvc().isServerEconomyEnabled(client)) return "server";
  if (galeoniSvc().isGaleoniEconomyUnlocked(client, nowMs)) return "galeoni";
  return null;
}

function isEconomyCommandsVisible(client, nowMs = Date.now()) {
  return resolveEconomyMode(client, nowMs) !== null;
}

function pick(client, nowMs = Date.now()) {
  const mode = resolveEconomyMode(client, nowMs);
  if (mode === "galeoni") return galeoniSvc();
  if (mode === "server") return serverSvc();
  return null;
}

function galeoniUnlockLabel(client) {
  const cfg = galeoniSvc().economyConfig(client);
  const start = new Date(cfg.startDate);
  if (!Number.isFinite(start.getTime())) return "alla data di inizio evento";
  return start.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Rome",
  });
}

async function economyDisabledAccess(client) {
  const cfg = galeoniSvc().economyConfig(client);
  if (cfg.enabled && !galeoniSvc().isGaleoniEconomyUnlocked(client)) {
    return { ok: false, message: `L'economia Galeoni si sblocca ${galeoniUnlockLabel(client)}.` };
  }
  return { ok: false, message: "L'economia è disattivata." };
}

function economyConfig(client) {
  const svc = pick(client);
  return svc ? svc.economyConfig(client) : serverSvc().economyConfig(client);
}

function isServerEconomyEnabled(client) {
  return serverSvc().isServerEconomyEnabled(client);
}

function robBankTargetId(client) {
  return resolveEconomyMode(client) === "galeoni" ? galeoniSvc().ROB_BANK_TARGET_ID : serverSvc().ROB_BANK_TARGET_ID;
}

function isRobBankTarget(targetId) {
  const id = String(targetId || "").trim().toLowerCase();
  return serverSvc().isRobBankTarget(id) || galeoniSvc().isRobBankTarget(id);
}

async function assertServerEconomyAccess(message, client) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().assertSortedEconomyAccess(message, client);
  if (mode === "server") return serverSvc().assertServerEconomyAccess(message, client);
  return economyDisabledAccess(client);
}

async function assertEconomyGamblingAccess(message, client, betRaw, currencyRaw = null) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().assertEconomyGamblingAccess(message, client, betRaw);
  if (mode === "server") return serverSvc().assertEconomyGamblingAccess(message, client, betRaw, currencyRaw);
  return economyDisabledAccess(client);
}

async function assertEconomyGamblingAccessForUser(client, guild, member, userId, betRaw, currencyRaw = null) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().assertEconomyGamblingAccessForUser(client, guild, member, userId, betRaw);
  if (mode === "server") return serverSvc().assertEconomyGamblingAccessForUser(client, guild, member, userId, betRaw, currencyRaw);
  return economyDisabledAccess(client);
}

async function claimWork(client, message) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.claimWork(client, message);
}

async function claimFixed(client, message, incomeType) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.claimFixed(client, message, incomeType);
}

async function peekWorkClaim(client, message) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.peekWorkClaim(client, message);
}

async function peekFixedClaim(client, message, incomeType) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.peekFixedClaim(client, message, incomeType);
}

async function isHighStaff(member, client, userId) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().isHighStaff(member, client, userId);
  return serverSvc().isHighStaff(member, client, userId);
}

function gamblingCall(client, name, args, trimCurrencyAt = null) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni" && trimCurrencyAt != null && args.length > trimCurrencyAt) {
    return svc[name](...args.slice(0, trimCurrencyAt));
  }
  return svc[name](...args);
}

async function playRoulette(client, message, betRaw, choiceRaw, currency) {
  return gamblingCall(client, "playRoulette", [client, message, betRaw, choiceRaw, currency], 4);
}

async function playRouletteBanked(client, message, betRaw, choiceRaw, currency) {
  return gamblingCall(client, "playRouletteBanked", [client, message, betRaw, choiceRaw, currency], 4);
}

async function playCoinflip(client, message, betRaw, choiceRaw, currency) {
  return gamblingCall(client, "playCoinflip", [client, message, betRaw, choiceRaw, currency], 4);
}

async function playRps(client, message, betRaw, choiceRaw, currency) {
  return gamblingCall(client, "playRps", [client, message, betRaw, choiceRaw, currency], 4);
}

async function playBlackjackBet(client, message, betRaw, currency) {
  return gamblingCall(client, "playBlackjackBet", [client, message, betRaw, currency], 3);
}

async function playTrisBet(client, message, betRaw, currency) {
  return gamblingCall(client, "playTrisBet", [client, message, betRaw, currency], 3);
}

async function playScratchBet(client, message, betRaw, currency) {
  return gamblingCall(client, "playScratchBet", [client, message, betRaw, currency], 3);
}

async function playSlots(client, message, betRaw, currency) {
  return gamblingCall(client, "playSlots", [client, message, betRaw, currency], 3);
}

async function playSlotsBanked(client, message, betRaw, currency) {
  return gamblingCall(client, "playSlotsBanked", [client, message, betRaw, currency], 3);
}

async function payBlackjackWin(client, message, amount, currency, reason) {
  return gamblingCall(client, "payBlackjackWin", [client, message, amount, currency, reason], 4);
}

async function payTrisWin(client, message, amount, currency, reason) {
  return gamblingCall(client, "payTrisWin", [client, message, amount, currency, reason], 4);
}

async function payScratchWin(client, message, amount, currency, reason) {
  return gamblingCall(client, "payScratchWin", [client, message, amount, currency, reason], 4);
}

async function cashoutSlotsBank(client, message, amount, currency) {
  return gamblingCall(client, "cashoutSlotsBank", [client, message, amount, currency], 3);
}

async function flushSlotsGuiPendingBank(client, message, currency) {
  return gamblingCall(client, "flushSlotsGuiPendingBank", [client, message, currency], 2);
}

async function robBank(client, message, currency) {
  return gamblingCall(client, "robBank", [client, message, currency], 2);
}

async function rob(client, message, targetUser, currency) {
  return gamblingCall(client, "rob", [client, message, targetUser, currency], 3);
}

async function lockRpsPvpStakes(client, guild, challengerId, opponentId, betAmount, actorId, currency) {
  return gamblingCall(client, "lockRpsPvpStakes", [client, guild, challengerId, opponentId, betAmount, actorId, currency], 6);
}

async function lockTrisPvpStakes(client, guild, challengerId, opponentId, betAmount, actorId, currency) {
  return gamblingCall(client, "lockTrisPvpStakes", [client, guild, challengerId, opponentId, betAmount, actorId, currency], 6);
}

async function refundRpsPvpStake(client, guildId, userId, amount, actorId, currency, reason) {
  return gamblingCall(client, "refundRpsPvpStake", [client, guildId, userId, amount, actorId, currency, reason], 6);
}

async function refundTrisPvpStake(client, guildId, userId, amount, actorId, currency, reason) {
  return gamblingCall(client, "refundTrisPvpStake", [client, guildId, userId, amount, actorId, currency, reason], 6);
}

async function settleRpsPvp(client, guild, challengerId, opponentId, challengerChoice, opponentChoice, betAmount, actorId, currency) {
  return gamblingCall(client, "settleRpsPvp", [client, guild, challengerId, opponentId, challengerChoice, opponentChoice, betAmount, actorId, currency], 8);
}

async function settleTrisPvp(client, guild, challengerId, opponentId, winnerId, draw, betAmount, actorId, currency) {
  return gamblingCall(client, "settleTrisPvp", [client, guild, challengerId, opponentId, winnerId, draw, betAmount, actorId, currency], 8);
}

async function evaluateRobTarget(client, guild, targetUserId, cfg, robberId, currency) {
  return gamblingCall(client, "evaluateRobTarget", [client, guild, targetUserId, cfg, robberId, currency], 5);
}

async function spendBet(client, message, action, bet, currency) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") return svc.spendBet(client, message, action, bet);
  return svc.spendBet(client, message, action, bet, currency);
}

async function applyRpsCooldown(client, guildId, userId, cfg) {
  const svc = pick(client);
  if (!svc) return null;
  return svc.applyRpsCooldown(client, guildId, userId, cfg);
}

async function applyTrisCooldown(client, guildId, userId, cfg) {
  const svc = pick(client);
  if (!svc) return null;
  return svc.applyTrisCooldown(client, guildId, userId, cfg);
}

const server = serverSvc();

module.exports = {
  CURRENCY_CAFFE: server.CURRENCY_CAFFE,
  CURRENCY_VINILI: server.CURRENCY_VINILI,
  DEFAULT_CONFIG: server.DEFAULT_CONFIG,
  RED_NUMBERS: server.RED_NUMBERS,
  ROB_BANK_TARGET_ID: server.ROB_BANK_TARGET_ID,
  applyRpsCooldown,
  applyTrisCooldown,
  assertEconomyGamblingAccess,
  assertEconomyGamblingAccessForUser,
  assertServerEconomyAccess,
  cashoutSlotsBank,
  claimFixed,
  claimWork,
  defaultBetCurrency: (...args) => server.defaultBetCurrency(...args),
  economyConfig,
  evaluateRobTarget,
  evaluateRouletteWin: (...args) => server.evaluateRouletteWin(...args),
  evaluateRpsOutcome: (...args) => server.evaluateRpsOutcome(...args),
  flushSlotsGuiPendingBank,
  formatCaffe: (...args) => server.formatCaffe(...args),
  formatCurrency: (...args) => server.formatCurrency(...args),
  formatDuration: (...args) => server.formatDuration(...args),
  formatEconomyAmount: (...args) => server.formatEconomyAmount(...args),
  formatVinili: (...args) => server.formatVinili(...args),
  isEconomyCommandsVisible,
  isHighStaff,
  isMember: (...args) => server.isMember(...args),
  isGaleoniEconomyUnlocked: (...args) => galeoniSvc().isGaleoniEconomyUnlocked(...args),
  isRobBankTarget,
  isServerEconomyEnabled,
  lockRpsPvpStakes,
  lockTrisPvpStakes,
  normalizeCoinChoice: (...args) => server.normalizeCoinChoice(...args),
  normalizeCurrency: (...args) => server.normalizeCurrency(...args),
  normalizeRouletteChoice: (...args) => server.normalizeRouletteChoice(...args),
  normalizeRps: (...args) => server.normalizeRps(...args),
  parseCurrencyArg: (...args) => server.parseCurrencyArg(...args),
  payBlackjackWin,
  payScratchWin,
  payTrisWin,
  peekFixedClaim,
  peekWorkClaim,
  playBlackjackBet,
  playCoinflip,
  playRoulette,
  playRouletteBanked,
  playRps,
  playScratchBet,
  playSlots,
  playSlotsBanked,
  refundRpsPvpStake,
  refundTrisPvpStake,
  resolveEconomyMode,
  rob,
  robBank,
  robBankTargetId,
  settleRpsPvp,
  settleTrisPvp,
  spinRouletteResult: (...args) => server.spinRouletteResult(...args),
  spendBet,
  splitDualReward: (...args) => server.splitDualReward(...args),
};
