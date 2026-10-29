const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { CURRENCY_CAFFE, CURRENCY_VINILI, formatCurrency, getServerWallet, spendCurrency } = require("./serverWalletService") as typeof import("./serverWalletService");
const { getShopItemById, listShopItems } = require("../../Utils/Economy/serverShopCatalog") as typeof import("../../Utils/Economy/serverShopCatalog");

const SHOP_PATH = "profile.economy.server.shop";
const BOOSTS_PATH = `${SHOP_PATH}.boosts`;

function svc() {
  return require("./serverEconomyService");
}

function normalizeId(value?) {
  return String(value || "").trim();
}

function shopConfig(client?) {
  const raw = client?.config?.serverEconomy?.shop;
  const cfg = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: cfg.enabled !== false,
    purchaseCooldownMs: Math.max(0, Math.floor(Number(cfg.purchaseCooldownMs) || 3000)),
  };
}

function isServerShopEnabled(client?) {
  return svc().isServerEconomyEnabled(client) && shopConfig(client).enabled;
}

async function readShopDoc(guildId?, userId?) {
  return ActivityUserProfile.findOne({ guildId: normalizeId(guildId), userId: normalizeId(userId) })
    .select(`${SHOP_PATH} ${BOOSTS_PATH}`)
    .lean()
    .catch(() => null);
}

function readBoosts(doc?) {
  const raw = doc?.profile?.economy?.server?.shop?.boosts;
  return raw && typeof raw === "object" ? raw : {};
}

async function getActiveBoosts(guildId?, userId?) {
  const doc = await readShopDoc(guildId, userId);
  return readBoosts(doc);
}

function remainingMs(dateValue?) {
  const until = new Date(dateValue || 0).getTime();
  return Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0;
}

async function applyShopEffect(guildId?, userId?, item?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const now = new Date();
  const effect = String(item?.effect || "").trim();
  const baseSet = { [`${SHOP_PATH}.updatedAt`]: now };

  if (effect === "clear_work_cooldown") {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $unset: { "profile.economy.server.cooldowns.work": "" }, $set: baseSet },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return { ok: true, message: "Cooldown lavoro azzerato. Puoi usare `+work`." };
  }

  if (effect === "rob_shield_6h") {
    const until = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $set: { ...baseSet, "profile.economy.server.robProtectionUntil": until } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return { ok: true, message: "Sei protetto dai furti per le prossime 6 ore." };
  }

  if (effect === "fixed_income_streak_bonus_25") {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $set: { ...baseSet, [`${BOOSTS_PATH}.fixedIncomeStreakBonusPct`]: 25 } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return { ok: true, message: "Bonus attivo sulla prossima ricompensa daily, weekly o monthly." };
  }

  if (effect === "work_reward_bonus_60") {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $set: { ...baseSet, [`${BOOSTS_PATH}.workRewardBonusPct`]: 60 } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return { ok: true, message: "Bonus attivo sul prossimo `+work`." };
  }

  if (effect === "rob_success_bonus_12") {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $set: { ...baseSet, [`${BOOSTS_PATH}.robSuccessBonusPct`]: 12, [`${BOOSTS_PATH}.robSuccessUses`]: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return { ok: true, message: "Bonus attivo sul prossimo furto." };
  }

  if (effect === "gamble_payout_bonus_15x3") {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $set: { ...baseSet, [`${BOOSTS_PATH}.gamblePayoutBonusPct`]: 15, [`${BOOSTS_PATH}.gamblePayoutUses`]: 3 } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return { ok: true, message: "Bonus attivo sulle prossime 3 vittorie ai giochi d'azzardo." };
  }

  return { ok: false, message: "Effetto oggetto non configurato." };
}

async function consumeBoostField(guildId?, userId?, fields = []) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const unset: Record<string, any> = {};
  for (const field of fields) {
    const key = String(field || "").trim();
    if (key) unset[`${BOOSTS_PATH}.${key}`] = "";
  }
  if (!Object.keys(unset).length) return;
  await ActivityUserProfile.updateOne(
    { guildId: g, userId: u },
    { $unset: unset, $set: { [`${SHOP_PATH}.updatedAt`]: new Date() } },
  ).catch(() => null);
}

async function takeWorkRewardBonusPct(guildId?, userId?) {
  const boosts = await getActiveBoosts(guildId, userId);
  const pct = Math.max(0, Math.floor(Number(boosts.workRewardBonusPct) || 0));
  if (pct > 0) await consumeBoostField(guildId, userId, ["workRewardBonusPct"]);
  return pct;
}

async function takeFixedIncomeStreakBonusPct(guildId?, userId?) {
  const boosts = await getActiveBoosts(guildId, userId);
  const pct = Math.max(0, Math.floor(Number(boosts.fixedIncomeStreakBonusPct) || 0));
  if (pct > 0) await consumeBoostField(guildId, userId, ["fixedIncomeStreakBonusPct"]);
  return pct;
}

async function peekRobSuccessBonusPct(guildId?, userId?) {
  const boosts = await getActiveBoosts(guildId, userId);
  const uses = Math.max(0, Math.floor(Number(boosts.robSuccessUses) || 0));
  if (uses < 1) return 0;
  return Math.max(0, Math.floor(Number(boosts.robSuccessBonusPct) || 0));
}

async function consumeRobSuccessBonus(guildId?, userId?) {
  const boosts = await getActiveBoosts(guildId, userId);
  const uses = Math.max(0, Math.floor(Number(boosts.robSuccessUses) || 0));
  if (uses < 1) return;
  const nextUses = uses - 1;
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (nextUses <= 0) {
    await consumeBoostField(g, u, ["robSuccessBonusPct", "robSuccessUses"]);
    return;
  }
  await ActivityUserProfile.updateOne(
    { guildId: g, userId: u },
    { $set: { [`${BOOSTS_PATH}.robSuccessUses`]: nextUses, [`${SHOP_PATH}.updatedAt`]: new Date() } },
  ).catch(() => null);
}

async function applyGamblePayoutBonus(guildId?, userId?, payoutAmount?) {
  const boosts = await getActiveBoosts(guildId, userId);
  const uses = Math.max(0, Math.floor(Number(boosts.gamblePayoutUses) || 0));
  const pct = Math.max(0, Math.floor(Number(boosts.gamblePayoutBonusPct) || 0));
  const base = Math.max(0, Math.floor(Number(payoutAmount) || 0));
  if (!base || uses < 1 || pct < 1) return base;
  const bonus = Math.max(0, Math.floor((base * pct) / 100));
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const nextUses = uses - 1;
  if (nextUses <= 0) {
    await consumeBoostField(g, u, ["gamblePayoutBonusPct", "gamblePayoutUses"]);
  } else {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $set: { [`${BOOSTS_PATH}.gamblePayoutUses`]: nextUses, [`${SHOP_PATH}.updatedAt`]: new Date() } },
    ).catch(() => null);
  }
  return base + bonus;
}

async function purchaseShopItem(client?, message?, itemId?) {
  const access = await svc().assertServerEconomyAccess(message, client);
  if (!access.ok) return access;
  if (!isServerShopEnabled(client)) return { ok: false, message: "Lo shop Vinili & Caffè è disattivato." };

  const item = getShopItemById(itemId);
  if (!item) return { ok: false, message: "Oggetto shop non valido." };

  const guildId = message.guild.id;
  const userId = message.author.id;
  const wallet = await getServerWallet(guildId, userId);
  const balance = Math.max(0, Math.floor(Number(wallet?.[item.currency]?.balance) || 0));
  if (balance < item.price) {
    return {
      ok: false,
      message: `Non hai abbastanza ${item.currency === CURRENCY_VINILI ? "Vinili" : "Caffè"}: servono ${formatCurrency(item.currency, item.price)}.`,
    };
  }

  const cfg = shopConfig(client);
  const purchasePath = `${SHOP_PATH}.lastPurchaseAt`;
  const doc = await readShopDoc(guildId, userId);
  const lastMs = new Date(doc?.profile?.economy?.server?.shop?.lastPurchaseAt || 0).getTime();
  if (cfg.purchaseCooldownMs > 0 && Number.isFinite(lastMs) && Date.now() - lastMs < cfg.purchaseCooldownMs) {
    return { ok: false, message: `Attendi ${svc().formatDuration(cfg.purchaseCooldownMs - (Date.now() - lastMs))} prima del prossimo acquisto.` };
  }

  const spent = await spendCurrency({
    guildId,
    userId,
    currency: item.currency,
    amount: item.price,
    reason: `Shop: ${item.name}`,
    actorId: userId,
    source: "server_shop",
  });
  if (!spent?.ok) {
    return { ok: false, message: "Pagamento non riuscito. Controlla il saldo con `+bal`." };
  }

  const applied = await applyShopEffect(guildId, userId, item);
  if (!applied.ok) {
    await require("./serverWalletService").addCurrency({
      guildId,
      userId,
      currency: item.currency,
      amount: item.price,
      reason: `Rimborso shop: ${item.name}`,
      actorId: userId,
      source: "server_shop_refund",
    }).catch(() => null);
    return applied;
  }

  await ActivityUserProfile.updateOne(
    { guildId: normalizeId(guildId), userId: normalizeId(userId) },
    {
      $set: {
        [`${SHOP_PATH}.lastPurchaseAt`]: new Date(),
        [`${SHOP_PATH}.lastItemId`]: item.id,
        [`${SHOP_PATH}.updatedAt`]: new Date(),
      },
      $inc: { [`${SHOP_PATH}.purchases.${item.id}`]: 1 },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return {
    ok: true,
    item,
    spent: item.price,
    currency: item.currency,
    wallet: spent.state,
    message: applied.message,
  };
}

function formatBoostSummary(boosts: Record<string, any> = {}) {
  const lines = [];
  if (Number(boosts.workRewardBonusPct) > 0) lines.push(`💼 Lavoro +${boosts.workRewardBonusPct}%`);
  if (Number(boosts.fixedIncomeStreakBonusPct) > 0) lines.push(`📅 Reddito fisso streak +${boosts.fixedIncomeStreakBonusPct}%`);
  if (Number(boosts.robSuccessUses) > 0 && Number(boosts.robSuccessBonusPct) > 0) {
    lines.push(`🥷 Furto +${boosts.robSuccessBonusPct}% (${boosts.robSuccessUses} uso/i)`);
  }
  if (Number(boosts.gamblePayoutUses) > 0 && Number(boosts.gamblePayoutBonusPct) > 0) {
    lines.push(`🎰 Vincite +${boosts.gamblePayoutBonusPct}% (${boosts.gamblePayoutUses} uso/i)`);
  }
  return lines;
}

async function getShopPanelState(client?, message?, currency = CURRENCY_CAFFE) {
  const access = await svc().assertServerEconomyAccess(message, client);
  if (!access.ok) return access;
  if (!isServerShopEnabled(client)) return { ok: false, message: "Lo shop Vinili & Caffè è disattivato." };
  const cur = currency === CURRENCY_VINILI ? CURRENCY_VINILI : CURRENCY_CAFFE;
  const wallet = await getServerWallet(message.guild.id, message.author.id);
  const boosts = await getActiveBoosts(message.guild.id, message.author.id);
  const protectionMs = remainingMs(
    (await ActivityUserProfile.findOne({ guildId: message.guild.id, userId: message.author.id })
      .select("profile.economy.server.robProtectionUntil")
      .lean()
      .catch(() => null))?.profile?.economy?.server?.robProtectionUntil,
  );
  return {
    ok: true,
    currency: cur,
    balance: Math.max(0, Math.floor(Number(wallet?.[cur]?.balance) || 0)),
    items: listShopItems(cur),
    boosts,
    boostLines: formatBoostSummary(boosts),
    protectionMs,
    wallet,
  };
}

export = {
  applyGamblePayoutBonus,
  applyShopEffect,
  consumeRobSuccessBonus,
  getActiveBoosts,
  getShopPanelState,
  isServerShopEnabled,
  listShopItems,
  peekRobSuccessBonusPct,
  purchaseShopItem,
  shopConfig,
  takeFixedIncomeStreakBonusPct,
  takeWorkRewardBonusPct,
};