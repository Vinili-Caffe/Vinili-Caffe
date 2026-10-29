const serverSvc = () => require("./serverEconomyService");
const galeoniSvc = () => require("./galeoniEconomyService");

function resolveEconomyMode(client?, nowMs = Date.now()) {
  if (serverSvc().isServerEconomyEnabled(client)) return "server";
  if (galeoniSvc().isGaleoniEconomyUnlocked(client, nowMs)) return "galeoni";
  return null;
}

function isEconomyCommandsVisible(client?, nowMs = Date.now()) {
  return resolveEconomyMode(client, nowMs) !== null;
}

function isEconomyGameEnabled(client?, action?) {
  const key = String(action || "").trim().toLowerCase();
  if (!key) return false;
  const cfg = economyConfig(client);
  const game = cfg?.[key];
  if (!game || typeof game !== "object") return true;
  return game.enabled !== false;
}

function pick(client?, nowMs = Date.now()) {
  const mode = resolveEconomyMode(client, nowMs);
  if (mode === "galeoni") return galeoniSvc();
  if (mode === "server") return serverSvc();
  return null;
}

function galeoniUnlockLabel(client?) {
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

async function economyDisabledAccess(client?) {
  const cfg = galeoniSvc().economyConfig(client);
  if (cfg.enabled && !galeoniSvc().isGaleoniEconomyUnlocked(client)) {
    return { ok: false, message: `L'economia Galeoni si sblocca ${galeoniUnlockLabel(client)}.` };
  }
  return { ok: false, message: "L'economia è disattivata." };
}

function economyConfig(client?) {
  const svc = pick(client);
  return svc ? svc.economyConfig(client) : serverSvc().economyConfig(client);
}

function isServerEconomyEnabled(client?) {
  return serverSvc().isServerEconomyEnabled(client);
}

function robBankTargetId(client?) {
  return resolveEconomyMode(client) === "galeoni" ? galeoniSvc().ROB_BANK_TARGET_ID : serverSvc().ROB_BANK_TARGET_ID;
}

function isRobBankTarget(targetId?) {
  const id = String(targetId || "").trim().toLowerCase();
  return serverSvc().isRobBankTarget(id) || galeoniSvc().isRobBankTarget(id);
}

async function assertServerEconomyAccess(message?, client?) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().assertSortedEconomyAccess(message, client);
  if (mode === "server") return serverSvc().assertServerEconomyAccess(message, client);
  return economyDisabledAccess(client);
}

async function assertEconomyGamblingAccess(message?, client?, betRaw?, currencyRaw = null) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().assertEconomyGamblingAccess(message, client, betRaw);
  if (mode === "server") return serverSvc().assertEconomyGamblingAccess(message, client, betRaw, currencyRaw);
  return economyDisabledAccess(client);
}

async function assertEconomyGamblingAccessForUser(client?, guild?, member?, userId?, betRaw?, currencyRaw = null) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().assertEconomyGamblingAccessForUser(client, guild, member, userId, betRaw);
  if (mode === "server") return serverSvc().assertEconomyGamblingAccessForUser(client, guild, member, userId, betRaw, currencyRaw);
  return economyDisabledAccess(client);
}

async function claimWork(client?, message?) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.claimWork(client, message);
}

async function claimFixed(client?, message?, incomeType?) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.claimFixed(client, message, incomeType);
}

async function peekWorkClaim(client?, message?) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.peekWorkClaim(client, message);
}

async function peekFixedClaim(client?, message?, incomeType?) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  return svc.peekFixedClaim(client, message, incomeType);
}

async function isHighStaff(member?, client?, userId?) {
  const mode = resolveEconomyMode(client);
  if (mode === "galeoni") return galeoniSvc().isHighStaff(member, client, userId);
  return serverSvc().isHighStaff(member, client, userId);
}

function gamblingCall(client?, name?, args?, trimCurrencyAt = null) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni" && trimCurrencyAt != null && args.length > trimCurrencyAt) {
    return svc[name](...args.slice(0, trimCurrencyAt));
  }
  return svc[name](...args);
}

async function playRoulette(client?, message?, betRaw?, choiceRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playRoulette(client, message, betRaw, choiceRaw, options);
  }
  return svc.playRoulette(client, message, betRaw, choiceRaw, currency, options);
}

async function playRouletteBanked(client?, message?, betRaw?, choiceRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playRouletteBanked(client, message, betRaw, choiceRaw, options);
  }
  return svc.playRouletteBanked(client, message, betRaw, choiceRaw, currency, options);
}

async function playCoinflip(client?, message?, betRaw?, choiceRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playCoinflip(client, message, betRaw, choiceRaw, options);
  }
  return svc.playCoinflip(client, message, betRaw, choiceRaw, currency, options);
}

async function playRps(client?, message?, betRaw?, choiceRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playRps(client, message, betRaw, choiceRaw, options);
  }
  return svc.playRps(client, message, betRaw, choiceRaw, currency, options);
}

async function playBlackjackBet(client?, message?, betRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playBlackjackBet(client, message, betRaw, options);
  }
  return svc.playBlackjackBet(client, message, betRaw, currency, options);
}

async function playTrisBet(client?, message?, betRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playTrisBet(client, message, betRaw, options);
  }
  return svc.playTrisBet(client, message, betRaw, currency, options);
}

async function playScratchBet(client?, message?, betRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playScratchBet(client, message, betRaw, options);
  }
  return svc.playScratchBet(client, message, betRaw, currency, options);
}

async function playSlots(client?, message?, betRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playSlots(client, message, betRaw, options);
  }
  return svc.playSlots(client, message, betRaw, currency, options);
}

async function playSlotsBanked(client?, message?, betRaw?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.playSlotsBanked(client, message, betRaw, options);
  }
  return svc.playSlotsBanked(client, message, betRaw, currency, options);
}

async function payBlackjackWin(client?, message?, amount?, currency?, reason?) {
  return gamblingCall(client, "payBlackjackWin", [client, message, amount, currency, reason], 4);
}

async function payTrisWin(client?, message?, amount?, currency?, reason?) {
  return gamblingCall(client, "payTrisWin", [client, message, amount, currency, reason], 4);
}

async function payScratchWin(client?, message?, amount?, currency?, reason?) {
  return gamblingCall(client, "payScratchWin", [client, message, amount, currency, reason], 4);
}

async function cashoutSlotsBank(client?, message?, amount?, currency?) {
  return gamblingCall(client, "cashoutSlotsBank", [client, message, amount, currency], 3);
}

async function flushSlotsGuiPendingBank(client?, message?, currency?) {
  return gamblingCall(client, "flushSlotsGuiPendingBank", [client, message, currency], 2);
}

async function peekRobCooldown(client?, guildId?, userId?) {
  const svc = pick(client);
  if (!svc?.peekRobCooldown) return { ok: true, remainingMs: 0 };
  return svc.peekRobCooldown(guildId, userId);
}

async function clearRobCooldown(client?, guildId?, userId?) {
  const svc = pick(client);
  if (!svc?.clearRobCooldown) {
    if (typeof svc?.releaseCooldown === "function") {
      await svc.releaseCooldown(guildId, userId, "rob");
      return { ok: true };
    }
    return { ok: true, skipped: true };
  }
  return svc.clearRobCooldown(guildId, userId);
}

async function robBank(client?, message?, currency?) {
  return gamblingCall(client, "robBank", [client, message, currency], 2);
}

async function rob(client?, message?, targetUser?, currency?) {
  return gamblingCall(client, "rob", [client, message, targetUser, currency], 3);
}

async function lockRpsPvpStakes(client?, guild?, challengerId?, opponentId?, betAmount?, actorId?, currency?) {
  return gamblingCall(client, "lockRpsPvpStakes", [client, guild, challengerId, opponentId, betAmount, actorId, currency], 6);
}

async function lockTrisPvpStakes(client?, guild?, challengerId?, opponentId?, betAmount?, actorId?, currency?) {
  return gamblingCall(client, "lockTrisPvpStakes", [client, guild, challengerId, opponentId, betAmount, actorId, currency], 6);
}

async function refundRpsPvpStake(client?, guildId?, userId?, amount?, actorId?, currency?, reason?) {
  return gamblingCall(client, "refundRpsPvpStake", [client, guildId, userId, amount, actorId, currency, reason], 6);
}

async function refundTrisPvpStake(client?, guildId?, userId?, amount?, actorId?, currency?, reason?) {
  return gamblingCall(client, "refundTrisPvpStake", [client, guildId, userId, amount, actorId, currency, reason], 6);
}

async function refundEconomyStake(client?, guildId?, userId?, amount?, actorId?, currency?, reason?, source?) {
  const svc = pick(client);
  if (!svc?.refundEconomyStake) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.refundEconomyStake(client, guildId, userId, amount, actorId, reason, source);
  }
  return svc.refundEconomyStake(client, guildId, userId, amount, actorId, currency, reason, source);
}

async function settleRpsPvp(client?, guild?, challengerId?, opponentId?, challengerChoice?, opponentChoice?, betAmount?, actorId?, currency?) {
  return gamblingCall(client, "settleRpsPvp", [client, guild, challengerId, opponentId, challengerChoice, opponentChoice, betAmount, actorId, currency], 8);
}

async function settleTrisPvp(client?, guild?, challengerId?, opponentId?, winnerId?, draw?, betAmount?, actorId?, currency?) {
  return gamblingCall(client, "settleTrisPvp", [client, guild, challengerId, opponentId, winnerId, draw, betAmount, actorId, currency], 8);
}

async function evaluateRobTarget(client?, guild?, targetUserId?, cfg?, robberId?, currency?) {
  return gamblingCall(client, "evaluateRobTarget", [client, guild, targetUserId, cfg, robberId, currency], 5);
}

async function listRobCandidateUserIds(client?, guildId?, robberId?, cfg?) {
  if (resolveEconomyMode(client) !== "galeoni") return [];
  const fn = galeoniSvc().listRobCandidateUserIds;
  if (typeof fn !== "function") return [];
  return fn(client, guildId, robberId, cfg);
}

async function spendBet(client?, message?, action?, bet?, currency?, options: Record<string, any> = {}) {
  const svc = pick(client);
  if (!svc) return economyDisabledAccess(client);
  if (resolveEconomyMode(client) === "galeoni") return svc.spendBet(client, message, action, bet, options);
  return svc.spendBet(client, message, action, bet, currency, options);
}

async function getGamblingSpendableBalance(client?, guildId?, userId?, currency?) {
  const svc = pick(client);
  if (!svc || typeof svc.getGamblingSpendableBalance !== "function") return 0;
  if (resolveEconomyMode(client) === "galeoni") {
    return svc.getGamblingSpendableBalance(client, guildId, userId);
  }
  return svc.getGamblingSpendableBalance(client, guildId, userId, currency);
}

async function applyRpsCooldown(client?, guildId?, userId?, cfg?) {
  const svc = pick(client);
  if (!svc) return null;
  return svc.applyRpsCooldown(client, guildId, userId, cfg);
}

async function applyTrisCooldown(client?, guildId?, userId?, cfg?) {
  const svc = pick(client);
  if (!svc) return null;
  return svc.applyTrisCooldown(client, guildId, userId, cfg);
}

const server = serverSvc();

export = {
  CURRENCY_CAFFE: server.CURRENCY_CAFFE,
  CURRENCY_VINILI: server.CURRENCY_VINILI,
  DEFAULT_CONFIG: server.DEFAULT_CONFIG,
  RED_NUMBERS: server.RED_NUMBERS,
  ROB_BANK_TARGET_ID: server.ROB_BANK_TARGET_ID,
  applyRpsCooldown,
  applyTrisCooldown,
  assertEconomyGamblingAccess,
  assertEconomyGamblingAccessForUser,
  assertDifferentHouses: (...args) => {
    if (resolveEconomyMode(args[0]) !== "galeoni") return Promise.resolve({ ok: true, skipped: true });
    return galeoniSvc().assertDifferentHouses(...args);
  },
  assertServerEconomyAccess,
  cashoutSlotsBank,
  claimFixed,
  claimWork,
  defaultBetCurrency: (...args) => server.defaultBetCurrency(...args),
  economyConfig,
  evaluateRobTarget,
  listRobCandidateUserIds,
  evaluateRouletteWin: (...args) => server.evaluateRouletteWin(...args),
  evaluateRpsOutcome: (...args) => server.evaluateRpsOutcome(...args),
  flushSlotsGuiPendingBank,
  formatCaffe: (...args) => server.formatCaffe(...args),
  formatCurrency: (...args) => server.formatCurrency(...args),
  formatDuration: (...args) => server.formatDuration(...args),
  formatEconomyAmount: (...args) => server.formatEconomyAmount(...args),
  formatVinili: (...args) => server.formatVinili(...args),
  getGamblingSpendableBalance,
  isEconomyCommandsVisible,
  isEconomyGameEnabled,
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
  peekRobCooldown,
  clearRobCooldown,
  peekWorkClaim,
  playBlackjackBet,
  playCoinflip,
  playRoulette,
  playRouletteBanked,
  playRps,
  playScratchBet,
  playSlots,
  playSlotsBanked,
  playTrisBet,
  refundEconomyStake,
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
