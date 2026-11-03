const { randomInt } = require("node:crypto") as typeof import("node:crypto");
const { ActivityUserProfile } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { isValidGuildUserId } = require("../../../../../../src/shared/db/validateWriteIds") as typeof import("../../../../../../src/shared/db/validateWriteIds");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const {
  CURRENCY_CAFFE,
  CURRENCY_VINILI,
  addCurrency,
  formatCurrency,
  getServerWallet,
  spendCurrency,
} = require("./serverWalletService") as typeof import("./serverWalletService");

const SERVER_ECONOMY_PATH = "profile.economy.server";
const GAMBLING_ACTIONS = new Set(["roulette", "rps", "slots", "blackjack", "coinflip", "tris", "scratch"]);
const ROB_BANK_TARGET_ID = "vault";
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function svc() {
  return require("./serverEconomyService");
}

function normalizeId(value?) {
  return String(value || "").trim();
}

function int(value?, fallback?, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isRobBankTarget(targetId?) {
  const id = normalizeId(targetId).toLowerCase();
  return id === ROB_BANK_TARGET_ID || id === "gringott" || id === "banca" || id === "cassaforte";
}

function dayKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
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

async function resolveActiveRobProtection(guildId?, userId?, cfg?, untilRaw?) {
  const left = remainingMs(untilRaw);
  if (left <= 0) {
    if (untilRaw) {
      await ActivityUserProfile.updateOne(
        { guildId: normalizeId(guildId), userId: normalizeId(userId) },
        { $unset: { [`${SERVER_ECONOMY_PATH}.robProtectionUntil`]: "" }, $set: { [`${SERVER_ECONOMY_PATH}.updatedAt`]: new Date() } },
      ).catch(() => null);
    }
    return { blocked: false, remainingMs: 0 };
  }
  const cap = Math.max(0, Number(cfg?.rob?.targetProtectionMs) || 12 * 60 * 60 * 1000) + 60 * 60 * 1000;
  if (left > cap) {
    await ActivityUserProfile.updateOne(
      { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      { $unset: { [`${SERVER_ECONOMY_PATH}.robProtectionUntil`]: "" }, $set: { [`${SERVER_ECONOMY_PATH}.updatedAt`]: new Date() } },
    ).catch(() => null);
    return { blocked: false, remainingMs: 0 };
  }
  return {
    blocked: true,
    remainingMs: left,
    message: `Questo utente è protetto da un furto recente (ancora ${svc().formatDuration(left)}).`,
  };
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

async function peekRobCooldown(guildId?, userId?) {
  const state = await getEconomyState(guildId, userId);
  const left = remainingMs(state?.cooldowns?.rob);
  if (left > 0) {
    return {
      ok: false,
      code: "cooldown",
      remainingMs: left,
      message: `Puoi riprovare un furto tra ${svc().formatDuration(left)}.`,
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

function parseBet(raw?, cfg?, currency = CURRENCY_CAFFE) {
  const amount = int(raw, 0, 0, cfg.maxBet);
  if (!amount) {
    return {
      ok: false,
      message: `Inserisci una puntata valida tra ${formatCurrency(currency, cfg.minBet)} e ${formatCurrency(currency, cfg.maxBet)}.`,
    };
  }
  if (amount < cfg.minBet) return { ok: false, message: `La puntata minima è ${formatCurrency(currency, cfg.minBet)}.` };
  if (amount > cfg.maxBet) return { ok: false, message: `La puntata massima è ${formatCurrency(currency, cfg.maxBet)}.` };
  return { ok: true, amount, currency };
}

function parseBetArgs(args = [], cfg?, opts: Record<string, any> = {}) {
  const list = Array.isArray(args) ? args.map((v?) => String(v || "").trim()).filter(Boolean) : [];
  const fallbackCurrency = opts.currency || svc().defaultBetCurrency();
  if (!list.length) return parseBet(cfg.minBet, cfg, fallbackCurrency);
  const firstCur = svc().parseCurrencyArg(list[0]);
  if (firstCur.ok && firstCur.currency && list.length === 1 && !/^\d+$/.test(list[0])) {
    return parseBet(cfg.minBet, cfg, firstCur.currency);
  }
  if (firstCur.ok && firstCur.currency && /^\d+$/.test(list[1] || "")) {
    const bet = parseBet(list[1], cfg, firstCur.currency);
    return bet.ok ? { ...bet, rest: list.slice(2) } : bet;
  }
  const bet = parseBet(list[0], cfg, fallbackCurrency);
  if (!bet.ok) return bet;
  const secondCur = list[1] ? svc().parseCurrencyArg(list[1]) : null;
  if (secondCur?.ok && secondCur.currency) {
    return { ...bet, currency: secondCur.currency, rest: list.slice(2) };
  }
  return { ...bet, rest: list.slice(1) };
}

async function walletBalance(guildId?, userId?, currency?) {
  const wallet = await getServerWallet(guildId, userId);
  const cur = currency === CURRENCY_VINILI ? CURRENCY_VINILI : CURRENCY_CAFFE;
  return Math.max(0, Math.floor(Number(wallet?.[cur]?.balance) || 0));
}

async function getGamblingSpendableBalance(client?, guildId?, userId?, currency?) {
  const cur = currency || svc().defaultBetCurrency();
  return walletBalance(guildId, userId, cur);
}

async function checkBetCap(guildId?, userId?, amount?, cfg?) {
  const key = dayKey();
  const state = await getEconomyState(guildId, userId);
  const sameDay = state?.gambling?.dayKey === key;
  const current = sameDay ? int(state?.gambling?.wageredToday, 0) : 0;
  if (current + amount > cfg.dailyBetCap) {
    return { ok: false, message: `Hai raggiunto il limite giornaliero di puntate (${svc().formatEconomyAmount(cfg.dailyBetCap)}).` };
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
        $set: { [`${SERVER_ECONOMY_PATH}.gambling.dayKey`]: key, [`${SERVER_ECONOMY_PATH}.gambling.wageredToday`]: 0 },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    {
      $setOnInsert: { guildId: normalizeId(guildId), userId: normalizeId(userId) },
      $set: { [`${SERVER_ECONOMY_PATH}.gambling.dayKey`]: key },
      $inc: { [`${SERVER_ECONOMY_PATH}.gambling.wageredToday`]: amount },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function checkGamblingUserEligibility(message?, client?, betRaw?, accessBase = null, currencyRaw = null) {
  const access = accessBase?.ok != null ? accessBase : await svc().assertServerEconomyAccess(message, client);
  if (!access.ok) return access;
  const cfg = access.cfg;
  const curParsed = svc().parseCurrencyArg(currencyRaw, svc().defaultBetCurrency());
  if (!curParsed.ok) return curParsed;
  const currency = curParsed.currency;
  const parsed = parseBet(betRaw == null ? cfg.minBet : betRaw, cfg, currency);
  if (!parsed.ok) return parsed;
  const balance = await walletBalance(message.guild.id, message.author.id, currency);
  if (balance <= 0) {
    return { ok: false, message: `Non hai ${currency === CURRENCY_VINILI ? "Vinili" : "Caffè"} sufficienti: controlla con \`+bal\`.` };
  }
  if (balance < parsed.amount) {
    return { ok: false, message: `Non hai abbastanza ${currency === CURRENCY_VINILI ? "Vinili" : "Caffè"} per questa puntata.` };
  }
  return { ok: true, cfg, betAmount: parsed.amount, currency };
}

async function assertEconomyGamblingAccess(message?, client?, betRaw?, currencyRaw = null) {
  return checkGamblingUserEligibility(message, client, betRaw, null, currencyRaw);
}

async function assertEconomyGamblingAccessForUser(client?, guild?, member?, userId?, betRaw?, currencyRaw = null) {
  return assertEconomyGamblingAccess(
    { guild, member, author: { id: normalizeId(userId), bot: false } },
    client,
    betRaw,
    currencyRaw,
  );
}

async function spendBet(client?, message?, action?, bet?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  const access = await svc().assertServerEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  if (GAMBLING_ACTIONS.has(action) && access.cfg?.[action]?.enabled === false) {
    return { ok: false, code: "game_disabled", message: "Questo gioco è temporaneamente disattivato." };
  }
  let parsed;
  let betCurrency = currency;
  if (GAMBLING_ACTIONS.has(action)) {
    const gamb = await checkGamblingUserEligibility(message, client, bet, access, currency);
    if (!gamb.ok) return gamb;
    parsed = { ok: true, amount: gamb.betAmount };
    betCurrency = gamb.currency;
  } else {
    parsed = parseBet(bet, access.cfg, currency);
    if (!parsed.ok) return parsed;
    betCurrency = parsed.currency;
    const balance = await walletBalance(message.guild.id, message.author.id, betCurrency);
    if (balance < parsed.amount) {
      return { ok: false, message: `Non hai abbastanza ${betCurrency === CURRENCY_VINILI ? "Vinili" : "Caffè"} per questa puntata.` };
    }
  }
  const cap = await checkBetCap(message.guild.id, message.author.id, parsed.amount, access.cfg);
  if (!cap.ok) return cap;
  if (!options?.skipCooldown) {
    const reserve = await reserveCooldown(message.guild.id, message.author.id, action, access.cfg[action].cooldownMs);
    if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi rigiocare tra ${svc().formatDuration(reserve.remainingMs)}.` };
  }
  const spent = await spendCurrency({
    guildId: message.guild.id,
    userId: message.author.id,
    currency: betCurrency,
    amount: parsed.amount,
    reason: `${action}: puntata`,
    actorId: message.author.id,
    source: `economy_${action}`,
  });
  if (!spent?.ok) {
    await releaseCooldown(message.guild.id, message.author.id, action);
    return { ok: false, message: "Non hai abbastanza fondi per questa puntata.", state: spent?.state, currency: betCurrency };
  }
  await recordBet(message.guild.id, message.author.id, parsed.amount, cap);
  return { ok: true, amount: parsed.amount, currency: betCurrency, cfg: access.cfg, spent };
}

async function payout(client?, message?, action?, amount?, currency?, reason?) {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (value <= 0) return null;
  const boosted = await require("./serverShopService").applyGamblePayoutBonus(message.guild.id, message.author.id, value);
  return addCurrency({
    guildId: message.guild.id,
    userId: message.author.id,
    currency: currency || CURRENCY_CAFFE,
    amount: boosted,
    reason,
    actorId: message.author.id,
    source: `economy_${action}`,
  });
}

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

async function playRouletteBanked(client?, message?, betRaw?, choiceRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  const parsed = normalizeRouletteChoice(choiceRaw);
  if (!parsed.ok) return parsed;
  const bet = await spendBet(client, message, "roulette", betRaw, currency, options);
  if (!bet.ok) return bet;
  const spin = spinRouletteResult();
  const win = evaluateRouletteWin(parsed, spin);
  const multiplier = parsed.isNumber ? bet.cfg.roulette.numberPayout : bet.cfg.roulette.simplePayout;
  const payoutAmount = win ? bet.amount * multiplier : 0;
  return {
    ok: true,
    game: "roulette",
    bet: bet.amount,
    currency: bet.currency,
    win,
    payout: payoutAmount,
    choice: parsed.choice,
    isNumber: parsed.isNumber,
    result: { ...spin, choice: parsed.choice, isNumber: parsed.isNumber },
  };
}

async function playRoulette(client?, message?, betRaw?, choiceRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  const result = await playRouletteBanked(client, message, betRaw, choiceRaw, currency, options);
  if (!result.ok) return result;
  const paid = await payout(client, message, "roulette", result.payout, result.currency, "roulette: vincita");
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

async function lockRpsPvpStakes(client?, guild?, challengerId?, opponentId?, betAmount?, actorId?, currency = CURRENCY_CAFFE) {
  const cfg = svc().economyConfig(client);
  const parsed = parseBet(String(betAmount), cfg, currency);
  if (!parsed.ok) return parsed;
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const stakes = [];
  for (const uid of [challenger, opponent]) {
    const member = await getGuildMemberCached(guild, uid, { preferFresh: false }).catch(() => null);
    const gamb = await assertEconomyGamblingAccessForUser(client, guild, member, uid, parsed.amount, parsed.currency);
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
    const spent = await spendCurrency({
      guildId,
      userId: uid,
      currency: parsed.currency,
      amount: parsed.amount,
      reason: "rps: puntata pvp",
      actorId: normalizeId(actorId) || uid,
      source: "economy_rps_pvp",
    });
    if (!spent?.ok) {
      for (const ref of stakes) {
        await addCurrency({
          guildId,
          userId: ref.userId,
          currency: parsed.currency,
          amount: ref.amount,
          reason: "rps: rimborso pvp",
          actorId: normalizeId(actorId) || ref.userId,
          source: "economy_rps_pvp",
        }).catch(() => null);
      }
      return { ok: false, message: "Non sono riuscito a bloccare le puntate. Riprova." };
    }
    await recordBet(guildId, uid, parsed.amount, cap);
    stakes.push({ userId: uid, amount: parsed.amount });
  }
  return { ok: true, amount: parsed.amount, currency: parsed.currency, cfg, stakes };
}

async function refundRpsPvpStake(client?, guildId?, userId?, amount?, actorId?, currency?, reason = "rps: rimborso pvp") {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: true, amount: 0 };
  const paid = await addCurrency({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
    currency: currency || CURRENCY_CAFFE,
    amount: value,
    reason,
    actorId: normalizeId(actorId) || normalizeId(userId),
    source: "economy_rps_pvp",
  });
  return paid?.ok ? { ok: true, amount: value } : { ok: false, message: "Rimborso non riuscito." };
}

async function applyRpsCooldown(client?, guildId?, userId?, cfg?) {
  await reserveCooldown(normalizeId(guildId), normalizeId(userId), "rps", cfg?.rps?.cooldownMs ?? 5000);
}

async function settleRpsPvp(client?, guild?, challengerId?, opponentId?, challengerChoice?, opponentChoice?, betAmount?, actorId?, currency = CURRENCY_CAFFE) {
  const cfg = svc().economyConfig(client);
  const bet = Math.max(0, Math.floor(Number(betAmount) || 0));
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const outcome = evaluateRpsOutcome(challengerChoice, opponentChoice);
  if (!outcome.ok) return { ok: false, message: "Mosse non valide." };
  const actor = normalizeId(actorId) || challenger;
  if (outcome.draw) {
    await refundRpsPvpStake(client, guildId, challenger, bet, actor, currency, "rps: pareggio pvp");
    await refundRpsPvpStake(client, guildId, opponent, bet, actor, currency, "rps: pareggio pvp");
    await applyRpsCooldown(client, guildId, challenger, cfg);
    await applyRpsCooldown(client, guildId, opponent, cfg);
    return {
      ok: true,
      game: "rps_pvp",
      draw: true,
      win: false,
      payout: bet,
      currency,
      winnerId: null,
      loserId: null,
      result: { player: normalizeRps(challengerChoice), bot: normalizeRps(opponentChoice) },
    };
  }
  const winnerId = outcome.winnerSide === "a" ? challenger : opponent;
  const loserId = outcome.winnerSide === "a" ? opponent : challenger;
  const pot = bet * 2;
  const paid = await addCurrency({
    guildId,
    userId: winnerId,
    currency,
    amount: pot,
    reason: "rps: vincita pvp",
    actorId: actor,
    source: "economy_rps_pvp",
  });
  if (!paid?.ok) {
    await refundRpsPvpStake(client, guildId, challenger, bet, actor, currency, "rps: errore vincita pvp");
    await refundRpsPvpStake(client, guildId, opponent, bet, actor, currency, "rps: errore vincita pvp");
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
    currency,
    winnerId,
    loserId,
    result: { player: normalizeRps(challengerChoice), bot: normalizeRps(opponentChoice) },
  };
}

async function playBlackjackBet(client?, message?, betRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  return spendBet(client, message, "blackjack", betRaw, currency, options);
}

async function payBlackjackWin(client?, message?, amount?, currency = CURRENCY_CAFFE, reason = "blackjack: vincita") {
  return payout(client, message, "blackjack", amount, currency, reason);
}

async function playTrisBet(client?, message?, betRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  return spendBet(client, message, "tris", betRaw, currency, options);
}

async function payTrisWin(client?, message?, amount?, currency = CURRENCY_CAFFE, reason = "tris: vincita") {
  return payout(client, message, "tris", amount, currency, reason);
}

async function lockTrisPvpStakes(client?, guild?, challengerId?, opponentId?, betAmount?, actorId?, currency = CURRENCY_CAFFE) {
  const cfg = svc().economyConfig(client);
  const parsed = parseBet(String(betAmount), cfg, currency);
  if (!parsed.ok) return parsed;
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const stakes = [];
  for (const uid of [challenger, opponent]) {
    const member = await getGuildMemberCached(guild, uid, { preferFresh: false }).catch(() => null);
    const gamb = await assertEconomyGamblingAccessForUser(client, guild, member, uid, parsed.amount, parsed.currency);
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
    const spent = await spendCurrency({
      guildId,
      userId: uid,
      currency: parsed.currency,
      amount: parsed.amount,
      reason: "tris: puntata pvp",
      actorId: normalizeId(actorId) || uid,
      source: "economy_tris_pvp",
    });
    if (!spent?.ok) {
      for (const ref of stakes) {
        await addCurrency({
          guildId,
          userId: ref.userId,
          currency: parsed.currency,
          amount: ref.amount,
          reason: "tris: rimborso pvp",
          actorId: normalizeId(actorId) || ref.userId,
          source: "economy_tris_pvp",
        }).catch(() => null);
      }
      return { ok: false, message: "Non sono riuscito a bloccare le puntate. Riprova." };
    }
    await recordBet(guildId, uid, parsed.amount, cap);
    stakes.push({ userId: uid, amount: parsed.amount });
  }
  return { ok: true, amount: parsed.amount, currency: parsed.currency, cfg, stakes };
}

async function refundTrisPvpStake(client?, guildId?, userId?, amount?, actorId?, currency?, reason = "tris: rimborso pvp") {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: true, amount: 0 };
  const paid = await addCurrency({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
    currency: currency || CURRENCY_CAFFE,
    amount: value,
    reason,
    actorId: normalizeId(actorId) || normalizeId(userId),
    source: "economy_tris_pvp",
  });
  return paid?.ok ? { ok: true, amount: value } : { ok: false, message: "Rimborso non riuscito." };
}

async function refundEconomyStake(client?, guildId?, userId?, amount?, actorId?, currency?, reason = "economy: rimborso chiusura", source = "economy_refund") {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: true, amount: 0 };
  const paid = await addCurrency({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
    currency: currency || CURRENCY_CAFFE,
    amount: value,
    reason,
    actorId: normalizeId(actorId) || normalizeId(userId),
    source: String(source || "economy_refund").slice(0, 48),
  });
  return paid?.ok ? { ok: true, amount: value } : { ok: false, message: "Rimborso non riuscito." };
}

async function applyTrisCooldown(client?, guildId?, userId?, cfg?) {
  await reserveCooldown(normalizeId(guildId), normalizeId(userId), "tris", cfg?.tris?.cooldownMs ?? 5000);
}

async function settleTrisPvp(client?, guild?, challengerId?, opponentId?, winnerId?, draw?, betAmount?, actorId?, currency = CURRENCY_CAFFE) {
  const cfg = svc().economyConfig(client);
  const bet = Math.max(0, Math.floor(Number(betAmount) || 0));
  const guildId = normalizeId(guild?.id);
  const challenger = normalizeId(challengerId);
  const opponent = normalizeId(opponentId);
  const actor = normalizeId(actorId) || challenger;
  const winId = normalizeId(winnerId);
  if (draw) {
    await refundTrisPvpStake(client, guildId, challenger, bet, actor, currency, "tris: pareggio pvp");
    await refundTrisPvpStake(client, guildId, opponent, bet, actor, currency, "tris: pareggio pvp");
    await applyTrisCooldown(client, guildId, challenger, cfg);
    await applyTrisCooldown(client, guildId, opponent, cfg);
    return { ok: true, game: "tris_pvp", draw: true, win: false, payout: bet, currency, winnerId: null, loserId: null };
  }
  const loserId = winId === challenger ? opponent : challenger;
  const pot = bet * 2;
  const paid = await addCurrency({
    guildId,
    userId: winId,
    currency,
    amount: pot,
    reason: "tris: vincita pvp",
    actorId: actor,
    source: "economy_tris_pvp",
  });
  if (!paid?.ok) {
    await refundTrisPvpStake(client, guildId, challenger, bet, actor, currency, "tris: errore vincita pvp");
    await refundTrisPvpStake(client, guildId, opponent, bet, actor, currency, "tris: errore vincita pvp");
    return { ok: false, message: "Non sono riuscito a pagare la vincita. Le puntate sono state rimborsate." };
  }
  await applyTrisCooldown(client, guildId, challenger, cfg);
  await applyTrisCooldown(client, guildId, opponent, cfg);
  return { ok: true, game: "tris_pvp", draw: false, win: winId === challenger, payout: pot, currency, winnerId: winId, loserId };
}

async function playScratchBet(client?, message?, betRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  return spendBet(client, message, "scratch", betRaw, currency, options);
}

async function payScratchWin(client?, message?, amount?, currency = CURRENCY_CAFFE, reason = "scratch: vincita") {
  return payout(client, message, "scratch", amount, currency, reason);
}

function normalizeCoinChoice(value?) {
  const v = String(value || "").trim().toLowerCase();
  if (["heads", "head", "testa", "t", "h"].includes(v)) return "testa";
  if (["tails", "tail", "croce", "c", "cross"].includes(v)) return "croce";
  return ["testa", "croce"].includes(v) ? v : "";
}

async function playCoinflip(client?, message?, betRaw?, choiceRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  const player = normalizeCoinChoice(choiceRaw);
  if (!player) return { ok: false, message: "Scegli `testa` o `croce`." };
  const bet = await spendBet(client, message, "coinflip", betRaw, currency, options);
  if (!bet.ok) return bet;
  const flip = ["testa", "croce"][randomInt(0, 2)];
  const win = player === flip;
  const payoutAmount = win ? bet.amount * bet.cfg.coinflip.winPayout : 0;
  const paid = await payout(client, message, "coinflip", payoutAmount, bet.currency, "coinflip: vincita");
  return { ok: true, game: "coinflip", bet: bet.amount, currency: bet.currency, win, payout: payoutAmount, paid, result: { player, flip } };
}

async function playRps(client?, message?, betRaw?, choiceRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  const player = normalizeRps(choiceRaw);
  if (!player) return { ok: false, message: "Scegli `sasso`, `carta` o `forbici`." };
  const bet = await spendBet(client, message, "rps", betRaw, currency, options);
  if (!bet.ok) return bet;
    const counter = { sasso: "carta", carta: "forbici", forbici: "sasso" };
  const bot = randomInt(1, 101) <= 4 ? counter[player] : ["sasso", "carta", "forbici"][randomInt(0, 3)];
  const draw = player === bot;
  const win = !draw && ((player === "sasso" && bot === "forbici") || (player === "carta" && bot === "sasso") || (player === "forbici" && bot === "carta"));
  const payoutAmount = draw ? bet.amount : win ? bet.amount * bet.cfg.rps.winPayout : 0;
  const paid = await payout(client, message, "rps", payoutAmount, bet.currency, draw ? "rps: pareggio" : "rps: vincita");
  return { ok: true, game: "rps", bet: bet.amount, currency: bet.currency, win, draw, payout: payoutAmount, paid, result: { player, bot } };
}

async function playSlotsBanked(client?, message?, betRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  const bet = await spendBet(client, message, "slots", betRaw, currency, options);
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
  return { ok: true, game: "slots", bet: bet.amount, currency: bet.currency, win: payoutAmount > 0, payout: payoutAmount, result: { reels, multiplier } };
}

async function playSlots(client?, message?, betRaw?, currency = CURRENCY_CAFFE, options: Record<string, any> = {}) {
  const result = await playSlotsBanked(client, message, betRaw, currency, options);
  if (!result.ok) return result;
  const paid = await payout(client, message, "slots", result.payout, result.currency, "slots: vincita");
  return { ...result, paid };
}

async function cashoutSlotsBank(client?, message?, amount?, currency = CURRENCY_CAFFE) {
  const access = await svc().assertServerEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return { ok: false, message: "<a:VC_Cross:1482532424570376253> Non hai vincite da riscuotere in questa sessione." };
  const paid = await payout(client, message, "slots", value, currency, "slots: riscossione sessione");
  if (!paid?.ok) return { ok: false, message: "<a:VC_Cross:1482532424570376253> Non sono riuscito ad accreditare la vincita. Riprova." };
  return { ok: true, paid, amount: value, currency };
}

async function flushSlotsGuiPendingBank(client?, message?, currency = CURRENCY_CAFFE) {
  const access = await svc().assertServerEconomyAccess(message, client);
  if (!access.ok) return { ok: false, message: access.message };
  const { takeUserSlotsGuiPending, clearSlotsGuiSession } = require("./slotsGuiSessionStore") as typeof import("./slotsGuiSessionStore");
  const pending = await takeUserSlotsGuiPending(message.guild.id, message.author.id);
  if (!pending?.bank) return { ok: true, amount: 0 };
  const cur = pending.raw?.currency === CURRENCY_VINILI ? CURRENCY_VINILI : currency;
  const out = await cashoutSlotsBank(client, message, pending.bank, cur);
  if (!out.ok) return out;
  await clearSlotsGuiSession(message.guild.id, message.author.id, pending.raw.messageId);
  return { ok: true, amount: out.amount, auto: true, currency: cur };
}

function randomBetween(min?, max?) {
  const a = Math.floor(Number(min) || 0);
  const b = Math.floor(Number(max) || a);
  return randomInt(Math.min(a, b), Math.max(a, b) + 1);
}

async function evaluateRobTarget(client?, guild?, targetUserId?, cfg?, robberId?, currency = CURRENCY_CAFFE) {
  const guildId = normalizeId(guild?.id);
  const uid = normalizeId(targetUserId);
  const robber = normalizeId(robberId);
  const cur = currency === CURRENCY_VINILI ? CURRENCY_VINILI : CURRENCY_CAFFE;
  const minBal = Math.max(1, Math.floor(Number(cfg?.rob?.minTargetBalance) || 25));
  if (!isValidGuildUserId(guildId, uid)) return { ok: false, message: "Bersaglio non valido." };
  if (uid === robber) return { ok: false, message: "Non puoi derubare te stesso." };
  let member = guild?.members?.cache?.get(uid) || null;
  if (!member?.user && guild) {
    member = await getGuildMemberCached(guild, uid, { preferFresh: false }).catch(() => null);
  }
  if (!member?.user || member.user.bot) return { ok: false, message: "Scegli un utente valido da derubare." };
  if (!await svc().isMember(member)) return { ok: false, message: "Puoi derubare solo membri con economia attiva." };
  const targetState = await getEconomyState(guildId, uid);
  const prot = await resolveActiveRobProtection(guildId, uid, cfg, targetState?.robProtectionUntil);
  if (prot.blocked) {
    return { ok: false, code: "protected", message: prot.message };
  }
  const balance = await walletBalance(guildId, uid, cur);
  if (balance < minBal) {
    return {
      ok: false,
      code: "low_balance",
      message: `Il bersaglio deve avere almeno ${formatCurrency(cur, minBal)} in ${cur === CURRENCY_VINILI ? "Vinili" : "Caffè"} (saldo ${formatCurrency(cur, balance)}).`,
    };
  }
  return { ok: true, balance, currency: cur };
}

async function assertRobberCanSteal(client?, message?, currency = CURRENCY_CAFFE) {
  const access = await svc().assertServerEconomyAccess(message, client);
  if (!access.ok) return access;
  const presentation = require("../../Utils/Economy/economyPresentation").resolveEconomyPresentation(client);
  if (presentation.hogwartsEconomyLive) {
    const { assertRobberHasBroom } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
    const broom = await assertRobberHasBroom(client, message.guild?.id, message.author?.id);
    if (!broom.ok) return broom;
  }
  return { ...access, currency: currency === CURRENCY_VINILI ? CURRENCY_VINILI : CURRENCY_CAFFE };
}

async function robBank(client?, message?, currency = CURRENCY_CAFFE) {
  const access = await assertRobberCanSteal(client, message, currency);
  if (!access.ok) return { ok: false, message: access.message };
  const cur = access.currency;
  const reserve = await reserveCooldown(message.guild.id, message.author.id, "rob", access.cfg.rob.cooldownMs);
  if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi riprovare un furto tra ${svc().formatDuration(reserve.remainingMs)}.` };
  let chance = Math.max(1, Math.min(99, Math.floor(Number(access.cfg.rob.successChance) || 30)));
  const shopRobBonus = await require("./serverShopService").peekRobSuccessBonusPct(message.guild.id, message.author.id);
  if (shopRobBonus > 0) chance = Math.min(99, chance + shopRobBonus);
  if (require("../../Utils/Economy/economyPresentation").resolveEconomyPresentation(client).hogwartsEconomyLive) {
    const { resolveRobSuccessChance } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
    const boosted = await resolveRobSuccessChance(client, message.guild.id, message.author.id, chance);
    chance = boosted.chance;
  }
  const success = randomInt(1, 101) <= chance;
  if (shopRobBonus > 0) await require("./serverShopService").consumeRobSuccessBonus(message.guild.id, message.author.id);
  if (!success) {
    const balanceNow = await walletBalance(message.guild.id, message.author.id, cur);
    const { scaleRobFailPenalty } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
    const scaled = scaleRobFailPenalty(access.cfg.rob.failPenalty, chance);
    const penalty = Math.min(scaled, balanceNow);
    if (penalty > 0) {
      await spendCurrency({
        guildId: message.guild.id,
        userId: message.author.id,
        currency: cur,
        amount: penalty,
        reason: "rob: multa fallimento cassaforte",
        actorId: message.author.id,
        source: "economy_rob",
      });
    }
    return { ok: true, game: "rob", success: false, penalty, bank: true, currency: cur };
  }
  const steal = randomBetween(access.cfg.rob.minSteal, access.cfg.rob.maxSteal);
  const gained = await addCurrency({
    guildId: message.guild.id,
    userId: message.author.id,
    currency: cur,
    amount: steal,
    reason: "Furto cassaforte",
    actorId: message.author.id,
    source: "economy_rob",
  });
  if (!gained?.ok) return { ok: false, message: "Non sono riuscito ad accreditare il bottino. Riprova più tardi." };
  return { ok: true, game: "rob", success: true, amount: steal, gained, bank: true, currency: cur };
}

async function rob(client?, message?, targetUser?, currency = CURRENCY_CAFFE) {
  const access = await assertRobberCanSteal(client, message, currency);
  if (!access.ok) return { ok: false, message: access.message };
  const cur = access.currency;
  if (!targetUser || targetUser.bot) return { ok: false, message: "Scegli un utente valido da derubare." };
  const targetCheck = await evaluateRobTarget(client, message.guild, targetUser.id, access.cfg, message.author.id, cur);
  if (!targetCheck.ok) {
    if (isSoftRobTargetFail(targetCheck)) {
      await releaseCooldown(message.guild.id, message.author.id, "rob");
    }
    return { ok: false, code: targetCheck.code || "target_blocked", message: targetCheck.message };
  }
  const reserve = await reserveCooldown(message.guild.id, message.author.id, "rob", access.cfg.rob.cooldownMs);
  if (!reserve.ok) return { ok: false, code: "cooldown", message: `Puoi riprovare un furto tra ${svc().formatDuration(reserve.remainingMs)}.` };
    const liveCheck = await evaluateRobTarget(client, message.guild, targetUser.id, access.cfg, message.author.id, cur);
  if (!liveCheck.ok) {
    await releaseCooldown(message.guild.id, message.author.id, "rob");
    return { ok: false, code: liveCheck.code || "target_blocked", message: liveCheck.message };
  }
  let chance = Math.max(1, Math.min(99, Math.floor(Number(access.cfg.rob.successChance) || 30)));
  const shopRobBonus = await require("./serverShopService").peekRobSuccessBonusPct(message.guild.id, message.author.id);
  if (shopRobBonus > 0) chance = Math.min(99, chance + shopRobBonus);
  if (require("../../Utils/Economy/economyPresentation").resolveEconomyPresentation(client).hogwartsEconomyLive) {
    const { resolveRobSuccessChance } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
    const boosted = await resolveRobSuccessChance(client, message.guild.id, message.author.id, chance);
    chance = boosted.chance;
  }
  const success = randomInt(1, 101) <= chance;
  if (shopRobBonus > 0) await require("./serverShopService").consumeRobSuccessBonus(message.guild.id, message.author.id);
  if (!success) {
    const balanceNow = await walletBalance(message.guild.id, message.author.id, cur);
    const { scaleRobFailPenalty } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
    const scaled = scaleRobFailPenalty(access.cfg.rob.failPenalty, chance);
    const penalty = Math.min(scaled, balanceNow);
    if (penalty > 0) {
      await spendCurrency({
        guildId: message.guild.id,
        userId: message.author.id,
        currency: cur,
        amount: penalty,
        reason: "rob: multa fallimento",
        actorId: message.author.id,
        source: "economy_rob",
      });
    }
    return { ok: true, game: "rob", success: false, penalty, bank: false, currency: cur };
  }
  const steal = Math.min(randomBetween(access.cfg.rob.minSteal, access.cfg.rob.maxSteal), liveCheck.balance);
  const taken = await spendCurrency({
    guildId: message.guild.id,
    userId: targetUser.id,
    currency: cur,
    amount: steal,
    reason: `Furto subito da ${message.author.id}`,
    actorId: message.author.id,
    source: "economy_rob",
  });
  if (!taken?.ok) {
    await releaseCooldown(message.guild.id, message.author.id, "rob");
    return { ok: false, message: "Il furto è fallito: saldo bersaglio non disponibile." };
  }
  const gained = await addCurrency({
    guildId: message.guild.id,
    userId: message.author.id,
    currency: cur,
    amount: steal,
    reason: `Furto riuscito su ${targetUser.id}`,
    actorId: message.author.id,
    source: "economy_rob",
  });
  await ActivityUserProfile.updateOne(
    { guildId: message.guild.id, userId: targetUser.id },
    { $set: { [`${SERVER_ECONOMY_PATH}.robProtectionUntil`]: new Date(Date.now() + access.cfg.rob.targetProtectionMs) } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return { ok: true, game: "rob", success: true, amount: steal, gained, bank: false, currency: cur };
}

export = {
  ROB_BANK_TARGET_ID,
  RED_NUMBERS,
  applyRpsCooldown,
  applyTrisCooldown,
  assertEconomyGamblingAccess,
  assertEconomyGamblingAccessForUser,
  cashoutSlotsBank,
  evaluateRobTarget,
  evaluateRouletteWin,
  evaluateRpsOutcome,
  flushSlotsGuiPendingBank,
  getGamblingSpendableBalance,
  isRobBankTarget,
  lockRpsPvpStakes,
  lockTrisPvpStakes,
  normalizeCoinChoice,
  normalizeRouletteChoice,
  normalizeRps,
  parseBet,
  parseBetArgs,
  payBlackjackWin,
  payScratchWin,
  payTrisWin,
  peekRobCooldown,
  clearRobCooldown,
  isSoftRobTargetFail,
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
  rob,
  robBank,
  settleRpsPvp,
  settleTrisPvp,
  spinRouletteResult,
  spendBet,
};